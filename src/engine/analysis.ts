import { type Card, rankOf, suitOf, remainingDeck, RANK_CHARS } from './cards';
import { Category, CATEGORY_COUNT, CATEGORY_NAMES, evaluate, evaluateHand, describeScore, categoryOf, type HandResult } from './evaluator';

// ---------------------------------------------------------------------------
// Equity
// ---------------------------------------------------------------------------

export interface EquityInput {
  hero: readonly Card[];
  board: readonly Card[];
  /** Number of opponents still in the hand. */
  opponents: number;
  /**
   * Optional actual opponent holdings (hindsight mode). Entries that are null
   * are treated as unknown random hands. Length should equal `opponents`.
   */
  knownOpponents?: ReadonlyArray<readonly Card[] | null>;
  /**
   * Restricts unknown opponents to plausible holdings (e.g. hands that would
   * bet this board). Holdings are re-drawn until the filter accepts them.
   */
  opponentFilter?: (a: Card, b: Card) => boolean;
  /** Per-opponent filters (index = unknown opponent); falls back to `opponentFilter`. */
  opponentFilters?: ReadonlyArray<((a: Card, b: Card) => boolean) | undefined>;
  iterations?: number;
  rng?: () => number;
}

export interface EquityResult {
  /** Probability hero wins outright. */
  win: number;
  /** Probability hero ties for the best hand. */
  tie: number;
  /** Win + share of ties: hero's expected fraction of the pot. */
  equity: number;
  /** Probability hero finishes (by the river) with each hand category. */
  finalCategoryOdds: number[];
  iterations: number;
  exact: boolean;
}

/**
 * Hero's equity against `opponents` hands. Uses exhaustive enumeration when
 * every opponent is known and at most two board cards are missing; otherwise
 * Monte Carlo simulation.
 */
export function calculateEquity(input: EquityInput): EquityResult {
  const { hero, board, opponents } = input;
  const rng = input.rng ?? Math.random;
  const known = input.knownOpponents ?? [];
  const knownHands: Card[][] = [];
  let unknownCount = 0;
  for (let i = 0; i < opponents; i++) {
    const h = known[i];
    if (h && h.length === 2) knownHands.push([...h]);
    else unknownCount++;
  }

  const dead = [...hero, ...board, ...knownHands.flat()];
  const deck = remainingDeck(dead);
  const missingBoard = 5 - board.length;
  const categoryCounts = new Array(CATEGORY_COUNT).fill(0);

  const heroCards = new Int32Array(7);
  const oppCards = new Int32Array(7);
  heroCards[0] = hero[0];
  heroCards[1] = hero[1];
  for (let i = 0; i < board.length; i++) heroCards[2 + i] = board[i];

  let wins = 0;
  let ties = 0;
  let equity = 0;
  let trials = 0;

  // Scores a completed runout. `runout` holds the missing board cards
  // followed by 2 cards per unknown opponent.
  const scoreTrial = (runout: ArrayLike<Card>) => {
    for (let i = 0; i < missingBoard; i++) heroCards[2 + board.length + i] = runout[i];
    const heroScore = evaluate(heroCards, 7);
    categoryCounts[heroScore >> 20]++;
    for (let i = 0; i < 5; i++) oppCards[2 + i] = heroCards[2 + i];

    let best = heroScore;
    let heroBest = true;
    let tiedWith = 0;
    let next = missingBoard;
    for (let o = 0; o < opponents; o++) {
      if (o < knownHands.length) {
        oppCards[0] = knownHands[o][0];
        oppCards[1] = knownHands[o][1];
      } else {
        oppCards[0] = runout[next++];
        oppCards[1] = runout[next++];
      }
      const s = evaluate(oppCards, 7);
      if (s > best) {
        best = s;
        heroBest = false;
        tiedWith = 0;
      } else if (s === best && heroBest) {
        tiedWith++;
      }
    }
    trials++;
    if (heroBest) {
      if (tiedWith === 0) {
        wins++;
        equity += 1;
      } else {
        ties++;
        equity += 1 / (tiedWith + 1);
      }
    }
  };

  const exact = unknownCount === 0 && missingBoard <= 2;
  if (exact) {
    const runout = new Int32Array(2);
    if (missingBoard === 0) scoreTrial(runout);
    else if (missingBoard === 1) {
      for (const c of deck) {
        runout[0] = c;
        scoreTrial(runout);
      }
    } else {
      for (let a = 0; a < deck.length; a++)
        for (let b = a + 1; b < deck.length; b++) {
          runout[0] = deck[a];
          runout[1] = deck[b];
          scoreTrial(runout);
        }
    }
  } else {
    const iterations = input.iterations ?? 8000;
    const filters = Array.from({ length: unknownCount }, (_, o) => input.opponentFilters?.[o] ?? input.opponentFilter);
    const pool = Int32Array.from(deck);
    const runout = new Int32Array(missingBoard + unknownCount * 2);
    // Partial Fisher–Yates: positions [0, next) are dealt, the rest is the live deck.
    let next = 0;
    const draw = () => {
      const j = next + Math.floor(rng() * (pool.length - next));
      const t = pool[next];
      pool[next] = pool[j];
      pool[j] = t;
      return pool[next++];
    };
    for (let it = 0; it < iterations; it++) {
      next = 0;
      for (let o = 0; o < unknownCount; o++) {
        let a = draw();
        let b = draw();
        const filter = filters[o];
        for (let tries = 0; filter && !filter(a, b) && tries < 40; tries++) {
          next -= 2; // return both cards to the live deck and redraw
          a = draw();
          b = draw();
        }
        runout[missingBoard + o * 2] = a;
        runout[missingBoard + o * 2 + 1] = b;
      }
      for (let i = 0; i < missingBoard; i++) runout[i] = draw();
      scoreTrial(runout);
    }
  }

  return {
    win: wins / trials,
    tie: ties / trials,
    equity: equity / trials,
    finalCategoryOdds: categoryCounts.map((c) => c / trials),
    iterations: trials,
    exact,
  };
}

/**
 * A simple model of the hands a player bets with after the flop: top pair
 * or an overpair, two pair or better (using a hole card), or — before the
 * river — a flush or straight draw. Used to judge spots where hero faces a
 * bet, because a bettor's range is much stronger than "any two cards".
 */
export function bettingRange(board: readonly Card[]): (a: Card, b: Card) => boolean {
  const boardCategory = categoryOf(evaluate(board));
  const topRank = Math.max(...board.map(rankOf));
  const suitCounts = [0, 0, 0, 0];
  let boardMask = 0;
  for (const c of board) {
    suitCounts[c & 3]++;
    boardMask |= 1 << (c >> 2);
  }
  const drawsLive = board.length < 5;
  const cards = [0, 0, ...board];
  // Ace-low-aware 14-bit rank mask: bit 0 is the ace playing low.
  const lowAce = (m: number) => (m << 1) | ((m >> 12) & 1);
  return (a, b) => {
    cards[0] = a;
    cards[1] = b;
    const score = evaluate(cards);
    const category = categoryOf(score);
    if (category > boardCategory) {
      // A lone pair only counts as top pair or an overpair; anything stronger always counts.
      if (category !== Category.Pair || ((score >> 16) & 0xf) >= topRank) return true;
    }
    if (!drawsLive) return false;
    const sa = a & 3;
    const sb = b & 3;
    if (sa === sb ? suitCounts[sa] >= 2 : suitCounts[sa] >= 3 || suitCounts[sb] >= 3) return true;
    const holeBits = lowAce((1 << (a >> 2)) | (1 << (b >> 2)));
    const all = lowAce(boardMask) | holeBits;
    for (let low = 0; low <= 9; low++) {
      const window = (all >> low) & 0x1f;
      if ((holeBits >> low) & 0x1f && popcount5(window) >= 4) return true;
    }
    return false;
  };
}

const popcount5 = (w: number) => (w & 1) + ((w >> 1) & 1) + ((w >> 2) & 1) + ((w >> 3) & 1) + ((w >> 4) & 1);

// ---------------------------------------------------------------------------
// Threats: how often does a single random opponent hold a better hand *right now*?
// ---------------------------------------------------------------------------

export interface ThreatGroup {
  category: Category;
  name: string;
  combos: number;
}

export interface ThreatReport {
  hero: HandResult;
  /** Opponent two-card combos possible given what hero can see. */
  totalCombos: number;
  beatCombos: number;
  tieCombos: number;
  /** P(a single random opponent currently beats hero). */
  pBeatOne: number;
  /**
   * P(at least one of N opponents currently beats hero). Treats opponents as
   * independent, which slightly overstates the risk (card removal ignored).
   */
  pBeatAny: number;
  /** Which hands beat hero, grouped by category, strongest first. */
  byCategory: ThreatGroup[];
}

export function analyseThreats(hero: readonly Card[], board: readonly Card[], opponents: number): ThreatReport | null {
  if (board.length < 3) return null;
  const heroResult = evaluateHand([...hero, ...board]);
  const deck = remainingDeck([...hero, ...board]);
  const cards = [0, 0, ...board];
  const counts = new Map<Category, number>();
  let total = 0;
  let beat = 0;
  let tie = 0;
  for (let a = 0; a < deck.length; a++) {
    for (let b = a + 1; b < deck.length; b++) {
      cards[0] = deck[a];
      cards[1] = deck[b];
      const s = evaluate(cards);
      total++;
      if (s > heroResult.score) {
        beat++;
        const cat = categoryOf(s);
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      } else if (s === heroResult.score) tie++;
    }
  }
  const pBeatOne = beat / total;
  const byCategory = [...counts.entries()]
    .sort((x, y) => y[0] - x[0])
    .map(([category, combos]) => ({ category, name: CATEGORY_NAMES[category], combos }));
  return {
    hero: heroResult,
    totalCombos: total,
    beatCombos: beat,
    tieCombos: tie,
    pBeatOne,
    pBeatAny: 1 - Math.pow(1 - pBeatOne, Math.max(1, opponents)),
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// The nuts: the best hand anyone could hold on this board.
// ---------------------------------------------------------------------------

export interface NutsInfo {
  score: number;
  name: string;
  /** One example holding that makes the nuts. */
  example: Card[];
  /** How many two-card holdings make the nuts. */
  combos: number;
}

export function findNuts(board: readonly Card[]): NutsInfo | null {
  if (board.length < 3) return null;
  const deck = remainingDeck(board);
  const cards = [0, 0, ...board];
  let best = -1;
  let combos = 0;
  let example: Card[] = [];
  for (let a = 0; a < deck.length; a++) {
    for (let b = a + 1; b < deck.length; b++) {
      cards[0] = deck[a];
      cards[1] = deck[b];
      const s = evaluate(cards);
      if (s > best) {
        best = s;
        combos = 1;
        example = [deck[a], deck[b]];
      } else if (s === best) combos++;
    }
  }
  return { score: best, name: describeScore(best), example, combos };
}

// ---------------------------------------------------------------------------
// Outs: unseen cards that improve hero to a stronger hand category.
// ---------------------------------------------------------------------------

export interface OutsGroup {
  category: Category;
  name: string;
  cards: Card[];
}

export interface OutsReport {
  total: number;
  groups: OutsGroup[];
  /** Probability of hitting at least one out by the river. */
  hitByRiver: number;
  /** Probability of hitting on the very next card. */
  hitNextCard: number;
}

/**
 * Counts cards that lift hero into a higher category where the improvement
 * uses hero's hole cards. A card that just pairs the board for everyone is
 * not an out, and neither is making a pair below the board's top card
 * (a weak pair rarely wins a contested pot).
 */
export function countOuts(hero: readonly Card[], board: readonly Card[]): OutsReport | null {
  if (board.length < 3 || board.length > 4) return null;
  const current = categoryOf(evaluate([...hero, ...board]));
  const unseen = remainingDeck([...hero, ...board]);
  const topBoardRank = Math.max(...board.map(rankOf));
  const groups = new Map<Category, Card[]>();
  for (const c of unseen) {
    const nextBoard = [...board, c];
    const score = evaluate([...hero, ...nextBoard]);
    const cat = categoryOf(score);
    const boardCat = categoryOf(evaluate(nextBoard));
    const weakPair = cat === Category.Pair && ((score >> 16) & 0xf) < Math.max(topBoardRank, rankOf(c));
    if (cat > current && cat > boardCat && !weakPair) {
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(c);
    }
  }
  const total = [...groups.values()].reduce((n, g) => n + g.length, 0);
  const left = unseen.length;
  const hitNextCard = total / left;
  const hitByRiver =
    board.length === 3 ? 1 - ((left - total) * (left - total - 1)) / (left * (left - 1)) : hitNextCard;
  return {
    total,
    groups: [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([category, cards]) => ({ category, name: CATEGORY_NAMES[category], cards })),
    hitByRiver,
    hitNextCard,
  };
}

// ---------------------------------------------------------------------------
// Pre-flop starting-hand strength (Chen formula).
// ---------------------------------------------------------------------------

export type StartingTier = 'Premium' | 'Strong' | 'Playable' | 'Marginal' | 'Weak';

export interface StartingHandInfo {
  /** e.g. "AKs", "QJo", "77" */
  notation: string;
  chen: number;
  tier: StartingTier;
}

const CHEN_HIGH = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10];

export function startingHand(hero: readonly Card[]): StartingHandInfo {
  const [r1, r2] = [rankOf(hero[0]), rankOf(hero[1])].sort((a, b) => b - a);
  const suited = suitOf(hero[0]) === suitOf(hero[1]);
  const pair = r1 === r2;
  let score = CHEN_HIGH[r1];
  if (pair) score = Math.max(5, score * 2);
  else {
    if (suited) score += 2;
    const gap = r1 - r2 - 1;
    score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && r1 < 10) score += 1;
  }
  const chen = Math.ceil(score);
  const tier: StartingTier =
    chen >= 12 ? 'Premium' : chen >= 9 ? 'Strong' : chen >= 7 ? 'Playable' : chen >= 5 ? 'Marginal' : 'Weak';
  const notation = RANK_CHARS[r1] + RANK_CHARS[r2] + (pair ? '' : suited ? 's' : 'o');
  return { notation, chen, tier };
}

// ---------------------------------------------------------------------------
// Pot odds helpers
// ---------------------------------------------------------------------------

/** Equity needed to break even on a call: call / (pot after calling). */
export function requiredEquity(toCall: number, potBeforeCall: number): number {
  if (toCall <= 0) return 0;
  return toCall / (potBeforeCall + toCall);
}

export const pct = (p: number, digits = 0): string => `${(p * 100).toFixed(digits)}%`;
