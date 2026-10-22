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
const RESET_TOKEN_MS = 30 * 60 * 1000;
const MAX_RESET_REQUESTS = 5;

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;
export const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const RESET_REQUEST_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

export interface PasswordResetMailer {
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
  sendEmailVerification(email: string, verifyUrl: string): Promise<void>;
}

export interface User {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
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
  private resetRequests = new Map<string, { count: number; since: number }>();

  constructor(private store: Store, private mailer?: PasswordResetMailer, private appUrl = 'http://localhost:8787') {}

  async register(usernameRaw: unknown, emailRaw: unknown, passwordRaw: unknown): Promise<{ user: User; token: string }> {
    const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (!USERNAME_RULE.test(username)) throw new AuthError('Usernames are 3–20 letters, numbers or underscores.');
    if (email.length > 254 || !EMAIL_RULE.test(email)) throw new AuthError('Enter a valid email address.');
    if (password.length < MIN_PASSWORD) throw new AuthError(`Passwords need at least ${MIN_PASSWORD} characters.`);
    if (password.length > MAX_PASSWORD) throw new AuthError('That password is too long.');
    if (this.store.get('SELECT id FROM users WHERE username = ?', [username])) throw new AuthError('That username is taken.', 409);
    if (this.store.get('SELECT id FROM users WHERE email = ?', [email])) throw new AuthError('That email address is already registered.', 409);
    const id = this.store.insert('INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)', [username, email, await hashPassword(password), Date.now()]);
    const user = { id, username, email, emailVerified: false };
    await this.sendEmailVerification(id, email);
    return { user, token: this.createSession(user.id) };
  }

  async requestEmailVerification(userId: number, emailRaw: unknown): Promise<string> {
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
    if (email.length > 254 || !EMAIL_RULE.test(email)) throw new AuthError('Enter a valid email address.');
    const key = `verify:${userId}`;
    if (this.resetLimited(key)) return 'If your account needs email verification, a verification link has been sent.';
    this.countResetRequest(key);
    const row = this.store.get<{ email: string | null; email_verified: number }>('SELECT email, email_verified FROM users WHERE id = ?', [userId]);
    if (!row || row.email_verified) return 'If your account needs email verification, a verification link has been sent.';
    const other = this.store.get<{ id: number }>('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
    if (other) throw new AuthError('That email address is already registered.', 409);
    this.store.run('UPDATE users SET email = ? WHERE id = ?', [email, userId]);
    await this.sendEmailVerification(userId, email);
    return 'If your account needs email verification, a verification link has been sent.';
  }

  verifyEmail(tokenRaw: unknown): void {
    const token = typeof tokenRaw === 'string' ? tokenRaw : '';
    const tokenHash = sha256(token);
    const row = this.store.get<{ user_id: number; email: string; expires_at: number }>('SELECT user_id, email, expires_at FROM email_verification_tokens WHERE token_hash = ?', [tokenHash]);
    if (!row || row.expires_at < Date.now()) {
      if (row) this.store.run('DELETE FROM email_verification_tokens WHERE token_hash = ?', [tokenHash]);
      throw new AuthError('This verification link is invalid or expired. Request a new one.');
    }
    this.store.run('UPDATE users SET email_verified = 1 WHERE id = ? AND email = ?', [row.user_id, row.email]);
    this.store.run('DELETE FROM email_verification_tokens WHERE user_id = ?', [row.user_id]);
  }

  async requestPasswordReset(emailRaw: unknown, ip: string): Promise<string> {
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
    const keys = [`ip:${ip}`, `email:${email}`];
    if (keys.some((key) => this.resetLimited(key))) return RESET_REQUEST_MESSAGE;
    keys.forEach((key) => this.countResetRequest(key));
    if (!EMAIL_RULE.test(email) || !this.mailer) return RESET_REQUEST_MESSAGE;

    const user = this.store.get<{ id: number }>('SELECT id FROM users WHERE email = ? AND email_verified = 1', [email]);
    if (!user) return RESET_REQUEST_MESSAGE;

    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.store.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
    this.store.run('DELETE FROM password_reset_tokens WHERE expires_at < ?', [now]);
    this.store.run('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [sha256(token), user.id, now + RESET_TOKEN_MS, now]);
    const resetUrl = new URL('/', this.appUrl);
    resetUrl.searchParams.set('reset', token);
    try {
      await this.mailer.sendPasswordReset(email, resetUrl.toString());
    } catch (err) {
      this.store.run('DELETE FROM password_reset_tokens WHERE token_hash = ?', [sha256(token)]);
      console.error('Password reset email could not be delivered.', err);
    }
    return RESET_REQUEST_MESSAGE;
  }

  async resetPassword(tokenRaw: unknown, passwordRaw: unknown): Promise<void> {
    const token = typeof tokenRaw === 'string' ? tokenRaw : '';
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (password.length < MIN_PASSWORD) throw new AuthError(`Passwords need at least ${MIN_PASSWORD} characters.`);
    if (password.length > MAX_PASSWORD) throw new AuthError('That password is too long.');
    const tokenHash = sha256(token);
    const row = this.store.get<{ user_id: number; expires_at: number }>('SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?', [tokenHash]);
    if (!row || row.expires_at < Date.now()) {
      if (row) this.store.run('DELETE FROM password_reset_tokens WHERE token_hash = ?', [tokenHash]);
      throw new AuthError('This reset link is invalid or expired. Request a new one.');
    }
    this.store.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(password), row.user_id]);
    this.store.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [row.user_id]);
    this.store.run('DELETE FROM sessions WHERE user_id = ?', [row.user_id]);
  }

  async login(usernameRaw: unknown, passwordRaw: unknown, ip: string): Promise<{ user: User; token: string }> {
    const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    const keys = [`ip:${ip}`, `user:${username.toLowerCase()}`];
    if (keys.some((k) => this.limited(k))) throw new AuthError('Too many attempts — wait a few minutes and try again.', 429);
    const row = this.store.get<{ id: number; username: string; email: string | null; password_hash: string; email_verified: number }>('SELECT id, username, email, password_hash, email_verified FROM users WHERE username = ?', [username]);
    // Hash even for unknown usernames so response time doesn't reveal which exist.
    const ok = row ? await verifyPassword(password, row.password_hash) : (await hashPassword(password), false);
    if (!row || !ok) {
      keys.forEach((k) => this.fail(k));
      throw new AuthError('Wrong username or password.', 401);
    }
    keys.forEach((k) => this.failures.delete(k));
    return { user: { id: row.id, username: row.username, email: row.email, emailVerified: Boolean(row.email_verified) }, token: this.createSession(row.id) };
  }

  /** Returns the user for a session token, or null if missing/expired. */
  userForToken(token: unknown): User | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const row = this.store.get<{ id: number; username: string; email: string | null; email_verified: number; expires_at: number }>(
      'SELECT u.id, u.username, u.email, u.email_verified, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
      [sha256(token)],
    );
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.store.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
      return null;
    }
    return { id: row.id, username: row.username, email: row.email, emailVerified: Boolean(row.email_verified) };
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

  private resetLimited(key: string): boolean {
    const request = this.resetRequests.get(key);
    if (!request) return false;
    if (Date.now() - request.since > 60 * 60 * 1000) {
      this.resetRequests.delete(key);
      return false;
    }
    return request.count >= MAX_RESET_REQUESTS;
  }

  private countResetRequest(key: string) {
    const request = this.resetRequests.get(key);
    if (!request || Date.now() - request.since > 60 * 60 * 1000) this.resetRequests.set(key, { count: 1, since: Date.now() });
    else request.count++;
  }

  private async sendEmailVerification(userId: number, email: string) {
    if (!this.mailer) return;
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.store.run('DELETE FROM email_verification_tokens WHERE user_id = ?', [userId]);
    this.store.run('INSERT INTO email_verification_tokens (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', [sha256(token), userId, email, now + 24 * 60 * 60 * 1000, now]);
    const verifyUrl = new URL('/', this.appUrl);
    verifyUrl.searchParams.set('verify', token);
    try {
      await this.mailer.sendEmailVerification(email, verifyUrl.toString());
    } catch (err) {
      this.store.run('DELETE FROM email_verification_tokens WHERE token_hash = ?', [sha256(token)]);
      console.error('Email verification message could not be delivered.', err);
    }
  }
}
