import { type Card, cardsLabel } from './cards';
import { calculateEquity, pct } from './analysis';
import { evaluateHand, type HandResult } from './evaluator';
import {
  type CoachFeedback,
  type DecisionContext,
  type ReasonTag,
  type Verdict,
  evaluateDecision,
  inferReasons,
  respondToReason,
} from './coach';
import type { ActionType } from './game';
import { STREET_LABELS } from './game';

/** One decision hero made, with what they knew and (optionally) why. */
export interface Decision {
  ctx: DecisionContext;
  action: ActionType;
  amountTo?: number;
  reasons: ReasonTag[];
  note: string;
  /** Actual holdings of the opponents still in at this moment, if known. */
  villainHoles: Card[][];
}

export interface DecisionReview {
  decision: Decision;
  feedback: CoachFeedback;
  reasonReplies: string[];
  /** Hero's true equity against the real opponent cards, if known. */
  hindsightEquity: number | null;
}

export interface Showdown {
  hero: HandResult;
  villains: { hole: Card[]; hand: HandResult }[];
  outcome: 'won' | 'lost' | 'split';
}

export interface HandReview {
  decisions: DecisionReview[];
  showdown: Showdown | null;
  /** The decision that cost the most, if any were off. */
  biggestLeak: DecisionReview | null;
  summary: string[];
}

const VERDICT_RANK: Record<Verdict, number> = { great: 0, good: 1, questionable: 2, mistake: 3 };

export function reviewDecision(d: Decision): DecisionReview {
  const feedback = evaluateDecision(d.ctx, d.action, d.amountTo);
  const tags = [...new Set([...d.reasons, ...inferReasons(d.note)])];
  const reasonReplies = tags.length || d.note.trim() ? respondToReason(d.ctx, d.action, tags, d.amountTo) : [];
  let hindsightEquity: number | null = null;
  const known = d.villainHoles.filter((h) => h.length === 2);
  if (known.length > 0) {
    hindsightEquity = calculateEquity({
      hero: d.ctx.hole,
      board: d.ctx.board,
      opponents: known.length,
      knownOpponents: known,
      iterations: 4000,
    }).equity;
  }
  return { decision: d, feedback, reasonReplies, hindsightEquity };
}

export function resolveShowdown(hole: Card[], board: Card[], villains: Card[][]): Showdown | null {
  const known = villains.filter((h) => h.length === 2);
  if (board.length < 5 || known.length === 0) return null;
  const hero = evaluateHand([...hole, ...board]);
  const vs = known.map((h) => ({ hole: h, hand: evaluateHand([...h, ...board]) }));
  const best = Math.max(...vs.map((v) => v.hand.score));
  const outcome = hero.score > best ? 'won' : hero.score === best ? 'split' : 'lost';
  return { hero, villains: vs, outcome };
}

export function reviewHand(decisions: Decision[], showdown: Showdown | null): HandReview {
  const reviews = decisions.map(reviewDecision);
  const worst = reviews.reduce<DecisionReview | null>(
    (w, r) => (VERDICT_RANK[r.feedback.verdict] >= 2 && (!w || VERDICT_RANK[r.feedback.verdict] > VERDICT_RANK[w.feedback.verdict]) ? r : w),
    null,
  );

  const summary: string[] = [];
  const good = reviews.filter((r) => VERDICT_RANK[r.feedback.verdict] <= 1).length;
  if (reviews.length) summary.push(`${good} of ${reviews.length} decision${reviews.length > 1 ? 's' : ''} matched or were close to the recommended play.`);

  if (showdown) {
    const top = showdown.villains.reduce((a, b) => (b.hand.score > a.hand.score ? b : a));
    if (showdown.outcome === 'lost') {
      summary.push(`You lost with ${showdown.hero.name} to ${cardsLabel(top.hole)} making ${top.hand.name}.`);
    } else if (showdown.outcome === 'won') {
      summary.push(`You won with ${showdown.hero.name} against ${top.hand.name}.`);
    } else summary.push(`The pot was split — both made ${showdown.hero.name}.`);
  }

  const luckSwing = reviews.find((r) => r.hindsightEquity !== null && r.hindsightEquity >= 0.6);
  if (showdown?.outcome === 'lost' && !worst) {
    summary.push(`Your decisions were sound — this was a cooler or bad luck, not a mistake. Judge decisions by what you knew, not by the result.`);
  } else if (showdown?.outcome === 'lost' && luckSwing) {
    summary.push(
      `With hindsight you were a ${pct(luckSwing.hindsightEquity!)} favourite on the ${STREET_LABELS[luckSwing.decision.ctx.street].toLowerCase()} — the cards just didn't hold.`,
    );
  } else if (showdown?.outcome === 'won' && worst) {
    summary.push(`You won this one, but winning doesn't make every decision right. Look at the ${STREET_LABELS[worst.decision.ctx.street].toLowerCase()}.`);
  }
  if (worst) {
    summary.push(`Biggest leak — ${STREET_LABELS[worst.decision.ctx.street]}: you chose to ${worst.decision.action}. ${worst.feedback.headline}`);
  }
  return { decisions: reviews, showdown, biggestLeak: worst, summary };
}
