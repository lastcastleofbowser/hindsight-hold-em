import { type Card, cardsLabel, rankOf } from './cards';
import { bettingRange, startingHand } from './analysis';
import { Category, categoryOf, evaluate, evaluateHand } from './evaluator';
import { type GameState, type Position, POSITION_NAMES, type Street, STREET_LABELS, positionOf } from './game';
import { CHARTS, chartAction, chartFor, rangeShare } from './ranges';

/**
 * Opponent reads: turns what each opponent has done this hand into a range
 * of plausible holdings and a plain-English summary ("raised from under the
 * gun, then bet big on the turn — very strong or a bluff"). The coach measures
 * hero's equity against these ranges instead of against random cards.
 */

export type StepKind = 'open' | '3bet' | 'call-raise' | 'limp' | 'check-option' | 'bet-small' | 'bet-big' | 'raise' | 'call-bet' | 'check';
export type LineStrength = 'weak' | 'medium' | 'strong' | 'polarised' | 'unknown';

export interface ReadStep {
  street: Street;
  kind: StepKind;
  text: string;
  /** Board when the action happened. */
  board: Card[];
}

export interface OpponentRead {
  playerId: number;
  name: string;
  position: Position;
  steps: ReadStep[];
  strength: LineStrength;
  summary: string;
  /** Probabilistic membership for simulations (bluffs and slow-plays included at low weight). */
  accepts: (a: Card, b: Card) => boolean;
  /** Deterministic "is this a typical holding for that line?" */
  fits: (a: Card, b: Card) => boolean;
}

const boardAt = (game: GameState, street: Street) => game.board.slice(0, street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5);

/** Two pair or better using a hole card, or top pair with a good kicker / an overpair. */
function strongHand(a: Card, b: Card, board: Card[]): boolean {
  const score = evaluate([a, b, ...board]);
  const cat = categoryOf(score);
  const boardCat = categoryOf(evaluate(board));
  if (cat >= Category.TwoPair && cat > boardCat) return true;
  if (cat !== Category.Pair) return false;
  const pair = (score >> 16) & 0xf;
  const top = Math.max(...board.map(rankOf));
  const kicker = Math.max(...[a, b].map(rankOf).filter((r) => r !== pair), 0);
  return pair > top || (pair === top && kicker >= 8);
}

/** Any pair using a hole card, or a draw. */
function continuingHand(a: Card, b: Card, board: Card[]): boolean {
  const cat = categoryOf(evaluate([a, b, ...board]));
  if (cat > categoryOf(evaluate(board))) return true;
  return bettingRange(board)(a, b);
}

/** Probability that a holding fits one step of the line. */
function weight(step: ReadStep, position: Position, a: Card, b: Card): number {
  const { chen, notation } = startingHand([a, b]);
  switch (step.kind) {
    case 'open':
      return chartAction(chartFor(position) === 'BB' ? 'SB' : chartFor(position), notation) === 'raise' ? 1 : 0.05;
    case '3bet':
      return chen >= 10 ? 1 : 0.1;
    case 'call-raise':
      return chen >= 6 ? 1 : chen >= 4 ? 0.4 : 0.05;
    case 'limp':
      return chen >= 12 ? 0.2 : chen >= 3 ? 1 : 0.4;
    case 'check-option':
      return chen >= 12 ? 0.3 : 1;
    case 'bet-small':
      return bettingRange(step.board)(a, b) ? 1 : 0.25;
    case 'bet-big':
    case 'raise':
      return strongHand(a, b, step.board) ? 1 : bettingRange(step.board)(a, b) ? 0.45 : 0.2;
    case 'call-bet':
      return continuingHand(a, b, step.board) ? 1 : 0.1;
    case 'check': {
      const cat = categoryOf(evaluate([a, b, ...step.board]));
      return cat >= Category.TwoPair && cat > categoryOf(evaluate(step.board)) ? 0.3 : 1;
    }
  }
}

function describeStep(step: ReadStep, position: Position, sizes: { bet: number; pot: number }): string {
  const round = STREET_LABELS[step.street].toLowerCase();
  switch (step.kind) {
    case 'open': {
      const share = Math.round(rangeShare(CHARTS[chartFor(position) === 'BB' ? 'SB' : chartFor(position)].raise) * 100);
      return `raised first from the ${POSITION_NAMES[position].toLowerCase()} seat — players usually open only about ${share}% of hands from there`;
    }
    case '3bet':
      return 're-raised before the flop — usually a very strong hand such as a big pair or Ace-King';
    case 'call-raise':
      return 'called a raise before the flop — a decent hand, but probably not a premium one (those usually re-raise)';
    case 'limp':
      return 'just called the big blind before the flop — often a speculative hand';
    case 'check-option':
      return 'checked in the big blind — that could be any two cards';
    case 'bet-small':
      return `bet ${sizes.bet} into ${sizes.pot} on the ${round} — a normal-sized bet, usually a pair or better or a draw`;
    case 'bet-big':
      return `bet ${sizes.bet} into ${sizes.pot} on the ${round} — a big bet: usually a very strong hand, or a bluff trying to look like one`;
    case 'raise':
      return `raised on the ${round} — raises after the flop usually mean a strong hand (or a bold bluff)`;
    case 'call-bet':
      return `called a bet on the ${round} — usually a pair or a draw`;
    case 'check':
      return `checked on the ${round} — usually not a strong hand`;
  }
}

const STRENGTH_TEXT: Record<LineStrength, string> = {
  weak: 'So far that looks like a weak hand.',
  medium: 'So far that looks like a medium-strength hand — something worth calling with, not raising.',
  strong: 'So far that looks like a strong hand (or a good draw).',
  polarised: 'That line is "polarised": either very strong or a bluff, rarely in between.',
  unknown: '',
};

/** Builds a read for every opponent still in the hand. */
export function buildReads(game: GameState, heroId: number, rng: () => number = Math.random): OpponentRead[] {
  const n = game.players.length;
  const reads: OpponentRead[] = [];
  for (const p of game.players) {
    if (p.id === heroId || p.folded) continue;
    const position = positionOf(p.id, game.buttonIndex, n);
    const steps: ReadStep[] = [];
    const texts: string[] = [];
    let preflopRaises = 0;
    for (const a of game.log) {
      const mine = a.playerId === p.id;
      if (a.street === 'preflop') {
        if (mine) {
          let kind: StepKind | null = null;
          if (a.type === 'raise') kind = preflopRaises === 0 ? 'open' : '3bet';
          else if (a.type === 'call') kind = preflopRaises > 0 ? 'call-raise' : 'limp';
          else if (a.type === 'check') kind = 'check-option';
          if (kind) {
            const step = { street: a.street, kind, text: '', board: [] };
            step.text = describeStep(step, position, { bet: a.added, pot: a.potBefore });
            steps.push(step);
          }
        }
        if (a.type === 'raise') preflopRaises++;
        continue;
      }
      if (!mine) continue;
      const board = boardAt(game, a.street);
      let kind: StepKind | null = null;
      if (a.type === 'bet') kind = a.added >= 0.75 * a.potBefore ? 'bet-big' : 'bet-small';
      else if (a.type === 'raise') kind = 'raise';
      else if (a.type === 'call') kind = 'call-bet';
      else if (a.type === 'check') kind = 'check';
      if (!kind) continue;
      const step = { street: a.street, kind, text: '', board };
      step.text = describeStep(step, position, { bet: a.added, pot: a.potBefore });
      steps.push(step);
    }
    for (const s of steps) texts.push(s.text);

    const postflop = steps.filter((s) => s.street !== 'preflop');
    const last = postflop[postflop.length - 1] ?? steps[steps.length - 1];
    const strength: LineStrength = !last
      ? 'unknown'
      : last.kind === 'bet-big' || last.kind === 'raise' || last.kind === '3bet'
        ? 'polarised'
        : last.kind === 'bet-small' || last.kind === 'open'
          ? 'strong'
          : last.kind === 'call-bet' || last.kind === 'call-raise'
            ? 'medium'
            : postflop.length && postflop.every((s) => s.kind === 'check')
              ? 'weak'
              : last.kind === 'check-option' || last.kind === 'limp'
                ? 'weak'
                : 'unknown';

    const summary = steps.length ? `${p.name} ${texts.join('; then ')}. ${STRENGTH_TEXT[strength]}`.trim() : `${p.name} hasn't acted yet.`;
    reads.push({
      playerId: p.id,
      name: p.name,
      position,
      steps,
      strength,
      summary,
      accepts: (a, b) => {
        let w = 1;
        for (const s of steps) w *= weight(s, position, a, b);
        return w >= 1 || rng() < w;
      },
      fits: (a, b) => steps.every((s) => weight(s, position, a, b) >= 0.5),
    });
  }
  return reads;
}

// ---------------------------------------------------------------------------
// After the hand: did the read match what they really had?
// ---------------------------------------------------------------------------

export interface ReadCheck {
  playerId: number;
  text: string;
  /** "bluff" when an aggressive line was made with a weak hand. */
  verdict: 'honest' | 'bluff' | 'semi-bluff';
}

export function readChecks(game: GameState, heroId: number): ReadCheck[] {
  const out: ReadCheck[] = [];
  for (const p of game.players) {
    if (p.id === heroId) continue;
    const bets = game.log.filter((a) => a.playerId === p.id && a.street !== 'preflop' && (a.type === 'bet' || a.type === 'raise'));
    const last = bets[bets.length - 1];
    if (!last) continue;
    const board = boardAt(game, last.street);
    const [a, b] = p.hole;
    const big = last.type === 'raise' || last.added >= 0.75 * last.potBefore;
    const what = `${last.type === 'raise' ? 'raise' : big ? 'big bet' : 'bet'} on the ${STREET_LABELS[last.street].toLowerCase()}`;
    const held = `${cardsLabel(p.hole)} (${evaluateHand([a, b, ...board]).name.toLowerCase()} at the time)`;
    if (strongHand(a, b, board) || (!big && continuingHand(a, b, board) && categoryOf(evaluate([a, b, ...board])) > categoryOf(evaluate(board)))) {
      out.push({ playerId: p.id, verdict: 'honest', text: `${p.name}'s ${what} represented a real hand — and it was: ${p.name} had ${held}.` });
    } else if (bettingRange(board)(a, b) && board.length < 5) {
      out.push({ playerId: p.id, verdict: 'semi-bluff', text: `${p.name}'s ${what} was a semi-bluff: ${p.name} had ${held} — a draw hoping to improve or make you fold.` });
    } else {
      out.push({ playerId: p.id, verdict: 'bluff', text: `${p.name}'s ${what} was a bluff! ${p.name} had ${held} and was trying to make better hands fold.` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hero's own line, for spotting bluffing opportunities.
// ---------------------------------------------------------------------------

export interface HandLine {
  /** Hero made the last raise before the flop. */
  heroRaisedPreflop: boolean;
  /** No opponent has bet or raised after the flop. */
  opponentsPassive: boolean;
  /** Every opponent who acted this round checked (nobody has bet). */
  checkedToHero: boolean;
  /** How many post-flop rounds every opponent has checked. */
  checkedRounds: number;
}

export function handLine(game: GameState, heroId: number): HandLine {
  const preflopRaises = game.log.filter((a) => a.street === 'preflop' && a.type === 'raise');
  const heroRaisedPreflop = preflopRaises.length > 0 && preflopRaises[preflopRaises.length - 1].playerId === heroId;
  const post = game.log.filter((a) => a.street !== 'preflop' && a.playerId !== heroId);
  const opponentsPassive = post.every((a) => a.type !== 'bet' && a.type !== 'raise');
  const thisStreet = post.filter((a) => a.street === game.street);
  const checkedToHero = game.currentBet === 0 && thisStreet.length > 0 && thisStreet.every((a) => a.type === 'check');
  const rounds = new Set(post.filter((a) => a.type === 'check').map((a) => a.street));
  return { heroRaisedPreflop, opponentsPassive, checkedToHero, checkedRounds: opponentsPassive ? rounds.size : 0 };
}
