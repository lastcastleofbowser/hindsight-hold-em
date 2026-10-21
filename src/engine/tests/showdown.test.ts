import { describe, expect, it } from 'vitest';
import { cardsLabel, parseCards } from '../cards';
import { evaluateHand } from '../evaluator';
import { explainComparison, orderBest5, winnersOf } from '../explain';
import { buildContext } from '../coach';
import { offlineReply, showdownCheck, walkthrough } from '../chat';
import { resolveShowdown, reviewHand } from '../review';

const hand = (s: string) => evaluateHand(parseCards(s));

describe('showdown check', () => {
  // Regression: AKo makes a Broadway straight on 9♦ 6♦ J♣ 10♠ Q♠ and must beat Q♣ 3♣.
  const hole = parseCards('Ah Kd');
  const villain = parseCards('Qc 3c');
  const board = parseCards('9d 6d Jc Ts Qs');

  it('knows the straight beats the pair', () => {
    const sd = resolveShowdown(hole, board, [villain])!;
    expect(sd.hero.name).toBe('Straight, Ace high');
    expect(sd.villains[0].hand.name).toBe('Pair of Queens');
    expect(sd.outcome).toBe('won');
    expect(sd.explanation).toMatch(/You win: a Straight ranks above a Pair/);
    expect(sd.beatenBy).toEqual([]); // the Broadway straight is the nuts on this board
  });

  it('flags a reported result that contradicts the rules', () => {
    const sd = resolveShowdown(hole, board, [villain], 'lost')!;
    expect(sd.mismatch).toBe(true);
    const text = showdownCheck(sd);
    expect(text).toMatch(/You should have won this hand/);
    expect(text).toMatch(/You said you \*\*lost\*\*/);
    expect(text).toMatch(/you had \*\*the nuts\*\*/);
    expect(text).toContain(cardsLabel(orderBest5(sd.hero)));
  });

  it('explains what would have beaten a weaker hand', () => {
    const sd = resolveShowdown(parseCards('Ks Qd'), parseCards('Kh 9h 2h 7c 3s'), [parseCards('Ah 4h')], 'lost')!;
    expect(sd.outcome).toBe('lost');
    expect(sd.mismatch).toBe(false);
    const text = showdownCheck(sd);
    expect(text).toMatch(/To beat your pair of kings on this board an opponent needed: Flush/);
    expect(text).toMatch(/Their flush, ace high was one of those, so it beat you/);
    expect(text).toMatch(/matches the result you reported/);
  });

  it('shows up in the coach walkthrough and answers "who should have won?"', () => {
    const d = {
      ctx: buildContext({ street: 'river', hole, board, opponents: 1, pot: 24.5, toCall: 10, bigBlind: 1, heroStack: 100, iterations: 2000 }),
      action: 'call' as const,
      reasons: [],
      note: '',
      villainHoles: [villain],
    };
    const review = reviewHand([d], resolveShowdown(hole, board, [villain], 'lost'));
    expect(walkthrough(review).join('\n')).toMatch(/Showdown check/);
    expect(review.summary[0]).toMatch(/You said you lost, but by the rules you should have won/);
    expect(offlineReply('who should have won?', review)).toMatch(/You should have won this hand/);
    expect(offlineReply('why did I lose?', review)).toMatch(/your hand was the winner/);
  });
});

describe('explaining hand comparisons', () => {
  it('compares different hand types', () => {
    expect(explainComparison({ label: 'Player A', hand: hand('Ah Kh Qh 2h 7h') }, { label: 'Player B', hand: hand('9c Tc Jd Qs Kd') })).toBe(
      "Player A wins: a Flush ranks above a Straight in the Texas Hold'em hand rankings.",
    );
  });

  it('explains kickers', () => {
    const text = explainComparison({ label: 'You', hand: hand('Ah Ad Kc 7s 3d') }, { label: 'Player B', hand: hand('As Ac Qc 7d 3h') });
    expect(text).toMatch(/same pair, so it comes down to the kicker: your King beats Player B's Queen\. You win\./);
  });

  it('explains pair rank, full houses and splits', () => {
    expect(explainComparison({ label: 'You', hand: hand('Kh Kd 9c 7s 3d') }, { label: 'Player B', hand: hand('Qs Qc Ac 7d 3h') })).toMatch(
      /compare the pair: your Kings beat Player B's Queens/,
    );
    expect(explainComparison({ label: 'Player A', hand: hand('Qh Qd Qc 4s 4d') }, { label: 'Player B', hand: hand('Jh Jd Jc As Ad') })).toMatch(
      /three-of-a-kind part: Player A's Queens beat Player B's Jacks/,
    );
    expect(explainComparison({ label: 'Player A', hand: hand('Ah Kh Qd Js Tc') }, { label: 'Player B', hand: hand('As Kd Qc Jh Td') })).toMatch(/split/);
  });

  it('orders a wheel with the ace last and finds split winners', () => {
    expect(cardsLabel(orderBest5(hand('Ah 2d 3s 4c 5d')))).toBe('5♦ 4♣ 3♠ 2♦ A♥');
    expect(winnersOf([hand('Ah Kh Qd Js Tc'), hand('As Kd Qc Jh Td'), hand('2c 2d 5h 7s 9c')])).toEqual([0, 1]);
  });
});
