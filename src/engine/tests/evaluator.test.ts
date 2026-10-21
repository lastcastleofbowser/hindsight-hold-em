import { describe, expect, it } from 'vitest';
import { parseCards, seededRng } from '../cards';
import { CATEGORY_NAMES, Category, evaluate, evaluateHand, categoryOf } from '../evaluator';
import { analyseThreats, calculateEquity, countOuts, findNuts, startingHand, requiredEquity } from '../analysis';

const score = (s: string) => evaluate(parseCards(s));
const cat = (s: string) => categoryOf(score(s));

describe('evaluator', () => {
  it('recognises every category', () => {
    expect(cat('As Ks Qs Js Ts 2d 3c')).toBe(Category.RoyalFlush);
    expect(cat('9s Ks Qs Js Ts 2d 3c')).toBe(Category.StraightFlush);
    expect(cat('9h 9d 9s 9c Kd 2c 3s')).toBe(Category.Quads);
    expect(cat('Kh Kd Ks 7c 7d 2s 3h')).toBe(Category.FullHouse);
    expect(cat('2h 7h 9h Jh Kh As Ad')).toBe(Category.Flush);
    expect(cat('5c 6d 7h 8s 9c Kd Kh')).toBe(Category.Straight);
    expect(cat('Qh Qd Qs 2c 7d 9s 3h')).toBe(Category.Trips);
    expect(cat('Qh Qd 7s 7c 2d 9s 3h')).toBe(Category.TwoPair);
    expect(cat('Qh Qd 7s 4c 2d 9s 3h')).toBe(Category.Pair);
    expect(cat('Ah Qd 7s 4c 2d 9s 3h')).toBe(Category.HighCard);
  });

  it('handles the wheel and ranks it below a six-high straight', () => {
    expect(cat('Ah 2d 3s 4c 5d Kh Qs')).toBe(Category.Straight);
    expect(score('Ah 2d 3s 4c 5d')).toBeLessThan(score('2d 3s 4c 5d 6h'));
    expect(evaluateHand(parseCards('Ah 2d 3s 4c 5d Kh Qs')).name).toBe('Straight, Five high');
  });

  it('compares kickers correctly', () => {
    expect(score('Ah Ad Kc 7s 3d')).toBeGreaterThan(score('Ah Ad Qc 7s 3d'));
    expect(score('Kh Kd 9c 9s Ad')).toBeGreaterThan(score('Kh Kd 9c 9s Qd'));
    // Two pair on 7 cards with three pairs: best kicker may be the third pair.
    expect(score('Ah Ad Kc Ks 7d 7c 2h')).toBe(score('Ah Ad Kc Ks 7d'));
    expect(score('Ah Ad Kc Ks Qd 7c 7h')).toBe(score('Ah Ad Kc Ks Qd'));
  });

  it('ranks a royal flush above every straight flush and names it', () => {
    expect(score('As Ks Qs Js Ts')).toBeGreaterThan(score('Ks Qs Js Ts 9s'));
    expect(CATEGORY_NAMES[Category.RoyalFlush]).toBe('Royal Flush');
    expect(evaluateHand(parseCards('Ah Kh Qh Jh Th 2c 2d')).name).toBe('Royal Flush');
    // A royal flush is only ever ace-high; the wheel straight flush is five-high.
    expect(evaluateHand(parseCards('Ah 2h 3h 4h 5h')).name).toBe('Straight Flush, Five high');
  });

  it('splits identical hands and picks the best full house', () => {
    expect(score('Kh Kd Ks 7c 7d 7s 2h')).toBe(score('Kh Kd Ks 7c 7d'));
    expect(score('As Ks Qs Js Ts')).toBe(score('Ah Kh Qh Jh Th'));
  });

  it('names hands and finds the best five cards', () => {
    const r = evaluateHand(parseCards('Kh Kd 7s 7c 2d 9s 3h'));
    expect(r.name).toBe('Two Pair, Kings and Sevens');
    expect(r.best5).toHaveLength(5);
    expect(evaluate(r.best5)).toBe(r.score);
    expect(evaluateHand(parseCards('As Ks Qs Js Ts 2d 3c')).name).toBe('Royal Flush');
  });
});

describe('equity', () => {
  it('AA vs KK pre-flop is about 82%', () => {
    const r = calculateEquity({
      hero: parseCards('As Ah'),
      board: [],
      opponents: 1,
      knownOpponents: [parseCards('Kd Kc')],
      iterations: 20000,
      rng: seededRng(1),
    });
    expect(r.equity).toBeGreaterThan(0.79);
    expect(r.equity).toBeLessThan(0.85);
  });

  it('AA vs one random hand is about 85%', () => {
    const r = calculateEquity({ hero: parseCards('As Ah'), board: [], opponents: 1, iterations: 20000, rng: seededRng(2) });
    expect(r.equity).toBeGreaterThan(0.82);
    expect(r.equity).toBeLessThan(0.88);
  });

  it('enumerates exactly when the opponent is known on the turn', () => {
    // Hero's nut flush draw vs top pair, one card to come: 44 possible rivers.
    const r = calculateEquity({
      hero: parseCards('Ah 5h'),
      board: parseCards('Kh 9h 2c 7s'),
      opponents: 1,
      knownOpponents: [parseCards('Kd Qc')],
    });
    expect(r.exact).toBe(true);
    expect(r.iterations).toBe(44);
    // 9 hearts + 3 aces = 12 winning rivers.
    expect(r.equity).toBeCloseTo(12 / 44, 5);
  });

  it('a made hand on the river is either 100% or 0% vs a known hand', () => {
    const r = calculateEquity({
      hero: parseCards('Ah Kh'),
      board: parseCards('Qh Jh Th 2c 3d'),
      opponents: 1,
      knownOpponents: [parseCards('As Ad')],
    });
    expect(r.equity).toBe(1);
  });
});

describe('threats, nuts and outs', () => {
  it('finds the nut flush on a three-heart board', () => {
    const nuts = findNuts(parseCards('Kh 9h 2h'));
    expect(nuts?.name).toBe('Flush, Ace high');
  });

  it('finds a straight flush as the nuts when possible', () => {
    const nuts = findNuts(parseCards('9h 8h 7h 2c 2d'));
    expect(nuts?.name).toBe('Straight Flush, Jack high');
    expect(nuts?.combos).toBe(1);
  });

  it('reports that nothing beats the nuts', () => {
    const t = analyseThreats(parseCards('Ah Kh'), parseCards('Qh Jh Th 2c 3d'), 3);
    expect(t?.beatCombos).toBe(0);
    expect(t?.pBeatAny).toBe(0);
  });

  it('lists hands that beat top pair', () => {
    const t = analyseThreats(parseCards('Ks Qd'), parseCards('Kh 9h 2h'), 1)!;
    expect(t.hero.category).toBe(Category.Pair);
    expect(t.beatCombos).toBeGreaterThan(0);
    expect(t.byCategory[0].category).toBe(Category.Flush);
  });

  it('counts nine flush outs on the flop', () => {
    const outs = countOuts(parseCards('Ah 5h'), parseCards('Kh 9h 2c'))!;
    const flush = outs.groups.find((g) => g.category === Category.Flush);
    expect(flush?.cards).toHaveLength(9);
    // ~35% to hit a flush by the river with 9 outs (rule of 4 ≈ 36%).
    expect(outs.hitByRiver).toBeGreaterThan(0.34);
  });

  it('does not count a board-pairing card as an out', () => {
    const outs = countOuts(parseCards('Ah Kd'), parseCards('7c 7d 2s'))!;
    // A 2 makes two pair on board for everyone, not an improvement unique to hero.
    const all = outs.groups.flatMap((g) => g.cards);
    expect(all.some((c) => c >> 2 === 0)).toBe(false);
  });
});

describe('starting hands', () => {
  it('rates premium and weak hands', () => {
    expect(startingHand(parseCards('As Ah')).tier).toBe('Premium');
    expect(startingHand(parseCards('As Kh')).notation).toBe('AKo');
    expect(startingHand(parseCards('7c 2d')).tier).toBe('Weak');
    expect(startingHand(parseCards('Jh Th')).notation).toBe('JTs');
  });

  it('computes pot odds', () => {
    expect(requiredEquity(50, 100)).toBeCloseTo(1 / 3);
    expect(requiredEquity(0, 100)).toBe(0);
  });
});
