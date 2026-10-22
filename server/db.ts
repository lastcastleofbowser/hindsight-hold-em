import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';

/**
 * SQLite database for accounts and game history.
 *
 * Uses sql.js (SQLite compiled to WebAssembly) so it runs on any Node version
 * without native builds. The whole database lives in memory and is written to
 * `file` shortly after every change (atomically: temp file + rename). That's
 * ideal for a small community server; for many concurrent users, swap this
 * class for a client to a server database — the SQL is plain SQLite.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  host_id INTEGER NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  hands_played INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS game_players (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chips INTEGER NOT NULL,
  bought_in INTEGER NOT NULL,
  buy_ins INTEGER NOT NULL,
  hands_played INTEGER NOT NULL DEFAULT 0,
  hands_won REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, user_id)
);
CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);
`;

const FILE_HEADER = Buffer.from('HHDBENC1');
const SQLITE_HEADER = Buffer.from('SQLite format 3\0');
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type Params = SqlValue[];

function encryptDatabase(data: Uint8Array, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([FILE_HEADER, iv, cipher.getAuthTag(), encrypted]);
}

function decryptDatabase(data: Buffer, key: Buffer): { bytes: Buffer; legacy: boolean } {
  if (!data.subarray(0, FILE_HEADER.length).equals(FILE_HEADER)) {
    if (!data.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) throw new Error('Unrecognized account database format; the stored file was not changed.');
    return { bytes: data, legacy: true };
  }
  try {
    const ivStart = FILE_HEADER.length;
    const tagStart = ivStart + IV_BYTES;
    const bodyStart = tagStart + TAG_BYTES;
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(ivStart, tagStart));
    decipher.setAuthTag(data.subarray(tagStart, bodyStart));
    return { bytes: Buffer.concat([decipher.update(data.subarray(bodyStart)), decipher.final()]), legacy: false };
  } catch {
    throw new Error('Cannot decrypt the account database. Check DATA_ENCRYPTION_KEY; the stored file was not changed.');
  }
}

export class Store {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private db: Database,
    private file: string | null,
    private encryptionKey: Buffer | null,
  ) {}

  /** Opens an encrypted database file, or an in-memory database when file is null. */
  static async open(file: string | null, encryptionKey?: Buffer): Promise<Store> {
    if (file && (!encryptionKey || encryptionKey.length !== 32)) {
      throw new Error('A 32-byte DATA_ENCRYPTION_KEY is required for a persistent account database.');
    }
    const SQL = await initSqlJs();
    const stored = file && existsSync(file) ? decryptDatabase(readFileSync(file), encryptionKey!) : null;
    const db = new SQL.Database(stored?.bytes);
    db.run('PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    const columns = db.exec('PRAGMA table_info(users)')[0]?.values ?? [];
    if (!columns.some((column) => column[1] === 'email')) db.run('ALTER TABLE users ADD COLUMN email TEXT');
    if (!columns.some((column) => column[1] === 'email_verified')) db.run('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL');
    const store = new Store(db, file, file ? encryptionKey! : null);
    if (stored?.legacy) store.flush();
    return store;
  }

  run(sql: string, params: Params = []): void {
    this.db.run(sql, params);
    this.scheduleSave();
  }

  /** Runs an INSERT and returns the new row id. */
  insert(sql: string, params: Params = []): number {
    this.db.run(sql, params);
    const id = this.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id;
    this.scheduleSave();
    return id;
  }

  get<T>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  all<T>(sql: string, params: Params = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 200);
  }

  /** Writes the database to disk now (also called on shutdown). */
  flush() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    const data = this.db.export();
    writeFileSync(tmp, this.encryptionKey ? encryptDatabase(data, this.encryptionKey) : data, { mode: 0o600 });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }
}
