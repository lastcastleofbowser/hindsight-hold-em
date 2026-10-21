import { describe, expect, it } from 'vitest';
import { FULL_DECK, parseCards } from '../cards';
import { buildContext, recommend } from '../coach';
import { beginnerAdvice } from '../beginnerCoach';
import { type GameState, type SeatConfig, applyAction, newHand } from '../game';
import { buildReads, handLine, readChecks } from '../reads';
import { CHARTS, chartAction, parseRange, rangeShare } from '../ranges';

const seats = (n: number): SeatConfig[] => Array.from({ length: n }, (_, i) => ({ name: i === 0 ? 'You' : `Bot${i}`, isHero: i === 0, style: 'balanced' }));

/**
 * Deals a heads-up hand with chosen cards. Hole cards are dealt one at a time
 * starting left of the button; with the button on seat 0 that's seat 1 first.
 */
function riggedHeadsUp(hero: string, villain: string, board: string): GameState {
  const h = parseCards(hero);
  const v = parseCards(villain);
  const b = parseCards(board);
  const top = [v[0], h[0], v[1], h[1], ...b];
  const rest = FULL_DECK.filter((c) => !top.includes(c));
  return newHand({ seats: seats(2), handNumber: 1, buttonIndex: 0, startingStack: 1000, smallBlind: 5, bigBlind: 10, deck: [...top, ...rest] });
}

describe('range charts', () => {
  it('parses range notation', () => {
    const r = parseRange('TT+, A5s-A2s, KQo, 22-44:0.5');
    expect([...r.keys()].sort()).toEqual(['22', '33', '44', 'A2s', 'A3s', 'A4s', 'A5s', 'AA', 'JJ', 'KK', 'KQo', 'QQ', 'TT'].sort());
    expect(r.get('33')).toBe(0.5);
  });

  it('opens tighter early and wider late', () => {
    const utg = rangeShare(CHARTS.UTG.raise);
    const btn = rangeShare(CHARTS.BTN.raise);
    expect(utg).toBeGreaterThan(0.12);
    expect(utg).toBeLessThan(0.2);
    expect(btn).toBeGreaterThan(0.38);
    expect(btn).toBeLessThan(0.52);
    expect(chartAction('UTG', '72o')).toBe('fold');
    expect(chartAction('UTG', 'AKo')).toBe('raise');
    expect(chartAction('BTN', '54s')).toBe('raise');
    expect(chartAction('BB', '76o')).toBe('call');
  });

  it('drives position-aware pre-flop advice', () => {
    const ctx = (hole: string, position: 'UTG' | 'BTN') =>
      buildContext({ street: 'preflop', hole: parseCards(hole), board: [], opponents: 5, pot: 15, toCall: 10, bigBlind: 10, heroStack: 1000, iterations: 500, position });
    expect(recommend(ctx('6s 4h', 'UTG')).move).toBe('fold');
    expect(recommend(ctx('6s 5s', 'UTG')).move).toBe('raise');
    expect(recommend(ctx('Ks 8d', 'UTG')).move).toBe('fold');
    expect(recommend(ctx('Ks 8d', 'BTN')).move).toBe('raise');
  });
});

describe('opponent reads', () => {
  it('reads a raise then a big bet as a polarised line', () => {
    let g = riggedHeadsUp('Ah Kd', '9c 8c', 'Qs 7d 2h 3s 4d');
    // Pre-flop: hero (button/SB) limps, villain (BB) raises, hero calls.
    g = applyAction(g, { type: 'call' });
    g = applyAction(g, { type: 'raise', to: 30 });
    g = applyAction(g, { type: 'call' });
    // Flop: villain bets pot.
    g = applyAction(g, { type: 'bet', to: 60 });
    const [read] = buildReads(g, 0);
    expect(read.steps.map((s) => s.kind)).toEqual(['open', 'bet-big']); // a raise over a limp is the first raise
    expect(read.strength).toBe('polarised');
    expect(read.summary).toMatch(/big bet: usually a very strong hand, or a bluff/);
    expect(read.fits(...(parseCards('Qc Qh') as [number, number]))).toBe(true); // a set fits
    expect(read.fits(...(parseCards('3c 2c') as [number, number]))).toBe(false);
  });

  it('reveals a bluff after the hand', () => {
    let g = riggedHeadsUp('Ah Kd', '9c 8c', 'Qs 7d 2h 3s 4d');
    g = applyAction(g, { type: 'call' });
    g = applyAction(g, { type: 'check' });
    g = applyAction(g, { type: 'check' }); // flop: villain checks
    g = applyAction(g, { type: 'check' });
    g = applyAction(g, { type: 'check' }); // turn
    g = applyAction(g, { type: 'check' });
    g = applyAction(g, { type: 'bet', to: 40 }); // river bluff with nine high
    g = applyAction(g, { type: 'call' });
    expect(g.finished).toBe(true);
    const [check] = readChecks(g, 0);
    expect(check.verdict).toBe('bluff');
    expect(check.text).toMatch(/was a bluff/);
  });

  it('spots a river bluff after the opponent checks every round', () => {
    let g = riggedHeadsUp('6h 5d', 'Kc 8c', 'Qs Jd 2h 3s 9d');
    g = applyAction(g, { type: 'raise', to: 30 }); // hero raises pre-flop
    g = applyAction(g, { type: 'call' });
    g = applyAction(g, { type: 'check' }); // flop: villain checks
    const flopLine = handLine(g, 0);
    expect(flopLine.heroRaisedPreflop && flopLine.checkedToHero).toBe(true);
    g = applyAction(g, { type: 'check' });
    g = applyAction(g, { type: 'check' }); // turn
    g = applyAction(g, { type: 'check' });
    g = applyAction(g, { type: 'check' }); // river: villain checks to hero
    const line = handLine(g, 0);
    expect(line.opponentsPassive && line.checkedToHero).toBe(true);
    const reads = buildReads(g, 0);
    const ctx = buildContext({ street: 'river', hole: parseCards('6h 5d'), board: g.board, opponents: 1, pot: 60, toCall: 0, bigBlind: 10, heroStack: 970, iterations: 2000, reads, line, position: 'BTN/SB' });
    const rec = recommend(ctx);
    expect(rec.kind).toBe('bluff');
    expect(rec.move).toBe('bet');
    const advice = beginnerAdvice(ctx, 'BTN/SB');
    expect(advice.headline).toMatch(/I'd bluff here/);
    expect(advice.paragraphs.join(' ')).toMatch(/good moment to bluff/);
  });
});
