import { describe, expect, it } from 'vitest';
import { parseCards, seededRng } from '../cards';
import { Category, evaluateHand } from '../evaluator';
import { type QuizDeal, generateQuiz, gradeQuiz, mentionedCategories } from '../quiz';
import { winnersOf } from '../explain';

/** Builds a deal from fixed cards (flop lesson computed by the generator's helper via a real deal). */
function fixedDeal(hands: string[], board: string): QuizDeal {
  const h = hands.map(parseCards);
  const b = parseCards(board);
  const results = h.map((x) => evaluateHand([...x, ...b]));
  const base = generateQuiz(h.length, 'mixed', seededRng(1));
  return { hands: h, board: b, results, winners: winnersOf(results), flop: base.flop };
}

describe('quiz generation', () => {
  it('deals valid, unique cards and finds the winner', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++) {
      const deal = generateQuiz(2 + (i % 3), 'mixed', rng);
      const all = [...deal.hands.flat(), ...deal.board];
      expect(new Set(all).size).toBe(all.length);
      expect(deal.board).toHaveLength(5);
      expect(deal.winners.length).toBeGreaterThan(0);
    }
  });

  it('focuses on straights and flushes when asked', () => {
    const rng = seededRng(11);
    for (let i = 0; i < 20; i++) {
      const deal = generateQuiz(3, 'straights-flushes', rng);
      expect(deal.results.some((r) => r.category >= Category.Straight && r.category !== Category.FullHouse && r.category !== Category.Quads)).toBe(true);
    }
  });

  it('focuses on same-type hands for kicker practice', () => {
    const rng = seededRng(12);
    for (let i = 0; i < 20; i++) {
      const deal = generateQuiz(2, 'kickers', rng);
      expect(deal.results[0].category).toBe(deal.results[1].category);
    }
  });

  it('teaches flop equity that sums to 100%', () => {
    const deal = generateQuiz(3, 'mixed', seededRng(5));
    const total = deal.flop.equity.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    // 52 − 6 hole cards − 3 flop cards = 43 unseen; every turn+river pair is C(43, 2).
    expect(deal.flop.runouts).toBe((43 * 42) / 2);
  });
});

describe('quiz grading', () => {
  const deal = fixedDeal(['Ah 5h', 'Kc Qd'], '2h 9h Jh Ts 3c'); // A: flush; B: straight (9-T-J-Q-K)

  it('rewards a correct, justified answer', () => {
    const g = gradeQuiz(deal, { winner: 0, category: Category.Flush, reason: 'Player A has five hearts, a flush beats a straight' });
    expect(g.winnerCorrect && g.categoryCorrect).toBe(true);
    expect(g.lines.join(' ')).toMatch(/a Flush ranks above a Straight/);
    expect(g.lines.join(' ')).toMatch(/names the right hand/);
  });

  it('corrects a misread flush', () => {
    const g = gradeQuiz(deal, { winner: 1, category: Category.Flush, reason: 'Player B has a flush I think' });
    expect(g.winnerCorrect).toBe(false);
    expect(g.lines.join(' ')).toMatch(/Player B has at most \d (spades|hearts|diamonds|clubs) — a flush needs five/);
  });

  it('nudges players to name the hand type', () => {
    const g = gradeQuiz(deal, { winner: 0, category: Category.Flush, reason: 'it just looks better to me' });
    expect(g.lines.join(' ')).toMatch(/name the hand type/);
  });

  it('handles split pots where the board plays', () => {
    const split = fixedDeal(['2c 3d', '4s 2h'], 'Ah Kh Qd Js Tc');
    const g = gradeQuiz(split, { winner: 'split', category: Category.Straight, reason: 'the board is a straight for everyone' });
    expect(g.winnerCorrect).toBe(true);
    expect(g.lines.join(' ')).toMatch(/board plays/);
  });

  it('recognises hand words in reasoning', () => {
    expect(mentionedCategories('a straight flush beats quads')).toEqual([Category.StraightFlush, Category.Quads]);
    expect(mentionedCategories('two pair vs a pair')).toEqual([Category.TwoPair, Category.Pair]);
  });
});
