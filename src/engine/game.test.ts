import { describe, expect, it } from 'vitest';
import { seededRng } from './cards';
import { decideBotAction } from './bots';
import { type BotStyle, applyAction, legalActions, netResult, newHand, potSize } from './game';

const STYLES: BotStyle[] = ['tight', 'balanced', 'loose', 'aggressive'];

function table(n: number) {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isHero: i === 0, style: STYLES[i % STYLES.length] }));
}

describe('game engine', () => {
  it('posts blinds and puts the right player first to act', () => {
    const s = newHand({ seats: table(4), handNumber: 1, buttonIndex: 0, startingStack: 1000, smallBlind: 5, bigBlind: 10 });
    expect(s.players[1].committed).toBe(5);
    expect(s.players[2].committed).toBe(10);
    expect(s.toAct).toBe(3);
    expect(s.players.every((p) => p.hole.length === 2)).toBe(true);
  });

  it('heads-up: button is the small blind and acts first pre-flop, last post-flop', () => {
    let s = newHand({ seats: table(2), handNumber: 1, buttonIndex: 0, startingStack: 1000, smallBlind: 5, bigBlind: 10 });
    expect(s.players[0].committed).toBe(5);
    expect(s.toAct).toBe(0);
    s = applyAction(s, { type: 'call' });
    expect(s.toAct).toBe(1); // big blind's option
    s = applyAction(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(1);
  });

  it('gives the pot to the last player standing', () => {
    let s = newHand({ seats: table(3), handNumber: 1, buttonIndex: 0, startingStack: 1000, smallBlind: 5, bigBlind: 10 });
    s = applyAction(s, { type: 'raise', to: 30 }); // button
    s = applyAction(s, { type: 'fold' }); // SB
    s = applyAction(s, { type: 'fold' }); // BB
    expect(s.finished).toBe(true);
    expect(s.winners[0]).toEqual({ playerId: 0, amount: 45 });
    expect(netResult(s, 0)).toBe(15);
  });

  it('runs the board out when everyone is all-in', () => {
    let s = newHand({ seats: table(2), handNumber: 1, buttonIndex: 0, startingStack: 1000, smallBlind: 5, bigBlind: 10 });
    s = applyAction(s, { type: 'raise', to: 1000 });
    s = applyAction(s, { type: 'call' });
    expect(s.finished).toBe(true);
    expect(s.board).toHaveLength(5);
    expect(s.showdown).toBe(true);
  });

  it('conserves chips and always terminates across thousands of bot hands', () => {
    const rng = seededRng(42);
    for (let hand = 0; hand < 1500; hand++) {
      const n = 2 + (hand % 5);
      let s = newHand({ seats: table(n), handNumber: hand, buttonIndex: hand % n, startingStack: 1000, smallBlind: 5, bigBlind: 10, rng });
      let steps = 0;
      while (!s.finished) {
        const legal = legalActions(s);
        expect(legal.minTo).toBeLessThanOrEqual(legal.maxTo);
        s = applyAction(s, decideBotAction(s, rng));
        if (++steps > 200) throw new Error('hand did not terminate');
      }
      const total = s.players.reduce((sum, p) => sum + p.stack, 0);
      expect(total).toBe(1000 * n);
      expect(s.winners.reduce((sum, w) => sum + w.amount, 0)).toBe(potSize(s));
    }
  });
});
