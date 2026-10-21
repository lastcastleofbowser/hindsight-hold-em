import type { Profile, ProfileGame } from '../src/friends/protocol';
import type { Store } from './db';
import type { Member } from './room';

/**
 * Saved friends' games: one row per table session, one per player in it,
 * and an event log of buy-ins, rebuys and departures. Player rows are
 * updated after every hand, so nothing is lost if the server stops.
 */
export class History {
  constructor(private store: Store) {}

  startGame(code: string, hostUserId: number): number {
    return this.store.insert('INSERT INTO games (code, host_id, started_at) VALUES (?, ?, ?)', [code, hostUserId, Date.now()]);
  }

  savePlayer(gameId: number, m: Member) {
    this.store.run(
      `INSERT INTO game_players (game_id, user_id, chips, bought_in, buy_ins, hands_played, hands_won, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id, user_id) DO UPDATE SET
         chips = excluded.chips, bought_in = excluded.bought_in, buy_ins = excluded.buy_ins,
         hands_played = excluded.hands_played, hands_won = excluded.hands_won, updated_at = excluded.updated_at`,
      [gameId, m.userId, m.chips, m.boughtIn, m.buyIns, m.handsPlayed, m.handsWon, Date.now()],
    );
  }

  saveHands(gameId: number, handsPlayed: number) {
    this.store.run('UPDATE games SET hands_played = ? WHERE id = ?', [handsPlayed, gameId]);
  }

  logEvent(gameId: number, userId: number, kind: 'buy-in' | 'rebuy' | 'leave', amount: number) {
    this.store.run('INSERT INTO game_events (game_id, user_id, kind, amount, at) VALUES (?, ?, ?, ?, ?)', [gameId, userId, kind, amount, Date.now()]);
  }

  endGame(gameId: number) {
    this.store.run('UPDATE games SET ended_at = ? WHERE id = ? AND ended_at IS NULL', [Date.now(), gameId]);
  }

  /** Close games left open by a server restart. */
  closeStaleGames() {
    this.store.run('UPDATE games SET ended_at = started_at WHERE ended_at IS NULL');
  }

  profile(userId: number): Profile | null {
    const user = this.store.get<{ username: string; created_at: number }>('SELECT username, created_at FROM users WHERE id = ?', [userId]);
    if (!user) return null;
    type Row = {
      id: number;
      code: string;
      started_at: number;
      ended_at: number | null;
      chips: number;
      bought_in: number;
      buy_ins: number;
      hands_played: number;
      hands_won: number;
    };
    const rows = this.store.all<Row>(
      `SELECT g.id, g.code, g.started_at, g.ended_at, p.chips, p.bought_in, p.buy_ins, p.hands_played, p.hands_won
       FROM game_players p JOIN games g ON g.id = p.game_id
       WHERE p.user_id = ? AND p.hands_played > 0
       ORDER BY g.started_at DESC`,
      [userId],
    );
    const games: ProfileGame[] = rows.slice(0, 50).map((r) => ({
      id: r.id,
      code: r.code,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      chips: r.chips,
      boughtIn: r.bought_in,
      net: r.chips - r.bought_in,
      buyIns: r.buy_ins,
      handsPlayed: r.hands_played,
      handsWon: r.hands_won,
      players: this.store
        .all<{ username: string; net: number }>(
          `SELECT u.username, p.chips - p.bought_in AS net FROM game_players p JOIN users u ON u.id = p.user_id
           WHERE p.game_id = ? ORDER BY net DESC`,
          [r.id],
        )
        .map((p) => ({ username: p.username, net: p.net })),
    }));
    const nets = rows.map((r) => r.chips - r.bought_in);
    let cumulative = 0;
    const progression = [...rows].reverse().map((r) => {
      cumulative += r.chips - r.bought_in;
      return { gameId: r.id, at: r.started_at, net: r.chips - r.bought_in, cumulative };
    });
    return {
      username: user.username,
      memberSince: user.created_at,
      totals: {
        games: rows.length,
        handsPlayed: rows.reduce((n, r) => n + r.hands_played, 0),
        handsWon: rows.reduce((n, r) => n + r.hands_won, 0),
        net: nets.reduce((a, b) => a + b, 0),
        buyIns: rows.reduce((n, r) => n + r.buy_ins, 0),
        bestGame: nets.length ? Math.max(...nets) : null,
        worstGame: nets.length ? Math.min(...nets) : null,
      },
      games,
      progression,
    };
  }
}
