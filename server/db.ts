import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
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
`;

export type Params = SqlValue[];

export class Store {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private db: Database,
    private file: string | null,
  ) {}

  /** Opens (or creates) the database file. Pass null for an in-memory database (tests). */
  static async open(file: string | null): Promise<Store> {
    const SQL = await initSqlJs();
    const data = file && existsSync(file) ? readFileSync(file) : undefined;
    const db = new SQL.Database(data);
    db.run('PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    return new Store(db, file);
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
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, this.db.export());
    renameSync(tmp, this.file);
  }
}
