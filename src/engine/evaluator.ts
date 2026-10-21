import { type Card, RANK_NAMES, RANK_PLURALS } from './cards';

/**
 * Hand categories, weakest to strongest. The numeric value is the top bits
 * of every score, so comparing two scores compares two hands.
 */
export enum Category {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
  /** A-K-Q-J-10 of one suit: the best possible Texas Hold'em hand. */
  RoyalFlush = 9,
}

export const CATEGORY_NAMES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Royal Flush',
];

export const CATEGORY_COUNT = CATEGORY_NAMES.length;

// Scratch buffers reused across calls: the evaluator runs hundreds of
// thousands of times per simulation, so avoiding allocation matters.
const rankCounts = new Int8Array(13);
const suitCounts = new Int8Array(4);
const suitMasks = new Int32Array(4);

const A_TO_5 = (1 << 12) | 0b1111; // A,2,3,4,5

/** Highest straight top rank in a 13-bit rank mask, or -1. The wheel's top is the five (3). */
function straightTop(mask: number): number {
  for (let top = 12; top >= 4; top--) {
    if (((mask >> (top - 4)) & 0x1f) === 0x1f) return top;
  }
  return (mask & A_TO_5) === A_TO_5 ? 3 : -1;
}

/** Packs the `count` highest ranks in `mask` into nibbles starting at bit 16. */
function packTop(mask: number, count: number): number {
  let packed = 0;
  let shift = 16;
  for (let r = 12; r >= 0 && count > 0; r--) {
    if (mask & (1 << r)) {
      packed |= r << shift;
      shift -= 4;
      count--;
    }
  }
  return packed;
}

/**
 * Scores the best 5-card hand from up to 7 cards. Higher is better; equal scores tie.
 * Fewer than 5 cards still yields the right category (used to score a bare board).
 * Layout: category << 20 | five 4-bit rank slots (primary ranks, then kickers).
 */
export function evaluate(cards: ArrayLike<Card>, n: number = cards.length): number {
  rankCounts.fill(0);
  suitCounts.fill(0);
  suitMasks.fill(0);
  let rankMask = 0;

  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = c >> 2;
    const s = c & 3;
    rankCounts[r]++;
    suitCounts[s]++;
    suitMasks[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  for (let s = 0; s < 4; s++) {
    if (suitCounts[s] >= 5) {
      const top = straightTop(suitMasks[s]);
      if (top === 12) return (Category.RoyalFlush << 20) | (top << 16);
      if (top >= 0) return (Category.StraightFlush << 20) | (top << 16);
      return (Category.Flush << 20) | packTop(suitMasks[s], 5);
    }
  }

  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  let pair3 = -1;
  for (let r = 12; r >= 0; r--) {
    const count = rankCounts[r];
    if (count === 4) quad = r;
    else if (count === 3) {
      if (trip1 < 0) trip1 = r;
      else if (trip2 < 0) trip2 = r;
    } else if (count === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
      else if (pair3 < 0) pair3 = r;
    }
  }

  if (quad >= 0) {
    return (Category.Quads << 20) | (quad << 16) | (packTop(rankMask & ~(1 << quad), 1) >> 4);
  }
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    return (Category.FullHouse << 20) | (trip1 << 16) | (Math.max(trip2, pair1) << 12);
  }
  const straight = straightTop(rankMask);
  if (straight >= 0) return (Category.Straight << 20) | (straight << 16);
  if (trip1 >= 0) {
    return (Category.Trips << 20) | (trip1 << 16) | (packTop(rankMask & ~(1 << trip1), 2) >> 4);
  }
  if (pair2 >= 0) {
    // With three pairs on 7 cards, the third pair's rank can be the kicker.
    const kicker = packTop(rankMask & ~(1 << pair1) & ~(1 << pair2), 1) >> 16;
    return (Category.TwoPair << 20) | (pair1 << 16) | (pair2 << 12) | (Math.max(kicker, pair3) << 8);
  }
  if (pair1 >= 0) {
    return (Category.Pair << 20) | (pair1 << 16) | (packTop(rankMask & ~(1 << pair1), 3) >> 4);
  }
  return (Category.HighCard << 20) | packTop(rankMask, 5);
}

export function categoryOf(score: number): Category {
  return score >> 20;
}

const slot = (score: number, i: number) => (score >> (16 - 4 * i)) & 0xf;

/** Human-readable name, e.g. "Two Pair, Kings and Sevens". */
export function describeScore(score: number): string {
  const cat = categoryOf(score);
  const a = slot(score, 0);
  const b = slot(score, 1);
  switch (cat) {
    case Category.RoyalFlush:
      return 'Royal Flush';
    case Category.StraightFlush:
      return `Straight Flush, ${RANK_NAMES[a]} high`;
    case Category.Quads:
      return `Four of a Kind, ${RANK_PLURALS[a]}`;
    case Category.FullHouse:
      return `Full House, ${RANK_PLURALS[a]} full of ${RANK_PLURALS[b]}`;
    case Category.Flush:
      return `Flush, ${RANK_NAMES[a]} high`;
    case Category.Straight:
      return `Straight, ${RANK_NAMES[a]} high`;
    case Category.Trips:
      return `Three of a Kind, ${RANK_PLURALS[a]}`;
    case Category.TwoPair:
      return `Two Pair, ${RANK_PLURALS[a]} and ${RANK_PLURALS[b]}`;
    case Category.Pair:
      return `Pair of ${RANK_PLURALS[a]}`;
    default:
      return `${RANK_NAMES[a]} High`;
  }
}

export interface HandResult {
  score: number;
  category: Category;
  name: string;
  /** The five cards that make the hand, for highlighting on the table. */
  best5: Card[];
}

/** Full evaluation including which 5 cards play. Slower; use for display only. */
export function evaluateHand(cards: readonly Card[]): HandResult {
  if (cards.length < 5) throw new Error('Need at least 5 cards');
  const score = evaluate(cards);
  let best5 = cards.slice(0, 5);
  if (cards.length > 5) {
    const combo = new Array<Card>(5);
    const n = cards.length;
    search: for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) {
              combo[0] = cards[a];
              combo[1] = cards[b];
              combo[2] = cards[c];
              combo[3] = cards[d];
              combo[4] = cards[e];
              if (evaluate(combo, 5) === score) {
                best5 = combo.slice();
                break search;
              }
            }
  }
  return { score, category: categoryOf(score), name: describeScore(score), best5 };
}
