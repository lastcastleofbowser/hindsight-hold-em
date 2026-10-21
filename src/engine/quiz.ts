import { type Card, FULL_DECK, SUIT_NAMES, rankOf, remainingDeck, shuffle, suitOf } from './cards';
import { CATEGORY_NAMES, Category, evaluate, evaluateHand, type HandResult } from './evaluator';
import { boardPlays, explainComparison, winnersOf } from './explain';

/**
 * "Which Hand Wins?" — a Texas Hold'em hand-reading trainer. Several hands
 * are dealt face up with a full board; the player picks the winner, names
 * the winning hand and justifies it. An optional flop step teaches equity
 * and outs before the turn and river are revealed.
 */

export type QuizFocus = 'mixed' | 'straights-flushes' | 'kickers';

export const QUIZ_FOCUS_LABELS: Record<QuizFocus, string> = {
  mixed: 'Mixed',
  'straights-flushes': 'Straights & flushes',
  kickers: 'Kickers & ties',
};

export const PLAYER_LABELS = ['Player A', 'Player B', 'Player C', 'Player D'];

export interface FlopLesson {
  /** Each player's hand using only the flop. */
  current: HandResult[];
  /** Who is ahead on the flop (several = tied). */
  leaders: number[];
  /** Exact chance each player wins by the river (ties split). */
  equity: number[];
  /** For players who are behind: cards on the turn that would put them ahead. */
  outs: { player: number; cards: Card[] }[];
  /** How many turn-and-river combinations the exact equity was counted over. */
  runouts: number;
}

export interface QuizDeal {
  hands: Card[][];
  board: Card[];
  results: HandResult[];
  winners: number[];
  flop: FlopLesson;
}

const STRAIGHTISH = new Set([Category.Straight, Category.Flush, Category.StraightFlush, Category.RoyalFlush]);

function satisfies(results: HandResult[], focus: Exclude<QuizFocus, 'mixed'> | 'any'): boolean {
  if (focus === 'any') return true;
  if (focus === 'straights-flushes') return results.some((r) => STRAIGHTISH.has(r.category));
  const sorted = [...results].sort((a, b) => b.score - a.score);
  return sorted[0].category === sorted[1].category;
}

function flopLesson(hands: Card[][], board: Card[]): FlopLesson {
  const flop = board.slice(0, 3);
  const current = hands.map((h) => evaluateHand([...h, ...flop]));
  const leaders = winnersOf(current);
  const deck = remainingDeck([...hands.flat(), ...flop]);
  const equity = hands.map(() => 0);
  const cards = new Array<Card>(7);
  let runouts = 0;
  for (let a = 0; a < deck.length; a++) {
    for (let b = a + 1; b < deck.length; b++) {
      const scores = hands.map((h) => {
        cards[0] = h[0];
        cards[1] = h[1];
        cards[2] = flop[0];
        cards[3] = flop[1];
        cards[4] = flop[2];
        cards[5] = deck[a];
        cards[6] = deck[b];
        return evaluate(cards);
      });
      const best = Math.max(...scores);
      const tied = scores.filter((s) => s === best).length;
      scores.forEach((s, i) => s === best && (equity[i] += 1 / tied));
      runouts++;
    }
  }
  const outs = hands.flatMap((_, p) => {
    if (leaders.includes(p)) return [];
    const winning = deck.filter((c) => {
      const scores = hands.map((h) => evaluate([...h, ...flop, c]));
      return scores[p] > Math.max(...scores.filter((_, i) => i !== p));
    });
    return [{ player: p, cards: winning }];
  });
  return { current, leaders, equity: equity.map((e) => e / runouts), outs, runouts };
}

/** Deals a quiz hand, re-dealing until it fits the chosen focus. */
export function generateQuiz(players: number, focus: QuizFocus, rng: () => number = Math.random): QuizDeal {
  const roll = rng();
  const target: Exclude<QuizFocus, 'mixed'> | 'any' =
    focus !== 'mixed' ? focus : roll < 0.45 ? 'straights-flushes' : roll < 0.7 ? 'kickers' : 'any';
  let deal: { hands: Card[][]; board: Card[]; results: HandResult[] } | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const deck = shuffle([...FULL_DECK], rng);
    const hands = Array.from({ length: players }, (_, i) => [deck[i * 2], deck[i * 2 + 1]]);
    const board = deck.slice(players * 2, players * 2 + 5);
    const results = hands.map((h) => evaluateHand([...h, ...board]));
    deal = { hands, board, results };
    if (satisfies(results, target)) break;
  }
  const { hands, board, results } = deal!;
  return { hands, board, results, winners: winnersOf(results), flop: flopLesson(hands, board) };
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface QuizAnswer {
  /** Index of the chosen player, or 'split' for a tie. */
  winner: number | 'split';
  category: Category;
  reason: string;
}

export interface QuizGrade {
  winnerCorrect: boolean;
  categoryCorrect: boolean;
  /** Short verdict lines, then teaching lines. */
  lines: string[];
}

const CATEGORY_WORDS: [Category, RegExp][] = [
  [Category.RoyalFlush, /royal/i],
  [Category.StraightFlush, /straight[- ]flush/i],
  [Category.Quads, /quads|four of a kind|4 of a kind/i],
  [Category.FullHouse, /full house|boat/i],
  [Category.Flush, /(?<!straight[- ])flush/i],
  [Category.Straight, /straight(?![- ]flush)/i],
  [Category.Trips, /three of a kind|3 of a kind|trips|\bset\b/i],
  [Category.TwoPair, /two pair|2 pair/i],
  [Category.Pair, /(?<!two |2 )\bpair\b/i],
  [Category.HighCard, /high card|kicker/i],
];

/** Hand types the player's written reasoning mentions. */
export function mentionedCategories(text: string): Category[] {
  return CATEGORY_WORDS.filter(([, re]) => re.test(text)).map(([c]) => c);
}

/** Most cards of a single suit available to a player, and which suit. */
function bestSuitCount(cards: Card[]): { count: number; suit: number } {
  const counts = [0, 0, 0, 0];
  for (const c of cards) counts[suitOf(c)]++;
  const suit = counts.indexOf(Math.max(...counts));
  return { count: counts[suit], suit };
}

/** Longest run of consecutive ranks (Ace counts high and low). */
function longestRun(cards: Card[]): number {
  const present = new Set(cards.map(rankOf));
  if (present.has(12)) present.add(-1);
  let best = 0;
  let run = 0;
  for (let r = -1; r <= 12; r++) {
    run = present.has(r) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function gradeQuiz(deal: QuizDeal, answer: QuizAnswer): QuizGrade {
  const split = deal.winners.length > 1;
  const winnerCorrect = split ? answer.winner === 'split' : answer.winner === deal.winners[0];
  const winHand = deal.results[deal.winners[0]];
  const categoryCorrect = answer.category === winHand.category;
  const names = deal.winners.map((w) => PLAYER_LABELS[w]).join(' and ');
  const lines: string[] = [];

  lines.push(
    winnerCorrect
      ? `✅ Correct — ${split ? `${names} split the pot` : `${names} wins`} with ${winHand.name}.`
      : `❌ Not quite — ${split ? `${names} split the pot` : `${names} wins`} with ${winHand.name}.`,
  );
  lines.push(
    categoryCorrect
      ? `✅ You named the winning hand type correctly: ${CATEGORY_NAMES[winHand.category]}.`
      : `❌ You said the winning hand was ${CATEGORY_NAMES[answer.category]}; it's actually ${CATEGORY_NAMES[winHand.category]}.`,
  );

  // Why the winner beats the strongest other hand.
  const ranked = deal.results.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score);
  const runnerUp = ranked.find((x) => !deal.winners.includes(x.i));
  if (split) {
    lines.push(explainComparison({ label: PLAYER_LABELS[deal.winners[0]], hand: winHand }, { label: PLAYER_LABELS[deal.winners[1]], hand: deal.results[deal.winners[1]] }));
    if (deal.winners.every((w) => boardPlays(deal.results[w], deal.hands[w]))) {
      lines.push('The board plays: the best five cards are all community cards, so everyone still in shares them.');
    }
  }
  if (runnerUp) {
    lines.push(explainComparison({ label: PLAYER_LABELS[deal.winners[0]], hand: winHand }, { label: PLAYER_LABELS[runnerUp.i], hand: runnerUp.r }));
  }

  // Coach the written justification, especially straights and flushes.
  const mentioned = mentionedCategories(answer.reason);
  const chosen = typeof answer.winner === 'number' ? answer.winner : deal.winners[0];
  const chosenCards = [...deal.hands[chosen], ...deal.board];
  const chosenHand = deal.results[chosen];
  if (mentioned.length === 0) {
    lines.push('💡 Tip: name the hand type in your reasoning (e.g. "a flush beats a straight") — it builds the habit of reading hands precisely.');
  }
  for (const cat of mentioned) {
    if ((cat === Category.Flush || cat === Category.StraightFlush || cat === Category.RoyalFlush) && chosenHand.category < Category.Flush) {
      const { count, suit } = bestSuitCount(chosenCards);
      lines.push(`🔎 You mentioned a flush, but ${PLAYER_LABELS[chosen]} has at most ${count} ${SUIT_NAMES[suit]} — a flush needs five cards of one suit.`);
    } else if (cat === Category.Straight && chosenHand.category !== Category.Straight && chosenHand.category < Category.Flush) {
      lines.push(`🔎 You mentioned a straight, but ${PLAYER_LABELS[chosen]}'s longest run of consecutive ranks is ${longestRun(chosenCards)} — a straight needs five in a row.`);
    } else if (cat === winHand.category && winnerCorrect) {
      lines.push('👍 Your reasoning names the right hand — good hand reading.');
    }
  }
  if (/kicker/i.test(answer.reason) && ranked[0].r.category === ranked[1]?.r.category) {
    lines.push('👍 Good spot — when hands are the same type, the kicker (next highest card) often decides.');
  }
  return { winnerCorrect, categoryCorrect, lines };
}
