import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Store } from './db';

/**
 * Accounts and sessions.
 * - Passwords are hashed with scrypt and a per-user random salt.
 * - Session tokens are 256-bit random values; only their SHA-256 is stored,
 *   so a leaked database doesn't expose usable tokens.
 * - Failed logins are rate-limited per IP address and per username.
 */

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 30;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export interface User {
  id: number;
  username: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class Auth {
  private failures = new Map<string, { count: number; since: number }>();

  constructor(private store: Store) {}

  async register(usernameRaw: unknown, passwordRaw: unknown): Promise<{ user: User; token: string }> {
    const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (!USERNAME_RULE.test(username)) throw new AuthError('Usernames are 3–20 letters, numbers or underscores.');
    if (password.length < MIN_PASSWORD) throw new AuthError(`Passwords need at least ${MIN_PASSWORD} characters.`);
    if (password.length > MAX_PASSWORD) throw new AuthError('That password is too long.');
    if (this.store.get('SELECT id FROM users WHERE username = ?', [username])) throw new AuthError('That username is taken.', 409);
    const id = this.store.insert('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)', [username, await hashPassword(password), Date.now()]);
    const user = { id, username };
    return { user, token: this.createSession(user.id) };
  }

  async login(usernameRaw: unknown, passwordRaw: unknown, ip: string): Promise<{ user: User; token: string }> {
    const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    const keys = [`ip:${ip}`, `user:${username.toLowerCase()}`];
    if (keys.some((k) => this.limited(k))) throw new AuthError('Too many attempts — wait a few minutes and try again.', 429);
    const row = this.store.get<{ id: number; username: string; password_hash: string }>('SELECT id, username, password_hash FROM users WHERE username = ?', [username]);
    // Hash even for unknown usernames so response time doesn't reveal which exist.
    const ok = row ? await verifyPassword(password, row.password_hash) : (await hashPassword(password), false);
    if (!row || !ok) {
      keys.forEach((k) => this.fail(k));
      throw new AuthError('Wrong username or password.', 401);
    }
    keys.forEach((k) => this.failures.delete(k));
    return { user: { id: row.id, username: row.username }, token: this.createSession(row.id) };
  }

  /** Returns the user for a session token, or null if missing/expired. */
  userForToken(token: unknown): User | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const row = this.store.get<{ id: number; username: string; expires_at: number }>(
      'SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
      [sha256(token)],
    );
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.store.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
      return null;
    }
    return { id: row.id, username: row.username };
  }

  logout(token: string) {
    this.store.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
  }

  private createSession(userId: number): string {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.store.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [sha256(token), userId, now, now + SESSION_DAYS * 86400000]);
    this.store.run('DELETE FROM sessions WHERE expires_at < ?', [now]);
    return token;
  }

  private limited(key: string): boolean {
    const f = this.failures.get(key);
    if (!f) return false;
    if (Date.now() - f.since > FAILURE_WINDOW_MS) {
      this.failures.delete(key);
      return false;
    }
    return f.count >= MAX_FAILURES;
  }

  private fail(key: string) {
    const f = this.failures.get(key);
    if (!f || Date.now() - f.since > FAILURE_WINDOW_MS) this.failures.set(key, { count: 1, since: Date.now() });
    else f.count++;
  }
}
