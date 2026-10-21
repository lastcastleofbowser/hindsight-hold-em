import { describe, expect, it } from 'vitest';
import { parseCards, seededRng } from '../cards';
import { bettingRange, calculateEquity, countOuts } from '../analysis';
import { buildContext, evaluateDecision, inferReasons, recommend, respondToReason } from '../coach';
import { offlineReply } from '../chat';
import { reviewHand, resolveShowdown } from '../review';
import type { Street } from '../game';

const ctx = (street: Street, hole: string, board: string, pot: number, toCall: number, opponents = 1) =>
  buildContext({ street, hole: parseCards(hole), board: board ? parseCards(board) : [], opponents, pot, toCall, bigBlind: 1, heroStack: 100, iterations: 6000 });

describe('betting range model', () => {
  it('accepts pairs and draws, rejects air', () => {
    const accepts = bettingRange(parseCards('Qh 8c 3h'));
    expect(accepts(...(parseCards('Ad Qs') as [number, number]))).toBe(true); // top pair
    expect(accepts(...(parseCards('Ah 5h') as [number, number]))).toBe(true); // flush draw
    expect(accepts(...(parseCards('Js 9d') as [number, number]))).toBe(true); // gutshot
    expect(accepts(...(parseCards('6s 2d') as [number, number]))).toBe(false); // air
  });

  it('makes top pair look weaker against bettors than against random hands', () => {
    const hero = parseCards('Ks Qd');
    const board = parseCards('Kh 9h 2h');
    const random = calculateEquity({ hero, board, opponents: 1, iterations: 8000, rng: seededRng(3) }).equity;
    const vsRange = calculateEquity({ hero, board, opponents: 1, iterations: 8000, rng: seededRng(3), opponentFilter: bettingRange(board) }).equity;
    expect(vsRange).toBeLessThan(random - 0.1);
  });
});

describe('outs', () => {
  it('ignores pairing a card below the top of the board', () => {
    const outs = countOuts(parseCards('Jh Th'), parseCards('Qh 8c 3h'))!;
    expect(outs.groups.find((g) => g.name === 'Pair')).toBeUndefined();
    // 9 hearts + 3 non-heart nines.
    expect(outs.total).toBe(12);
  });

  it('counts overcards that make top pair', () => {
    const outs = countOuts(parseCards('Ah Kd'), parseCards('9c 6s 2d'))!;
    expect(outs.groups.find((g) => g.name === 'Pair')?.cards).toHaveLength(6);
  });
});

describe('coach', () => {
  it('never likes folding when checking is free', () => {
    const c = ctx('flop', '7c 2d', 'Ah Kh 9s', 6, 0);
    expect(evaluateDecision(c, 'fold').verdict).toBe('mistake');
    expect(recommend(c).move).toBe('check');
  });

  it('wants value bets with a monster', () => {
    const c = ctx('flop', 'As Ad', 'Ah 7c 2d', 6, 0);
    expect(recommend(c).move).toBe('bet');
    expect(evaluateDecision(c, 'check').verdict).toBe('questionable');
  });

  it('folds ace-high to a pot-sized turn bet', () => {
    const c = ctx('turn', 'Ac 4d', 'Kh Qs 7d 2c', 20, 10);
    expect(recommend(c).move).toBe('fold');
    expect(evaluateDecision(c, 'call').verdict).toBe('mistake');
  });

  it('calls a cheap draw', () => {
    const c = ctx('flop', 'Ah 5h', 'Kh 9h 2c', 20, 4);
    expect(recommend(c).move).not.toBe('fold');
    expect(evaluateDecision(c, 'call').verdict).not.toBe('mistake');
  });

  it('folds trash pre-flop and raises aces', () => {
    expect(recommend(ctx('preflop', '7c 2d', '', 1.5, 1)).move).toBe('fold');
    expect(recommend(ctx('preflop', 'As Ah', '', 1.5, 1)).move).toBe('raise');
  });

  it('reads reasons from free text without confusing "gutshot" with a gut feeling', () => {
    expect(inferReasons('I had a flush draw and a gutshot')).toEqual(['draw']);
    expect(inferReasons('just a gut feeling')).toContain('gut');
  });

  it('explains bluff maths', () => {
    const c = ctx('river', 'Jh Th', 'Qh 8c 3h 2s Kc', 34.5, 0);
    const replies = respondToReason(c, 'bet', ['bluff'], 30).join(' ');
    expect(replies).toMatch(/fold 47% of the time/);
  });
});

describe('hand review', () => {
  it('walks through the example hand and answers follow-ups offline', () => {
    const hole = parseCards('Jh Th');
    const villain = parseCards('Ac Qd');
    const board = parseCards('Qh 8c 3h 2s Kc');
    const d = (street: Street, b: number, action: 'call' | 'bet', pot: number, toCall: number, note: string, amountTo?: number) => ({
      ctx: buildContext({ street, hole, board: board.slice(0, b), opponents: 1, pot, toCall, bigBlind: 1, heroStack: 100 }),
      action,
      amountTo,
      reasons: [],
      note,
      villainHoles: [villain],
    });
    const review = reviewHand(
      [
        d('preflop', 0, 'call', 4.5, 2, 'cheap'),
        d('flop', 3, 'call', 10.5, 4, 'flush draw'),
        d('turn', 4, 'call', 24.5, 10, 'still drawing'),
        d('river', 5, 'bet', 34.5, 0, 'bluff', 30),
      ],
      resolveShowdown(hole, board, [villain]),
    );
    expect(review.showdown?.outcome).toBe('lost');
    expect(review.biggestLeak).not.toBeNull();
    expect(review.decisions[1].feedback.verdict).toBe('great'); // flop call with 12 outs at 28% odds
    expect(offlineReply('why did I lose?', review)).toMatch(/Pair of Queens/);
    expect(offlineReply('how many outs on the flop?', review)).toMatch(/12 outs/);
    expect(offlineReply('what should I have done on the turn?', review)).toMatch(/Turn/);
  });
});
