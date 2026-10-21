import { type Card, RANK_NAMES, RANK_PLURALS, rankOf, suitOf } from './cards';
import { CATEGORY_NAMES, Category, type HandResult } from './evaluator';

/** Beginner-friendly description of each Texas Hold'em hand ranking. */
export const CATEGORY_HELP: Record<Category, string> = {
  [Category.HighCard]: 'No pair or better — the highest card plays, then the next highest, and so on.',
  [Category.Pair]: 'Two cards of the same rank, e.g. two Kings.',
  [Category.TwoPair]: 'Two different pairs, e.g. Kings and Sevens.',
  [Category.Trips]: 'Three cards of the same rank. Called a "set" with a pocket pair, "trips" when two are on the board.',
  [Category.Straight]: 'Five cards in a row of any suits, e.g. 9-10-J-Q-K. An Ace can be high (10-J-Q-K-A) or low (A-2-3-4-5).',
  [Category.Flush]: 'Any five cards of the same suit, in any order.',
  [Category.FullHouse]: 'Three of a kind plus a pair, e.g. three Queens and two Fours.',
  [Category.Quads]: 'All four cards of one rank.',
  [Category.StraightFlush]: 'Five cards in a row, all of the same suit.',
  [Category.RoyalFlush]: "A-K-Q-J-10 all of the same suit — the best possible hand in Texas Hold'em.",
};

/** One example hand per category, for the rankings chart. */
export const CATEGORY_EXAMPLES: Record<Category, string> = {
  [Category.RoyalFlush]: 'As Ks Qs Js Ts',
  [Category.StraightFlush]: '9h 8h 7h 6h 5h',
  [Category.Quads]: 'Qc Qd Qh Qs 7d',
  [Category.FullHouse]: 'Kh Kd Ks 4c 4h',
  [Category.Flush]: 'Ad Jd 8d 6d 2d',
  [Category.Straight]: 'Tc 9d 8s 7h 6c',
  [Category.Trips]: '7s 7h 7d Kc 2s',
  [Category.TwoPair]: 'Jh Jc 5s 5d Ac',
  [Category.Pair]: 'Ah Ad 9c 6s 3h',
  [Category.HighCard]: 'Ks Jd 8h 5c 3s',
};

const slot = (score: number, i: number) => (score >> (16 - 4 * i)) & 0xf;
const article = (word: string) => (/^[AEIOU]/i.test(word) ? 'an' : 'a');
const withArticle = (cat: Category) => (cat === Category.TwoPair ? 'Two Pair' : `${article(CATEGORY_NAMES[cat])} ${CATEGORY_NAMES[cat]}`);

/**
 * Orders a best-five for display the way players read hands: the made part
 * first (pairs, trips), then kickers; a wheel straight shows the Ace last.
 */
export function orderBest5(hand: HandResult): Card[] {
  const counts = new Map<number, number>();
  for (const c of hand.best5) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  const sorted = [...hand.best5].sort(
    (a, b) => counts.get(rankOf(b))! - counts.get(rankOf(a))! || rankOf(b) - rankOf(a) || suitOf(a) - suitOf(b),
  );
  const isWheel =
    (hand.category === Category.Straight || hand.category === Category.StraightFlush) && slot(hand.score, 0) === 3;
  return isWheel ? [...sorted.slice(1), sorted[0]] : sorted;
}

/** Which tie-break each rank slot represents, per category. */
function slotMeaning(cat: Category, i: number): string {
  switch (cat) {
    case Category.Pair:
      return i === 0 ? 'pair' : 'kicker';
    case Category.TwoPair:
      return i === 0 ? 'top pair' : i === 1 ? 'second pair' : 'kicker';
    case Category.Trips:
      return i === 0 ? 'three of a kind' : 'kicker';
    case Category.FullHouse:
      return i === 0 ? 'three-of-a-kind part' : 'pair part';
    case Category.Quads:
      return i === 0 ? 'four of a kind' : 'kicker';
    case Category.Straight:
    case Category.StraightFlush:
      return 'top card';
    default:
      return i === 0 ? 'highest card' : `${['', '2nd', '3rd', '4th', '5th'][i]} highest card`;
  }
}

function rankPhrase(cat: Category, i: number, rank: number): string {
  const plural =
    (cat === Category.Pair && i === 0) ||
    (cat === Category.TwoPair && i < 2) ||
    (cat === Category.Trips && i === 0) ||
    (cat === Category.FullHouse) ||
    (cat === Category.Quads && i === 0);
  if (plural) return RANK_PLURALS[rank];
  if (cat === Category.Straight || cat === Category.StraightFlush) return `${RANK_NAMES[rank]}-high`;
  return RANK_NAMES[rank];
}

export interface Contender {
  /** "You" for the player, otherwise a name such as "Player B". */
  label: string;
  hand: HandResult;
}

const isYou = (c: Contender) => c.label === 'You';
const owner = (c: Contender) => (isYou(c) ? 'your' : `${c.label}'s`);
const wins = (c: Contender) => `${c.label} ${isYou(c) ? 'win' : 'wins'}`;

/** Explains in plain English why one hand beats another (or why they split). */
export function explainComparison(a: Contender, b: Contender): string {
  const ca = a.hand.category;
  const cb = b.hand.category;
  if (ca !== cb) {
    const [win, lose] = ca > cb ? [a, b] : [b, a];
    return `${wins(win)}: ${withArticle(win.hand.category)} ranks above ${withArticle(lose.hand.category)} in the Texas Hold'em hand rankings.`;
  }
  if (a.hand.score === b.hand.score) {
    return `Both make exactly the same best five cards (${a.hand.name}), so the pot is split.`;
  }
  const [win, lose] = a.hand.score > b.hand.score ? [a, b] : [b, a];
  let i = 0;
  while (i < 5 && slot(win.hand.score, i) === slot(lose.hand.score, i)) i++;
  const meaning = slotMeaning(ca, i);
  const winRank = rankPhrase(ca, i, slot(win.hand.score, i));
  const loseRank = rankPhrase(ca, i, slot(lose.hand.score, i));
  const verb = /s$/.test(winRank) ? 'beat' : 'beats';
  const lead =
    i === 0
      ? `Both have ${withArticle(ca)}, so compare the ${meaning}`
      : i === 1
        ? `Both have ${withArticle(ca)} with the same ${slotMeaning(ca, 0)}, so it comes down to the ${meaning}`
        : `Both have ${withArticle(ca)} and match card for card until the ${meaning}`;
  return `${lead}: ${owner(win)} ${winRank} ${verb} ${owner(lose)} ${loseRank}. ${wins(win)}.`;
}

/** Indices of the best hand(s); more than one means a split pot. */
export function winnersOf(hands: HandResult[]): number[] {
  const best = Math.max(...hands.map((h) => h.score));
  return hands.flatMap((h, i) => (h.score === best ? [i] : []));
}

/** True when a player's best five cards are all community cards ("the board plays"). */
export function boardPlays(hand: HandResult, hole: readonly Card[]): boolean {
  return hand.best5.every((c) => !hole.includes(c));
}
