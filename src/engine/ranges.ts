import { RANK_CHARS } from './cards';
import type { Position } from './game';

/**
 * Pre-flop range charts for 6-max No-Limit Texas Hold'em at 100 big blinds.
 *
 * These are approximations of widely published solver-style ("GTO-style")
 * opening ranges, simplified to pure raise/fold decisions. They are not the
 * output of a solver run and not taken from any commercial tool; they are a
 * sound baseline for learning which hands to play from each seat.
 */

export type HandKey = string; // "AA", "AKs", "AKo"

/** 13×13 grid of hand keys: pairs on the diagonal, suited above, offsuit below. */
export const GRID: HandKey[][] = Array.from({ length: 13 }, (_, row) =>
  Array.from({ length: 13 }, (_, col) => {
    const hi = RANK_CHARS[12 - Math.min(row, col)];
    const lo = RANK_CHARS[12 - Math.max(row, col)];
    if (row === col) return hi + lo;
    return hi + lo + (col > row ? 's' : 'o');
  }),
);

export const ALL_HANDS: HandKey[] = GRID.flat();

/** Number of two-card combinations a hand key represents. */
export const combos = (h: HandKey) => (h.length === 2 ? 6 : h.endsWith('s') ? 4 : 12);

const rank = (c: string) => {
  const r = RANK_CHARS.indexOf(c);
  if (r < 0) throw new Error(`Bad rank "${c}"`);
  return r;
};

/**
 * Parses standard range notation into hand → frequency.
 * Supports: "AA", "AKs", "AKo", "22+", "A2s+", "KTo+", "99-55" / "22-99", "K9s-K5s", and an
 * optional ":0.5" frequency suffix on any token.
 */
export function parseRange(text: string): Map<HandKey, number> {
  const out = new Map<HandKey, number>();
  for (const raw of text.split(',').map((t) => t.trim()).filter(Boolean)) {
    const [token, freqText] = raw.split(':');
    const freq = freqText === undefined ? 1 : Number(freqText);
    const add = (h: HandKey) => out.set(h, freq);
    const dash = token.split('-');
    if (dash.length === 2) {
      const [a, b] = dash;
      // Either order works: "99-55" or "22-99".
      const span = (x: number, y: number) => [Math.min(x, y), Math.max(x, y)];
      if (a.length === 2) {
        const [lo, hi] = span(rank(a[0]), rank(b[0]));
        for (let r = lo; r <= hi; r++) add(RANK_CHARS[r] + RANK_CHARS[r]);
      } else {
        // Same high card, e.g. K9s-K5s.
        const [lo, hi] = span(rank(a[1]), rank(b[1]));
        for (let r = lo; r <= hi; r++) add(a[0] + RANK_CHARS[r] + a[2]);
      }
      continue;
    }
    const plus = token.endsWith('+');
    const t = plus ? token.slice(0, -1) : token;
    if (t.length === 2 && t[0] === t[1]) {
      for (let r = rank(t[0]); r <= (plus ? 12 : rank(t[0])); r++) add(RANK_CHARS[r] + RANK_CHARS[r]);
    } else if (t.length === 3) {
      const hi = rank(t[0]);
      for (let r = rank(t[1]); r <= (plus ? hi - 1 : rank(t[1])); r++) add(t[0] + RANK_CHARS[r] + t[2]);
    } else {
      throw new Error(`Bad range token "${raw}"`);
    }
  }
  return out;
}

export type ChartId = 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'HU' | 'BB';

export interface RangeChart {
  id: ChartId;
  title: string;
  description: string;
  /** Hands to raise (or 3-bet, for the big blind chart). */
  raise: Map<HandKey, number>;
  /** Hands to call (big blind defence only). */
  call: Map<HandKey, number>;
}

const chart = (id: ChartId, title: string, description: string, raise: string, call = ''): RangeChart => ({
  id,
  title,
  description,
  raise: parseRange(raise),
  call: parseRange(call),
});

export const CHARTS: Record<ChartId, RangeChart> = {
  UTG: chart(
    'UTG',
    'Under the gun — raise first in',
    'First to act with five players behind you, so open only strong hands: pairs, suited aces, and big or well-connected suited cards.',
    '22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, 65s, AJo+, KQo',
  ),
  MP: chart(
    'MP',
    'Middle position — raise first in',
    'Four players still to act: a little wider than under the gun.',
    '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, 54s, ATo+, KJo+, QJo',
  ),
  CO: chart(
    'CO',
    'Cutoff — raise first in',
    'Only the button and blinds are left to act, so you can open more suited hands and decent offsuit Broadway cards.',
    '22+, A2s+, K5s+, Q7s+, J8s+, T7s+, 97s+, 86s+, 75s+, 64s+, 54s, A8o+, KTo+, QTo+, JTo',
  ),
  BTN: chart(
    'BTN',
    'Button — raise first in',
    'The best seat: you act last after the flop, so you can open almost half of all hands.',
    '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T8o+, 98o, 87o',
  ),
  SB: chart(
    'SB',
    'Small blind — raise first in',
    'Everyone folded to you, and only the big blind is left. You act first after the flop, so stay a bit tighter than the button.',
    '22+, A2s+, K3s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A4o+, K9o+, Q9o+, J9o+, T9o',
  ),
  HU: chart(
    'HU',
    'Heads-up dealer (small blind) — raise first in',
    'With only two players, the dealer posts the small blind and acts last after the flop — so raise most hands.',
    '22+, A2s+, K2s+, Q2s+, J3s+, T4s+, 94s+, 84s+, 74s+, 63s+, 53s+, 43s, A2o+, K4o+, Q6o+, J7o+, T7o+, 97o+, 87o, 76o',
  ),
  BB: chart(
    'BB',
    'Big blind — defending against a button raise',
    "You've already paid a big blind, so you get a good price to continue. Re-raise (3-bet) the strongest hands and some suited aces as bluffs; call a wide range.",
    'TT+, AJs+, KQs, A5s, A4s, AQo+',
    '22-99, A2s-ATs, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o-AJo, K7o+, Q8o+, J8o+, T8o+, 98o, 87o, 76o',
  ),
};

/** Which raise-first-in chart applies to a table position. */
export function chartFor(position: Position): ChartId {
  switch (position) {
    case 'BTN/SB':
      return 'HU';
    case 'BB':
      return 'BB';
    default:
      return position;
  }
}

export type ChartAction = 'raise' | 'call' | 'fold';

export function chartAction(id: ChartId, hand: HandKey): ChartAction {
  const c = CHARTS[id];
  if ((c.raise.get(hand) ?? 0) >= 0.5) return 'raise';
  if ((c.call.get(hand) ?? 0) >= 0.5) return 'call';
  return 'fold';
}

/** Share of all 1,326 starting combinations in a range. */
export function rangeShare(range: Map<HandKey, number>): number {
  let total = 0;
  for (const [h, f] of range) total += combos(h) * f;
  return total / 1326;
}
