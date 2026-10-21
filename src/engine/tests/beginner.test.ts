import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards';
import { beginnerAdvice, beginnerFeedback, describeHoleCards, strengthLabel, timesInTen } from '../beginnerCoach';
import { buildContext, evaluateDecision } from '../coach';
import { type Street, newHand, positionOf } from '../game';
import { DEFAULT_SETTINGS, sanitise } from '../../hooks/useSettings';

const ctx = (street: Street, hole: string, board: string, pot: number, toCall: number, opponents = 2) =>
  buildContext({ street, hole: parseCards(hole), board: board ? parseCards(board) : [], opponents, pot, toCall, bigBlind: 10, heroStack: 1000, iterations: 4000 });

describe('table positions', () => {
  it('names every seat from the dealer button', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => positionOf(s, 0, 6))).toEqual(['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO']);
    expect([0, 1, 2].map((s) => positionOf(s, 1, 3))).toEqual(['BB', 'BTN', 'SB']);
    expect([0, 1].map((s) => positionOf(s, 0, 2))).toEqual(['BTN/SB', 'BB']);
  });

  it('matches who actually posts the blinds', () => {
    for (let n = 2; n <= 6; n++) {
      for (let button = 0; button < n; button++) {
        const seats = Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isHero: i === 0, style: 'balanced' as const }));
        const g = newHand({ seats, handNumber: 1, buttonIndex: button, startingStack: 1000, smallBlind: 5, bigBlind: 10 });
        for (const p of g.players) {
          const pos = positionOf(p.id, button, n);
          if (pos === 'BB') expect(p.committed).toBe(10);
          if (pos === 'SB' || pos === 'BTN/SB') expect(p.committed).toBe(5);
        }
      }
    }
  });
});

describe('beginner coach', () => {
  it('explains 4-6 offsuit in plain words and suggests folding to a raise', () => {
    const lines = describeHoleCards(parseCards('4s 6h'), '64o').join(' ');
    expect(lines).toMatch(/a Six and a Four of different suits — "offsuit"/);
    expect(lines).toMatch(/both are low cards/i);
    expect(lines).toMatch(/1 rank apart/);
    const advice = beginnerAdvice(ctx('preflop', '4s 6h', '', 45, 30), 'UTG', 'Sam');
    expect(advice.move).toBe('fold');
    expect(advice.headline).toBe("I'd fold here.");
    expect(advice.paragraphs.join(' ')).toMatch(/Sam has raised/);
    expect(advice.paragraphs.join(' ')).toMatch(/under the gun/);
  });

  it('describes pocket pairs and big suited cards', () => {
    expect(describeHoleCards(parseCards('Qs Qh'), 'QQ').join(' ')).toMatch(/pair of Queens.*already a strong hand/);
    expect(describeHoleCards(parseCards('As Ks'), 'AKs').join(' ')).toMatch(/both are big cards.*suited adds a small chance of a flush/i);
  });

  it('talks through the flop: hand, dangers, and the price of a call', () => {
    const c = ctx('flop', 'Ah Kd', 'Kh 9h 2h', 60, 30);
    const text = beginnerAdvice(c, 'BTN', 'Alex').paragraphs.join(' ');
    expect(text).toMatch(/pair of kings — the top pair on the board/);
    expect(text).toMatch(/3 hearts on the board/);
    expect(text).toMatch(/Alex bet\. Calling costs 30 to win 90/);
  });

  it('gives one-line feedback', () => {
    const c = ctx('flop', '7c 2d', 'Ah Kh 9s', 30, 0);
    const fb = evaluateDecision(c, 'fold');
    expect(beginnerFeedback(c, 'fold', fb.verdict, fb.recommendation.move)).toBe("✋ That one costs chips — I'd have checked. Checking was free, so there was no reason to fold.");
  });

  it('labels strength and probabilities simply', () => {
    expect(strengthLabel(ctx('flop', 'As Ad', 'Ah 7c 2d', 30, 0)).label).toBe('Very strong');
    expect(strengthLabel(ctx('flop', '7c 2d', 'Ah Kh 9s', 30, 0)).level).toBeLessThanOrEqual(1);
    expect(timesInTen(0.04)).toBe('less than 1 time in 10');
    expect(timesInTen(0.35)).toBe('about 4 times in 10');
  });
});

describe('settings', () => {
  it('drops unknown or removed fields such as an old API key', () => {
    const clean = sanitise({ opponents: 4, apiKey: 'sk-ant-secret', claudeEnabled: true, tutorial: 'yes' });
    expect(clean).toEqual({ ...DEFAULT_SETTINGS, opponents: 4 });
    expect('apiKey' in clean).toBe(false);
  });
});
