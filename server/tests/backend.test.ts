import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { Auth, hashPassword, verifyPassword } from '../auth';
import { Store } from '../db';
import { History } from '../history';
import { BUY_IN, Room } from '../room';

async function backend() {
  const store = await Store.open(null);
  return { store, auth: new Auth(store), history: new History(store) };
}

describe('encrypted database storage', () => {
  it('encrypts legacy database files, preserves their data, and rejects a wrong key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hindsight-db-'));
    const file = join(dir, 'hindsight.sqlite');
    const key = Buffer.alloc(32, 42);
    const SQL = await initSqlJs();
    const legacy = new SQL.Database();
    legacy.run('CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)');
    legacy.run('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)', ['LegacyUser', 'scrypt$hash', 1]);
    writeFileSync(file, legacy.export());
    legacy.close();

    try {
      await expect(Store.open(file)).rejects.toThrow(/DATA_ENCRYPTION_KEY/);
      const store = await Store.open(file, key);
      const encrypted = readFileSync(file);
      expect(encrypted.subarray(0, 8).toString()).toBe('HHDBENC1');
      expect(encrypted.includes(Buffer.from('LegacyUser'))).toBe(false);
      expect(store.get<{ username: string; email: string | null }>('SELECT username, email FROM users WHERE id = 1')).toEqual({ username: 'LegacyUser', email: null });

      store.run('UPDATE users SET email = ? WHERE id = 1', ['legacy@example.com']);
      store.flush();
      expect(readFileSync(file).includes(Buffer.from('legacy@example.com'))).toBe(false);
      const reopened = await Store.open(file, key);
      expect(reopened.get<{ email: string }>('SELECT email FROM users WHERE id = 1')?.email).toBe('legacy@example.com');
      await expect(Store.open(file, Buffer.alloc(32, 7))).rejects.toThrow(/Cannot decrypt/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('accounts', () => {
  it('hashes passwords with a salt and verifies them', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong horse', a)).toBe(false);
  });

  it('registers, logs in, and resolves sessions; never stores raw tokens', async () => {
    const { store, auth } = await backend();
    const { user, token } = await auth.register('Liam_1', 'liam@example.com', 'password123');
    expect(auth.userForToken(token)).toEqual(user);
    expect(store.get('SELECT token_hash FROM sessions WHERE token_hash = ?', [token])).toBeUndefined();
    const login = await auth.login('liam_1', 'password123', '1.2.3.4'); // usernames are case-insensitive
    expect(login.user.id).toBe(user.id);
    auth.logout(login.token);
    expect(auth.userForToken(login.token)).toBeNull();
    expect(auth.userForToken('not-a-real-token-at-all')).toBeNull();
  });

  it('validates input and rejects duplicates', async () => {
    const { auth } = await backend();
    await expect(auth.register('a', 'priya@example.com', 'password123')).rejects.toThrow(/3–20/);
    await expect(auth.register('bad name!', 'priya@example.com', 'password123')).rejects.toThrow(/3–20/);
    await expect(auth.register('Priya', 'invalid-email', 'password123')).rejects.toThrow(/valid email/);
    await expect(auth.register('Priya', 'priya@example.com', 'short')).rejects.toThrow(/at least 8/);
    await auth.register('Priya', 'priya@example.com', 'password123');
    await expect(auth.register('PRIYA', 'other@example.com', 'password123')).rejects.toThrow(/taken/);
    await expect(auth.register('Other', 'PRIYA@example.com', 'password123')).rejects.toThrow(/email address is already registered/);
    await expect(auth.login('Priya', 'nope-nope', '1.1.1.1')).rejects.toThrow(/Wrong username or password/);
    await expect(auth.login('Nobody', 'nope-nope', '1.1.1.1')).rejects.toThrow(/Wrong username or password/);
  });

  it('rate-limits repeated failed logins', async () => {
    const { auth } = await backend();
    await auth.register('Sam', 'sam@example.com', 'password123');
    for (let i = 0; i < 10; i++) await expect(auth.login('Sam', 'bad-password', '9.9.9.9')).rejects.toThrow();
    await expect(auth.login('Sam', 'password123', '9.9.9.9')).rejects.toThrow(/Too many attempts/);
  });

  it('sends an enumeration-safe, single-use password reset and invalidates sessions', async () => {
    const store = await Store.open(null);
    const delivered: { email: string; url: string }[] = [];
    const verifications: { email: string; url: string }[] = [];
    const auth = new Auth(store, {
      sendPasswordReset: async (email, url) => { delivered.push({ email, url }); },
      sendEmailVerification: async (email, url) => { verifications.push({ email, url }); },
    }, 'https://example.test');
    const { user, token: session } = await auth.register('ResetUser', 'reset@example.com', 'oldpassword');
    expect(verifications).toHaveLength(1);
    const unverifiedMessage = await auth.requestPasswordReset('reset@example.com', '1.2.3.6');
    expect(unverifiedMessage).toContain('If an account exists');
    expect(delivered).toHaveLength(0);
    const verifyToken = new URL(verifications[0].url).searchParams.get('verify')!;
    expect(store.get('SELECT token_hash FROM email_verification_tokens WHERE token_hash = ?', [verifyToken])).toBeUndefined();
    auth.verifyEmail(verifyToken);
    expect(() => auth.verifyEmail(verifyToken)).toThrow(/invalid or expired/);
    const knownMessage = await auth.requestPasswordReset('RESET@example.com', '1.2.3.4');
    const unknownMessage = await auth.requestPasswordReset('missing@example.com', '1.2.3.5');
    expect(knownMessage).toBe(unknownMessage);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].email).toBe('reset@example.com');
    const resetToken = new URL(delivered[0].url).searchParams.get('reset')!;
    expect(store.get('SELECT token_hash FROM password_reset_tokens WHERE token_hash = ?', [resetToken])).toBeUndefined();

    await auth.resetPassword(resetToken, 'newpassword');
    expect(auth.userForToken(session)).toBeNull();
    await expect(auth.login('ResetUser', 'oldpassword', '1.2.3.4')).rejects.toThrow(/Wrong username or password/);
    expect((await auth.login('ResetUser', 'newpassword', '1.2.3.4')).user).toEqual({ ...user, emailVerified: true });
    await expect(auth.resetPassword(resetToken, 'anotherpassword')).rejects.toThrow(/invalid or expired/);
  });
});

describe('saved game history', () => {
  it('records chips, buy-ins and hands, and builds a profile with progress', async () => {
    const { auth, history } = await backend();
    const liam = (await auth.register('Liam', 'liam-history@example.com', 'password123')).user;
    const priya = (await auth.register('Priya', 'priya-history@example.com', 'password123')).user;

    const playGame = () => {
      const room = new Room('XYZ234', {
        handFinished: (r) => r.members.forEach((m) => history.savePlayer(r.gameId!, m)),
        buyIn: (r, m, kind) => {
          history.logEvent(r.gameId!, m.userId, kind, BUY_IN);
          history.savePlayer(r.gameId!, m);
        },
      });
      room.gameId = history.startGame(room.code, liam.id);
      const a = room.join(liam);
      room.join(priya);
      room.deal(a.id);
      const g = room.game!;
      room.act(room.seats[g.toAct], g.handNumber, { type: 'fold' });
      history.endGame(room.gameId);
      return room;
    };
    const first = playGame();
    playGame();

    const profile = history.profile(liam.id)!;
    expect(profile.username).toBe('Liam');
    expect(profile.totals.games).toBe(2);
    expect(profile.totals.handsPlayed).toBe(2);
    expect(profile.totals.buyIns).toBe(2);
    const liamNetFirst = first.members.find((m) => m.userId === liam.id)!;
    expect(profile.games[1].net).toBe(liamNetFirst.chips - liamNetFirst.boughtIn);
    expect(profile.games[0].players.map((p) => p.username).sort()).toEqual(['Liam', 'Priya']);
    expect(profile.progression).toHaveLength(2);
    expect(profile.progression[1].cumulative).toBe(profile.totals.net);
    // Zero-sum: Liam's and Priya's results cancel out.
    expect(profile.totals.net + history.profile(priya.id)!.totals.net).toBe(0);
  });
});
