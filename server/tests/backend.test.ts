import { describe, expect, it } from 'vitest';
import { Auth, hashPassword, verifyPassword } from '../auth';
import { Store } from '../db';
import { History } from '../history';
import { BUY_IN, Room } from '../room';

async function backend() {
  const store = await Store.open(null);
  return { store, auth: new Auth(store), history: new History(store) };
}

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
    const { user, token } = await auth.register('Liam_1', 'password123');
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
    await expect(auth.register('a', 'password123')).rejects.toThrow(/3–20/);
    await expect(auth.register('bad name!', 'password123')).rejects.toThrow(/3–20/);
    await expect(auth.register('Priya', 'short')).rejects.toThrow(/at least 8/);
    await auth.register('Priya', 'password123');
    await expect(auth.register('PRIYA', 'password123')).rejects.toThrow(/taken/);
    await expect(auth.login('Priya', 'nope-nope', '1.1.1.1')).rejects.toThrow(/Wrong username or password/);
    await expect(auth.login('Nobody', 'nope-nope', '1.1.1.1')).rejects.toThrow(/Wrong username or password/);
  });

  it('rate-limits repeated failed logins', async () => {
    const { auth } = await backend();
    await auth.register('Sam', 'password123');
    for (let i = 0; i < 10; i++) await expect(auth.login('Sam', 'bad-password', '9.9.9.9')).rejects.toThrow();
    await expect(auth.login('Sam', 'password123', '9.9.9.9')).rejects.toThrow(/Too many attempts/);
  });
});

describe('saved game history', () => {
  it('records chips, buy-ins and hands, and builds a profile with progress', async () => {
    const { auth, history } = await backend();
    const liam = (await auth.register('Liam', 'password123')).user;
    const priya = (await auth.register('Priya', 'password123')).user;

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
