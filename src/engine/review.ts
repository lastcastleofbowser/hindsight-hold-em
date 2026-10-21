import { type Card, cardsLabel } from './cards';
import { type ThreatGroup, analyseThreats, calculateEquity, pct } from './analysis';
import { evaluateHand, type HandResult } from './evaluator';
import { explainComparison } from './explain';
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

export type Outcome = 'won' | 'lost' | 'split';
/** What the player says happened at the table ("unknown" if they didn't say). */
export type ReportedResult = Outcome | 'unknown';

export interface Showdown {
  hero: HandResult;
  villains: { hole: Card[]; hand: HandResult }[];
  /** The result according to the rules of Texas Hold'em. */
  outcome: Outcome;
  /** Plain-English reason for the outcome (hero vs the strongest opponent). */
  explanation: string;
  /** Hand types that would have beaten hero on this board, strongest first. */
  beatenBy: ThreatGroup[];
  reported: ReportedResult;
  /** The reported result disagrees with what the cards say. */
  mismatch: boolean;
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

/**
 * Works out who should win by the rules, explains why, and checks the
 * player's reported result against it.
 */
export function resolveShowdown(hole: Card[], board: Card[], villains: Card[][], reported: ReportedResult = 'unknown'): Showdown | null {
  const known = villains.filter((h) => h.length === 2);
  if (board.length < 5 || known.length === 0) return null;
  const hero = evaluateHand([...hole, ...board]);
  const vs = known.map((h) => ({ hole: h, hand: evaluateHand([...h, ...board]) }));
  const top = vs.reduce((a, b) => (b.hand.score > a.hand.score ? b : a));
  const outcome: Outcome = hero.score > top.hand.score ? 'won' : hero.score === top.hand.score ? 'split' : 'lost';
  return {
    hero,
    villains: vs,
    outcome,
    explanation: explainComparison({ label: 'You', hand: hero }, { label: 'Your opponent', hand: top.hand }),
    beatenBy: analyseThreats(hole, board, 1)?.byCategory ?? [],
    reported,
    mismatch: reported !== 'unknown' && reported !== outcome,
  };
}

const OUTCOME_WORDS: Record<Outcome, string> = { won: 'won', lost: 'lost', split: 'split the pot' };
export const outcomeWords = (o: Outcome) => OUTCOME_WORDS[o];

export function reviewHand(decisions: Decision[], showdown: Showdown | null): HandReview {
  const reviews = decisions.map(reviewDecision);
  const worst = reviews.reduce<DecisionReview | null>(
    (w, r) => (VERDICT_RANK[r.feedback.verdict] >= 2 && (!w || VERDICT_RANK[r.feedback.verdict] > VERDICT_RANK[w.feedback.verdict]) ? r : w),
    null,
  );

  const summary: string[] = [];
  // A result that contradicts the rules matters more than anything else.
  if (showdown?.mismatch) {
    summary.push(
      `⚠️ You said you ${OUTCOME_WORDS[showdown.reported as Outcome]}, but by the rules you should have ${OUTCOME_WORDS[showdown.outcome]} — see the showdown check.`,
    );
  }
  const good = reviews.filter((r) => VERDICT_RANK[r.feedback.verdict] <= 1).length;
  if (reviews.length) summary.push(`${good} of ${reviews.length} decision${reviews.length > 1 ? 's' : ''} matched or were close to the recommended play.`);

  if (showdown) {
    const top = showdown.villains.reduce((a, b) => (b.hand.score > a.hand.score ? b : a));
    if (showdown.outcome === 'lost') {
      summary.push(`By the rules you lose this hand: ${showdown.hero.name} vs ${cardsLabel(top.hole)} making ${top.hand.name}.`);
    } else if (showdown.outcome === 'won') {
      summary.push(`By the rules you win this hand: ${showdown.hero.name} beats ${top.hand.name}.`);
    } else summary.push(`By the rules the pot is split — both make ${showdown.hero.name}.`);
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
