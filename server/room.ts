import { randomInt } from 'node:crypto';
import { type GameState, type PlayerAction, applyAction, legalActions, newHand } from '../src/engine/game';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  HIDDEN_CARD,
  type GameView,
  MAX_PLAYERS,
  type MemberView,
  type RoomView,
  type TableEvent,
} from '../src/friends/protocol';

/**
 * One friends' table. The server is the single source of truth: it deals
 * with a cryptographically random shuffle, validates every action with the
 * same engine the app uses, and only ever sends each player their own cards.
 *
 * Chips carry over from hand to hand. Players who run out can buy back in;
 * every buy-in is recorded so the scoreboard shows real winnings and losses.
 */

export const BUY_IN = 1000;
export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;
export const TURN_SECONDS = 45;
const MAX_EVENTS = 50;

export interface Member {
  id: string;
  userId: number;
  name: string;
  connected: boolean;
  left: boolean;
  chips: number;
  boughtIn: number;
  buyIns: number;
  handsWon: number;
  handsPlayed: number;
  lastSeen: number;
}

/** Persistence callbacks (the server saves to the database; tests can ignore them). */
export interface RoomHooks {
  handFinished?(room: Room): void;
  buyIn?(room: Room, member: Member, kind: 'buy-in' | 'rebuy'): void;
  left?(room: Room, member: Member): void;
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
  /** Database id of this table's game record, once saved. */
  gameId: number | null = null;
  hostId = '';
  members: Member[] = [];
  game: GameState | null = null;
  /** Member id for each seat in the current hand. */
  seats: string[] = [];
  events: TableEvent[] = [];
  turnStartedAt = 0;
  handsDealt = 0;
  private settled = -1;

  constructor(
    code: string,
    private hooks: RoomHooks = {},
  ) {
    this.code = code;
  }

  private get active() {
    return this.members.filter((m) => !m.left);
  }

  private log(text: string) {
    this.events.push({ at: Date.now(), text });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  /** Seats a logged-in user, or reconnects them if they're already at the table. */
  join(user: { id: number; username: string }): Member {
    const existing = this.members.find((m) => m.userId === user.id);
    if (existing && !existing.left) {
      existing.connected = true;
      existing.lastSeen = Date.now();
      return existing;
    }
    if (this.active.length >= MAX_PLAYERS) throw new RoomError(`This table is full (${MAX_PLAYERS} players).`);
    let member: Member;
    if (existing) {
      // Coming back after leaving: same chips as when they left (buy back in if that was 0).
      member = existing;
      Object.assign(member, { left: false, connected: true, lastSeen: Date.now() });
      this.log(`${member.name} came back with ${member.chips} chips.`);
    } else {
      member = {
        id: String(user.id),
        userId: user.id,
        name: user.username,
        connected: true,
        left: false,
        chips: BUY_IN,
        boughtIn: BUY_IN,
        buyIns: 1,
        handsWon: 0,
        handsPlayed: 0,
        lastSeen: Date.now(),
      };
      this.members.push(member);
      this.log(`${member.name} joined and bought in for ${BUY_IN}.`);
      this.hooks.buyIn?.(this, member, 'buy-in');
    }
    if (!this.hostId || !this.active.some((m) => m.id === this.hostId)) this.hostId = member.id;
    return member;
  }

  disconnect(memberId: string) {
    const m = this.members.find((x) => x.id === memberId);
    if (m) {
      m.connected = false;
      m.lastSeen = Date.now();
    }
  }

  /** Cashes a player out. Mid-hand they are folded when their turn comes; their final chips are recorded when the hand ends. */
  leave(memberId: string) {
    const m = this.members.find((x) => x.id === memberId && !x.left);
    if (!m) return;
    m.left = true;
    m.connected = false;
    this.log(`${m.name} left the table with ${m.chips} chips (${m.chips - m.boughtIn >= 0 ? '+' : ''}${m.chips - m.boughtIn}).`);
    if (this.hostId === memberId) this.hostId = this.active[0]?.id ?? '';
    this.refresh();
    this.hooks.left?.(this, m);
  }

  /** Buys back in after running out of chips. */
  rebuy(memberId: string) {
    const m = this.members.find((x) => x.id === memberId && !x.left);
    if (!m) throw new RoomError('You are not at this table.');
    if (m.chips > 0) throw new RoomError('You can only buy back in when you have run out of chips.');
    if (this.handRunning && this.seats.includes(memberId)) throw new RoomError('Wait for this hand to finish.');
    m.chips = BUY_IN;
    m.boughtIn += BUY_IN;
    m.buyIns++;
    this.log(`${m.name} bought back in for ${BUY_IN} (buy-in #${m.buyIns}).`);
    this.hooks.buyIn?.(this, m, 'rebuy');
  }

  get handRunning(): boolean {
    return !!this.game && !this.game.finished;
  }

  deal(byMemberId: string) {
    const by = this.members.find((m) => m.id === byMemberId && !m.left);
    if (!by) throw new RoomError('You are not at this table.');
    if (this.handsDealt === 0 && byMemberId !== this.hostId) {
      throw new RoomError(`Only the host (${this.members.find((m) => m.id === this.hostId)?.name}) can deal the first hand.`);
    }
    if (this.handRunning) throw new RoomError('A hand is already in progress.');
    const players = this.active.filter((m) => m.connected && m.chips > 0);
    if (players.length < 2) throw new RoomError('You need at least two connected players with chips to deal.');
    this.handsDealt++;
    this.seats = players.map((m) => m.id);
    this.game = newHand({
      seats: players.map((m) => ({ name: m.name, isHero: false, style: 'balanced' })),
      handNumber: this.handsDealt,
      buttonIndex: (this.handsDealt - 1) % players.length,
      startingStack: BUY_IN,
      stacks: players.map((m) => m.chips),
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

  /** Re-checks the table after someone disconnects or leaves. */
  refresh() {
    if (this.handRunning) this.skipAbsentPlayers();
  }

  private apply(action: PlayerAction) {
    this.game = applyAction(this.game!, action);
    this.turnStartedAt = Date.now();
    this.skipAbsentPlayers();
  }

  /** Players who left or disconnected are checked/folded automatically. */
  private skipAbsentPlayers() {
    let g = this.game!;
    while (!g.finished) {
      const member = this.members.find((m) => m.id === this.seats[g.toAct]);
      if (member?.connected && !member.left) break;
      g = applyAction(g, { type: legalActions(g).canCheck ? 'check' : 'fold' });
    }
    this.game = g;
    this.settle();
  }

  /** When a hand ends: carry chips over, count hands played and won, then save. */
  private settle() {
    const g = this.game;
    if (!g?.finished || this.settled === g.handNumber) return;
    this.settled = g.handNumber;
    g.players.forEach((p, seat) => {
      const m = this.members.find((x) => x.id === this.seats[seat]);
      if (!m) return;
      m.chips = p.stack;
      m.handsPlayed++;
    });
    // "Won the hand" = had the best hand at showdown (or everyone else folded), not just a side pot.
    let handWinners: number[];
    if (g.showdown) {
      const best = Math.max(...Object.values(g.results).map((r) => r.score));
      handWinners = Object.entries(g.results)
        .filter(([, r]) => r.score === best)
        .map(([id]) => Number(id));
    } else handWinners = [g.winners[0].playerId];
    for (const seat of handWinners) {
      const m = this.members.find((x) => x.id === this.seats[seat]);
      if (m) m.handsWon += 1 / handWinners.length;
    }
    for (const m of this.active) if (m.chips === 0 && this.seats.includes(m.id)) this.log(`${m.name} is out of chips.`);
    this.hooks.handFinished?.(this);
  }

  secondsLeft(): number | null {
    if (!this.handRunning) return null;
    return Math.max(0, Math.ceil(TURN_SECONDS - (Date.now() - this.turnStartedAt) / 1000));
  }

  /** What one member is allowed to see. */
  viewFor(memberId: string): RoomView {
    const members: MemberView[] = this.members.map((m) => ({
      id: m.id,
      name: m.name,
      connected: m.connected,
      left: m.left,
      chips: m.chips,
      boughtIn: m.boughtIn,
      buyIns: m.buyIns,
      net: m.chips - m.boughtIn,
      handsWon: m.handsWon,
      handsPlayed: m.handsPlayed,
    }));
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
    return {
      code: this.code,
      hostId: this.hostId,
      hostName: this.members.find((m) => m.id === this.hostId)?.name ?? '',
      youId: memberId,
      members,
      seats: [...this.seats],
      game,
      turnSeconds: this.secondsLeft(),
      handsDealt: this.handsDealt,
      buyIn: BUY_IN,
      bigBlind: BIG_BLIND,
      events: this.events.slice(-20),
    };
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
