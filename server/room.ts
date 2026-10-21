import { randomBytes, randomInt } from 'node:crypto';
import { type GameState, type PlayerAction, applyAction, legalActions, newHand } from '../src/engine/game';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  HIDDEN_CARD,
  type GameView,
  MAX_PLAYERS,
  type MemberView,
  type RoomView,
} from '../src/friends/protocol';

/**
 * One friends' table. The server is the single source of truth: it deals
 * with a cryptographically random shuffle, validates every action with the
 * same engine the app uses, and only ever sends each player their own cards.
 */

export const STARTING_STACK = 1000;
export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;
export const TURN_SECONDS = 45;

interface Member {
  id: string;
  name: string;
  token: string;
  connected: boolean;
  score: number;
  lastSeen: number;
}

export class RoomError extends Error {}

/** Uniform random in [0, 1) from the OS CSPRNG, for shuffling. */
const secureRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

export function makeCode(taken: (code: string) => boolean): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!taken(code)) return code;
  }
}

export class Room {
  readonly code: string;
  hostId = '';
  members: Member[] = [];
  game: GameState | null = null;
  /** Member id for each seat in the current hand. */
  seats: string[] = [];
  turnStartedAt = 0;
  private handCount = 0;
  private scored = -1;

  constructor(code: string) {
    this.code = code;
  }

  /** Adds a player, or reconnects one who presents their token. */
  join(name: string, token?: string): Member {
    const existing = token ? this.members.find((m) => m.token === token) : undefined;
    if (existing) {
      existing.connected = true;
      existing.lastSeen = Date.now();
      return existing;
    }
    if (this.members.length >= MAX_PLAYERS) throw new RoomError(`This table is full (${MAX_PLAYERS} players).`);
    if (this.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) throw new RoomError(`Someone called "${name}" is already at this table.`);
    const member: Member = { id: randomBytes(6).toString('hex'), name, token: randomBytes(16).toString('hex'), connected: true, score: 0, lastSeen: Date.now() };
    this.members.push(member);
    if (!this.hostId) this.hostId = member.id;
    return member;
  }

  disconnect(memberId: string) {
    const m = this.members.find((x) => x.id === memberId);
    if (m) {
      m.connected = false;
      m.lastSeen = Date.now();
    }
  }

  /** Removes a player for good. Mid-hand they are folded when their turn comes. */
  leave(memberId: string) {
    this.members = this.members.filter((m) => m.id !== memberId);
    if (this.hostId === memberId) this.hostId = this.members[0]?.id ?? '';
  }

  get handRunning(): boolean {
    return !!this.game && !this.game.finished;
  }

  deal(byMemberId: string) {
    if (!this.members.some((m) => m.id === byMemberId)) throw new RoomError('You are not at this table.');
    if (this.handRunning) throw new RoomError('A hand is already in progress.');
    const players = this.members.filter((m) => m.connected);
    if (players.length < 2) throw new RoomError('You need at least two connected players to deal.');
    this.handCount++;
    this.seats = players.map((m) => m.id);
    this.game = newHand({
      seats: players.map((m) => ({ name: m.name, isHero: false, style: 'balanced' })),
      handNumber: this.handCount,
      buttonIndex: (this.handCount - 1) % players.length,
      startingStack: STARTING_STACK,
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      rng: secureRandom,
    });
    this.turnStartedAt = Date.now();
    this.skipAbsentPlayers();
  }

  act(memberId: string, hand: number, action: PlayerAction) {
    const g = this.game;
    if (!g || g.finished) throw new RoomError('There is no hand in progress.');
    if (hand !== g.handNumber) throw new RoomError('That action was for an earlier hand.');
    if (this.seats[g.toAct] !== memberId) throw new RoomError("It isn't your turn.");
    this.apply(validated(g, action));
  }

  /** Auto-acts for a player who ran out of time: check if free, otherwise fold. */
  timeOut() {
    const g = this.game;
    if (!g || g.finished) return;
    this.apply({ type: legalActions(g).canCheck ? 'check' : 'fold' });
  }

  private apply(action: PlayerAction) {
    this.game = applyAction(this.game!, action);
    this.turnStartedAt = Date.now();
    this.skipAbsentPlayers();
    this.recordScore();
  }

  /** Re-checks the table after someone disconnects or leaves. */
  refresh() {
    if (this.handRunning) this.skipAbsentPlayers();
  }

  /** Players who left or disconnected are checked/folded automatically. */
  private skipAbsentPlayers() {
    let g = this.game!;
    while (!g.finished) {
      const member = this.members.find((m) => m.id === this.seats[g.toAct]);
      if (member?.connected) break;
      g = applyAction(g, { type: legalActions(g).canCheck ? 'check' : 'fold' });
    }
    this.game = g;
    this.recordScore();
  }

  private recordScore() {
    const g = this.game;
    if (!g?.finished || this.scored === g.handNumber) return;
    this.scored = g.handNumber;
    const share = 1 / g.winners.length;
    for (const w of g.winners) {
      const member = this.members.find((m) => m.id === this.seats[w.playerId]);
      if (member) member.score += share;
    }
  }

  secondsLeft(): number | null {
    if (!this.handRunning) return null;
    return Math.max(0, Math.ceil(TURN_SECONDS - (Date.now() - this.turnStartedAt) / 1000));
  }

  /** What one member is allowed to see. */
  viewFor(memberId: string): RoomView {
    const members: MemberView[] = this.members.map((m) => ({ id: m.id, name: m.name, connected: m.connected, score: m.score }));
    let game: GameView | null = null;
    if (this.game) {
      const g = this.game;
      game = {
        ...g,
        deck: [],
        players: g.players.map((p, seat) => {
          const mine = this.seats[seat] === memberId;
          return { ...p, isHero: mine, hole: mine || g.finished ? [...p.hole] : p.hole.map(() => HIDDEN_CARD) };
        }),
        // Hand results of players still hidden must not leak before showdown.
        results: g.finished ? g.results : {},
      };
    }
    return { code: this.code, hostId: this.hostId, youId: memberId, members, seats: [...this.seats], game, turnSeconds: this.secondsLeft() };
  }

  get empty(): boolean {
    return this.members.every((m) => !m.connected);
  }

  lastActivity(): number {
    return Math.max(this.turnStartedAt, ...this.members.map((m) => m.lastSeen));
  }
}

/** Rejects malformed actions; bet sizes are clamped to what's legal. */
function validated(g: GameState, raw: PlayerAction): PlayerAction {
  const types = ['fold', 'check', 'call', 'bet', 'raise'];
  if (!raw || typeof raw !== 'object' || !types.includes(raw.type)) throw new RoomError('Unknown action.');
  const legal = legalActions(g);
  if (raw.type === 'check' && !legal.canCheck) throw new RoomError('You can’t check — there is a bet to call.');
  if (raw.type === 'call' && !legal.canCall) throw new RoomError('There is nothing to call.');
  if (raw.type === 'bet' && !legal.canBet) throw new RoomError('You can’t bet now.');
  if (raw.type === 'raise' && !legal.canRaise) throw new RoomError('You can’t raise now.');
  if (raw.type === 'bet' || raw.type === 'raise') {
    const to = Number(raw.to);
    if (!Number.isFinite(to)) throw new RoomError('Invalid bet size.');
    return { type: raw.type, to: Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(to))) };
  }
  return { type: raw.type };
}
