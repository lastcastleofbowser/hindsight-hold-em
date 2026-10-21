import { type Card, FULL_DECK, shuffle } from './cards';
import { evaluateHand, type HandResult } from './evaluator';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];
export const STREET_LABELS: Record<Street, string> = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export type BotStyle = 'tight' | 'balanced' | 'loose' | 'aggressive';

export interface Player {
  id: number;
  name: string;
  isHero: boolean;
  style: BotStyle;
  stack: number;
  hole: Card[];
  /** Chips put in on the current street. */
  committed: number;
  /** Chips put in across the whole hand. */
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last bet/raise on this street. */
  hasActed: boolean;
  lastAction?: string;
}

export interface LoggedAction {
  street: Street;
  playerId: number;
  type: ActionType;
  /** Chips added to the pot by this action. */
  added: number;
  /** Street commitment after the action ("raise to"). */
  to: number;
  potBefore: number;
  toCallBefore: number;
  allIn: boolean;
}

export interface Winner {
  playerId: number;
  amount: number;
  hand?: HandResult;
}

export interface GameState {
  handNumber: number;
  players: Player[];
  deck: Card[];
  board: Card[];
  street: Street;
  buttonIndex: number;
  smallBlind: number;
  bigBlind: number;
  /** Highest street commitment so far. */
  currentBet: number;
  /** Minimum raise increment. */
  minRaise: number;
  raisesThisStreet: number;
  toAct: number;
  log: LoggedAction[];
  finished: boolean;
  /** True when the hand reached a showdown (cards are compared). */
  showdown: boolean;
  winners: Winner[];
  /** Hand result for every player who reached showdown. */
  results: Record<number, HandResult>;
}

export interface SeatConfig {
  name: string;
  isHero: boolean;
  style: BotStyle;
}

export interface NewHandOptions {
  seats: SeatConfig[];
  handNumber: number;
  buttonIndex: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  rng?: () => number;
  /** Optional preset deck order (top of deck first), for tests and replays. */
  deck?: Card[];
}

export const potSize = (s: GameState): number => s.players.reduce((n, p) => n + p.totalCommitted, 0);

export const activePlayers = (s: GameState): Player[] => s.players.filter((p) => !p.folded);

// ---------------------------------------------------------------------------
// Table positions
// ---------------------------------------------------------------------------

export type Position = 'BTN' | 'BTN/SB' | 'SB' | 'BB' | 'UTG' | 'MP' | 'CO';

/** Positions clockwise from the dealer button, by number of players. */
const POSITIONS_BY_SIZE: Record<number, Position[]> = {
  2: ['BTN/SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'],
};

export const POSITION_NAMES: Record<Position, string> = {
  BTN: 'Dealer (button)',
  'BTN/SB': 'Dealer & small blind',
  SB: 'Small blind',
  BB: 'Big blind',
  UTG: 'Under the gun',
  MP: 'Middle position',
  CO: 'Cutoff',
};

/** A seat's position given where the dealer button is. */
export function positionOf(seat: number, buttonIndex: number, players: number): Position {
  const order = POSITIONS_BY_SIZE[players];
  if (!order) throw new Error(`Unsupported table size: ${players}`);
  return order[(seat - buttonIndex + players) % players];
}

const canAct = (p: Player) => !p.folded && !p.allIn;

function nextIndex(s: GameState, from: number, pred: (p: Player) => boolean): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(s.players[i])) return i;
  }
  return -1;
}

function clone(s: GameState): GameState {
  return { ...s, players: s.players.map((p) => ({ ...p, hole: [...p.hole] })), deck: [...s.deck], board: [...s.board], log: [...s.log] };
}

function commit(p: Player, amount: number): number {
  const added = Math.min(amount, p.stack);
  p.stack -= added;
  p.committed += added;
  p.totalCommitted += added;
  if (p.stack === 0) p.allIn = true;
  return added;
}

/**
 * Every hand starts with equal stacks, which guarantees a single main pot
 * (nobody can be all-in for less than anyone else's maximum), so no side pots.
 */
export function newHand(opts: NewHandOptions): GameState {
  const deck = opts.deck ? [...opts.deck] : shuffle([...FULL_DECK], opts.rng);
  const players: Player[] = opts.seats.map((seat, id) => ({
    id,
    name: seat.name,
    isHero: seat.isHero,
    style: seat.style,
    stack: opts.startingStack,
    hole: [],
    committed: 0,
    totalCommitted: 0,
    folded: false,
    allIn: false,
    hasActed: false,
  }));
  const n = players.length;
  for (let round = 0; round < 2; round++) {
    for (let k = 1; k <= n; k++) players[(opts.buttonIndex + k) % n].hole.push(deck.shift()!);
  }

  const state: GameState = {
    handNumber: opts.handNumber,
    players,
    deck,
    board: [],
    street: 'preflop',
    buttonIndex: opts.buttonIndex,
    smallBlind: opts.smallBlind,
    bigBlind: opts.bigBlind,
    currentBet: opts.bigBlind,
    minRaise: opts.bigBlind,
    raisesThisStreet: 0,
    toAct: 0,
    log: [],
    finished: false,
    showdown: false,
    winners: [],
    results: {},
  };

  // Heads-up: the button posts the small blind and acts first pre-flop.
  const sbIndex = n === 2 ? opts.buttonIndex : (opts.buttonIndex + 1) % n;
  const bbIndex = (sbIndex + 1) % n;
  commit(players[sbIndex], opts.smallBlind);
  players[sbIndex].lastAction = `SB ${opts.smallBlind}`;
  commit(players[bbIndex], opts.bigBlind);
  players[bbIndex].lastAction = `BB ${opts.bigBlind}`;
  state.toAct = (bbIndex + 1) % n;
  return state;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  /** Minimum and maximum street commitment ("bet/raise to"). */
  minTo: number;
  maxTo: number;
}

export function legalActions(s: GameState): LegalActions {
  const p = s.players[s.toAct];
  const toCall = Math.max(0, s.currentBet - p.committed);
  const maxTo = p.committed + p.stack;
  const minTo = Math.min(maxTo, s.currentBet === 0 ? s.bigBlind : s.currentBet + s.minRaise);
  const aggressionOpen = maxTo > s.currentBet && othersCanRespond(s, p.id);
  return {
    // Folding when you could check is legal (and a classic leak the coach flags).
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, p.stack),
    canBet: s.currentBet === 0 && aggressionOpen,
    canRaise: s.currentBet > 0 && aggressionOpen,
    minTo,
    maxTo,
  };
}

/** Raising is pointless if nobody else can put more chips in. */
function othersCanRespond(s: GameState, heroId: number): boolean {
  return s.players.some((o) => o.id !== heroId && canAct(o));
}

export interface PlayerAction {
  type: ActionType;
  /** For bet/raise: total street commitment to raise to. */
  to?: number;
}

export function applyAction(prev: GameState, action: PlayerAction): GameState {
  if (prev.finished) return prev;
  const s = clone(prev);
  const p = s.players[s.toAct];
  const legal = legalActions(prev);
  const potBefore = potSize(s);
  const toCallBefore = Math.max(0, s.currentBet - p.committed);
  let type = action.type;
  let added = 0;

  if (type === 'check' && !legal.canCheck) type = 'call';
  if (type === 'call' && !legal.canCall) type = 'check';
  if ((type === 'bet' && !legal.canBet) || (type === 'raise' && !legal.canRaise)) {
    type = legal.canCheck ? 'check' : 'call';
  }

  switch (type) {
    case 'fold':
      p.folded = true;
      p.lastAction = 'Fold';
      break;
    case 'check':
      p.lastAction = 'Check';
      break;
    case 'call':
      added = commit(p, toCallBefore);
      p.lastAction = p.allIn ? `All-in ${p.committed}` : `Call ${added}`;
      break;
    case 'bet':
    case 'raise': {
      const to = Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(action.to ?? legal.minTo)));
      const raiseBy = to - s.currentBet;
      added = commit(p, to - p.committed);
      if (raiseBy >= s.minRaise) s.minRaise = raiseBy;
      if (p.committed > s.currentBet) {
        s.currentBet = p.committed;
        s.raisesThisStreet++;
        // Everyone else must respond to the new bet.
        for (const o of s.players) if (o.id !== p.id) o.hasActed = false;
      }
      p.lastAction = p.allIn ? `All-in ${p.committed}` : `${type === 'bet' ? 'Bet' : 'Raise to'} ${p.committed}`;
      break;
    }
  }
  p.hasActed = true;
  s.log.push({ street: s.street, playerId: p.id, type, added, to: p.committed, potBefore, toCallBefore, allIn: p.allIn });

  return advance(s);
}

function roundComplete(s: GameState): boolean {
  return s.players.every((p) => !canAct(p) || (p.hasActed && p.committed === s.currentBet));
}

function advance(s: GameState): GameState {
  const remaining = activePlayers(s);
  if (remaining.length === 1) return awardUncontested(s, remaining[0]);

  if (!roundComplete(s)) {
    s.toAct = nextIndex(s, s.toAct, canAct);
    return s;
  }

  // Street is over. If at most one player can still act, run the board out.
  const actors = s.players.filter(canAct).length;
  if (s.street === 'river') return runShowdown(s);
  dealNextStreet(s);
  if (actors <= 1) {
    // dealNextStreet mutates s.street, which TypeScript's narrowing can't see.
    while ((s.street as Street) !== 'river') dealNextStreet(s);
    return runShowdown(s);
  }
  s.toAct = nextIndex(s, s.buttonIndex, canAct);
  return s;
}

function dealNextStreet(s: GameState) {
  const next: Record<string, Street> = { preflop: 'flop', flop: 'turn', turn: 'river' };
  s.street = next[s.street];
  s.board.push(...s.deck.splice(0, s.street === 'flop' ? 3 : 1));
  s.currentBet = 0;
  s.minRaise = s.bigBlind;
  s.raisesThisStreet = 0;
  for (const p of s.players) {
    p.committed = 0;
    p.hasActed = false;
    if (!p.folded && !p.allIn) p.lastAction = undefined;
  }
}

function awardUncontested(s: GameState, winner: Player): GameState {
  const pot = potSize(s);
  winner.stack += pot;
  s.winners = [{ playerId: winner.id, amount: pot }];
  s.finished = true;
  s.toAct = -1;
  return s;
}

function runShowdown(s: GameState): GameState {
  const contenders = activePlayers(s);
  let best = -1;
  for (const p of contenders) {
    const result = evaluateHand([...p.hole, ...s.board]);
    s.results[p.id] = result;
    best = Math.max(best, result.score);
  }
  const winners = contenders.filter((p) => s.results[p.id].score === best);
  const pot = potSize(s);
  const share = Math.floor(pot / winners.length);
  let oddChips = pot - share * winners.length;
  // Odd chips go to the first winner left of the button.
  const ordered = [...winners].sort(
    (a, b) => ((a.id - s.buttonIndex + s.players.length - 1) % s.players.length) - ((b.id - s.buttonIndex + s.players.length - 1) % s.players.length),
  );
  s.winners = ordered.map((p) => {
    const amount = share + (oddChips-- > 0 ? 1 : 0);
    p.stack += amount;
    return { playerId: p.id, amount, hand: s.results[p.id] };
  });
  s.showdown = true;
  s.finished = true;
  s.toAct = -1;
  return s;
}

/** Hero's net chips for a finished hand. */
export function netResult(s: GameState, playerId: number): number {
  const p = s.players[playerId];
  const won = s.winners.find((w) => w.playerId === playerId)?.amount ?? 0;
  return won - p.totalCommitted;
}
