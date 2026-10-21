import { type Card, cardsLabel } from './cards';
import {
  type EquityResult,
  type NutsInfo,
  type OutsReport,
  type StartingHandInfo,
  type ThreatReport,
  analyseThreats,
  bettingRange,
  calculateEquity,
  countOuts,
  findNuts,
  pct,
  requiredEquity,
  startingHand,
} from './analysis';
import type { ActionType, Street } from './game';
import { STREET_LABELS } from './game';

/**
 * Everything the coach knows at the moment hero acts. Built from the live
 * game or from a hand the user recreates in Hand Review.
 */
export interface DecisionContext {
  street: Street;
  hole: Card[];
  board: Card[];
  /** Opponents still in the hand. */
  opponents: number;
  /** Pot before hero acts (including chips already bet this street). */
  pot: number;
  toCall: number;
  bigBlind: number;
  heroStack: number;
  /** Equity against random hands. */
  equity: EquityResult;
  /** Equity against a typical betting range; set when hero faces a bet after the flop. */
  rangeEquity: EquityResult | null;
  threats: ThreatReport | null;
  outs: OutsReport | null;
  nuts: NutsInfo | null;
  start: StartingHandInfo;
}

export function buildContext(args: {
  street: Street;
  hole: Card[];
  board: Card[];
  opponents: number;
  pot: number;
  toCall: number;
  bigBlind: number;
  heroStack: number;
  iterations?: number;
  equity?: EquityResult;
}): DecisionContext {
  const opponents = Math.max(1, args.opponents);
  const iterations = args.iterations ?? 6000;
  return {
    ...args,
    opponents,
    equity: args.equity ?? calculateEquity({ hero: args.hole, board: args.board, opponents, iterations }),
    rangeEquity: facingBetEquity(args.hole, args.board, opponents, args.toCall, iterations),
    threats: analyseThreats(args.hole, args.board, opponents),
    outs: countOuts(args.hole, args.board),
    nuts: findNuts(args.board),
    start: startingHand(args.hole),
  };
}

export type Verdict = 'great' | 'good' | 'questionable' | 'mistake';
export type Move = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export const VERDICT_LABELS: Record<Verdict, string> = {
  great: 'Great decision',
  good: 'Reasonable',
  questionable: 'Questionable',
  mistake: 'Mistake',
};

export interface Recommendation {
  move: Move;
  /** Moves that are also fine in this spot. */
  acceptable: Move[];
  why: string;
}

/** Fair share of the pot if everyone's hand were equal. */
export const fairShare = (opponents: number) => 1 / (opponents + 1);

/**
 * Equity vs random hands overstates our chances when someone has bet, so
 * after the flop we measure against a betting range instead (see `bettingRange`).
 */
export function facingBetEquity(hole: Card[], board: Card[], opponents: number, toCall: number, iterations: number): EquityResult | null {
  if (toCall <= 0 || board.length < 3) return null;
  return calculateEquity({ hero: hole, board, opponents, iterations, opponentFilter: bettingRange(board) });
}

export function realisticEquity(ctx: DecisionContext): number {
  return ctx.rangeEquity?.equity ?? ctx.equity.equity;
}

/** How often a bet must make everyone fold to profit on its own: bet / (pot + bet). */
export const bluffBreakeven = (bet: number, pot: number) => bet / (pot + bet);

/** Equity at which betting for value becomes clearly profitable. */
export function valueLine(opponents: number): number {
  const fs = fairShare(opponents);
  return fs + (1 - fs) * 0.2;
}

const hasStrongDraw = (ctx: DecisionContext) =>
  !!ctx.outs && ctx.outs.total >= 8 && (ctx.street === 'flop' || ctx.street === 'turn');

export function recommend(ctx: DecisionContext): Recommendation {
  const eq = realisticEquity(ctx);
  const need = requiredEquity(ctx.toCall, ctx.pot);
  const value = valueLine(ctx.opponents);

  if (ctx.street === 'preflop') {
    const { tier, notation } = ctx.start;
    const facingRaise = ctx.toCall > ctx.bigBlind;
    if (tier === 'Premium') return { move: 'raise', acceptable: ['raise', 'bet'], why: `${notation} is a premium hand — raise to build the pot and thin the field.` };
    if (!facingRaise) {
      if (tier === 'Strong') return { move: 'raise', acceptable: ['raise', 'bet', 'call'], why: `${notation} is strong enough to open with a raise.` };
      if (tier === 'Playable')
        return ctx.toCall === 0
          ? { move: 'check', acceptable: ['check', 'raise', 'bet'], why: `${notation} is playable; checking your option is fine.` }
          : { move: 'call', acceptable: ['call', 'raise'], why: `${notation} is playable for a small price.` };
      if (ctx.toCall === 0) return { move: 'check', acceptable: ['check'], why: `Free flop in the big blind — never fold for free.` };
      if (tier === 'Marginal' && ctx.toCall <= ctx.bigBlind / 2)
        return { move: 'call', acceptable: ['call', 'fold'], why: `${notation} is marginal; completing the small blind is cheap.` };
      return { move: 'fold', acceptable: ['fold'], why: `${notation} is ${tier.toLowerCase()} — it loses money over time from here.` };
    }
    if (tier === 'Strong') return { move: 'call', acceptable: ['call', 'raise'], why: `${notation} is strong enough to continue against a raise.` };
    if (tier === 'Playable' && need <= 0.25) return { move: 'call', acceptable: ['call', 'fold'], why: `${notation} can call a small raise and see a flop.` };
    return { move: 'fold', acceptable: ['fold'], why: `${notation} is too weak to call a raise.` };
  }

  if (ctx.toCall > 0) {
    if (eq >= value + 0.1) return { move: 'raise', acceptable: ['raise', 'call'], why: `You're well ahead of a typical betting range — raise for value.` };
    if (eq >= need) return { move: 'call', acceptable: ['call'], why: `Your equity (${pct(eq)}) beats the ${pct(need)} the pot odds require.` };
    if (hasStrongDraw(ctx) && eq >= need * 0.75)
      return { move: 'call', acceptable: ['call', 'fold'], why: `Slightly short on direct odds, but ${ctx.outs!.total} outs give implied odds when you hit.` };
    return { move: 'fold', acceptable: ['fold'], why: `You need ${pct(need)} equity to call but only have about ${pct(eq)}.` };
  }

  if (eq >= value) return { move: 'bet', acceptable: ['bet', 'raise'], why: `With ${pct(eq)} equity vs ${ctx.opponents} opponent(s) you should bet for value.` };
  if (hasStrongDraw(ctx)) return { move: 'bet', acceptable: ['bet', 'raise', 'check'], why: `A semi-bluff with ${ctx.outs!.total} outs can win now or improve later.` };
  return {
    move: 'check',
    acceptable: ['check'],
    why:
      ctx.street === 'river'
        ? `Your hand isn't strong enough to bet for value — on the river a bet mostly gets called by hands that beat you.`
        : `Your hand isn't strong enough to bet for value — take the free card.`,
  };
}

export interface CoachFeedback {
  verdict: Verdict;
  headline: string;
  recommendation: Recommendation;
  /** Numbers and reasoning, one sentence each. */
  points: string[];
}

const normalise = (action: ActionType): Move => action;
const isAggressive = (m: Move) => m === 'bet' || m === 'raise';

export function evaluateDecision(ctx: DecisionContext, action: ActionType, amountTo?: number): CoachFeedback {
  const rec = recommend(ctx);
  const move = normalise(action);
  const eq = realisticEquity(ctx);
  const need = requiredEquity(ctx.toCall, ctx.pot);
  const sameFamily = (a: Move, b: Move) => a === b || (isAggressive(a) && isAggressive(b));

  let verdict: Verdict;
  if (sameFamily(move, rec.move)) verdict = 'great';
  else if (rec.acceptable.some((m) => sameFamily(m, move))) verdict = 'good';
  else if (move === 'fold' && ctx.toCall === 0) verdict = 'mistake';
  else if (move === 'fold') verdict = eq > need + 0.1 ? 'mistake' : 'questionable';
  else if (move === 'call') verdict = eq < need - 0.1 ? 'mistake' : 'questionable';
  else if (isAggressive(move)) verdict = rec.move === 'fold' && eq < need - 0.15 ? 'mistake' : 'questionable';
  else verdict = 'questionable'; // passive when aggression was best: missed value

  const points: string[] = [];
  points.push(
    `Equity: ${pct(ctx.equity.equity)} against ${ctx.opponents} random hand${ctx.opponents > 1 ? 's' : ''} (an even share would be ${pct(fairShare(ctx.opponents))}).`,
  );
  if (ctx.toCall > 0) {
    points.push(`Pot odds: calling ${ctx.toCall} into ${ctx.pot} needs ${pct(need)} equity to break even.`);
    if (ctx.rangeEquity) points.push(`Players who bet usually hold a pair or a draw. Against that kind of range your equity is about ${pct(eq)}.`);
  }
  if (ctx.threats) {
    points.push(`Right now you hold ${ctx.threats.hero.name}. Chance at least one opponent is already ahead: ${pct(ctx.threats.pBeatAny)}.`);
  }
  if (ctx.outs && ctx.outs.total > 0) {
    const desc = ctx.outs.groups.map((g) => `${g.cards.length} to a ${g.name.toLowerCase()}`).join(', ');
    points.push(`Outs: ${ctx.outs.total} (${desc}) — ${pct(ctx.outs.hitByRiver)} to hit by the river.`);
  }
  if (move === 'fold' && ctx.toCall === 0) points.push('You could have checked for free. Never fold when checking costs nothing.');
  if (isAggressive(move) && amountTo !== undefined && ctx.heroStack > 0) {
    const sizing = amountTo / Math.max(1, ctx.pot);
    if (amountTo >= ctx.heroStack && eq < 0.6 && ctx.street !== 'preflop')
      points.push('Moving all-in risks your whole stack with a hand that is far from a lock; a smaller bet loses less when you are behind.');
    else if (sizing > 1.5 && eq < value(ctx)) points.push('That bet size is very large for your hand strength — weaker hands fold and better ones call.');
    if (ctx.street !== 'preflop' && eq < value(ctx)) {
      points.push(`As a bluff, betting ${amountTo} into ${ctx.pot} has to make them fold ${pct(bluffBreakeven(amountTo, ctx.pot))} of the time just to break even.`);
    }
  }

  const headline =
    verdict === 'great'
      ? `Good ${move}. ${rec.why}`
      : verdict === 'good'
        ? `A ${move} is fine here, though ${rec.move} is slightly better. ${rec.why}`
        : `Better was to ${rec.move}. ${rec.why}`;

  return { verdict, headline, recommendation: rec, points };
}

const value = (ctx: DecisionContext) => valueLine(ctx.opponents);

// ---------------------------------------------------------------------------
// "Why did you do that?" — responding to the player's stated reasoning.
// ---------------------------------------------------------------------------

export type ReasonTag = 'value' | 'bluff' | 'draw' | 'odds' | 'scared' | 'cheap' | 'position' | 'gut';

export const REASON_OPTIONS: { tag: ReasonTag; label: string }[] = [
  { tag: 'value', label: 'I think I have the best hand' },
  { tag: 'bluff', label: 'Bluffing — trying to make them fold' },
  { tag: 'draw', label: "I'm drawing to a better hand" },
  { tag: 'odds', label: 'The pot odds were right' },
  { tag: 'scared', label: 'Worried someone has me beat' },
  { tag: 'cheap', label: 'It was cheap to see another card' },
  { tag: 'gut', label: 'Gut feeling' },
];

const KEYWORDS: [ReasonTag, RegExp][] = [
  ['bluff', /bluff|fold out|scare (them|him|her)|represent/i],
  ['draw', /draw|flush|straight|outs?\b|hit|chase/i],
  ['odds', /odds|price|ratio|math|percent|%/i],
  ['scared', /scared|afraid|worried|beat|better hand|trap|nervous|fear/i],
  ['cheap', /cheap|small|free|only \d+|see (a|the|another)/i],
  ['position', /position|last to act|button/i],
  ['value', /best hand|strong|nuts|value|top pair|good hand|ahead|monster/i],
  ['gut', /\bgut\b|feel|felt|instinct|vibe|random|guess/i],
];

/** Infers reason tags from free text so typed answers get specific replies. */
export function inferReasons(text: string): ReasonTag[] {
  return KEYWORDS.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}

export function respondToReason(ctx: DecisionContext, action: ActionType, tags: ReasonTag[], amountTo?: number): string[] {
  const eq = realisticEquity(ctx);
  const need = requiredEquity(ctx.toCall, ctx.pot);
  const strong = eq >= value(ctx);
  const replies: string[] = [];

  for (const tag of tags) {
    switch (tag) {
      case 'value':
        if (ctx.street === 'preflop') {
          replies.push(`${ctx.start.notation} is rated ${ctx.start.tier} pre-flop. Against ${ctx.opponents} opponent(s) it wins about ${pct(ctx.equity.equity)} of the time.`);
        } else if (ctx.threats && ctx.threats.pBeatAny < 0.3) {
          replies.push(`You read that well — there's only a ${pct(ctx.threats.pBeatAny)} chance someone is ahead right now.`);
        } else if (ctx.threats) {
          const top = ctx.threats.byCategory.slice(0, 3).map((g) => `${g.name} (${g.combos} combos)`).join(', ');
          replies.push(`Be careful: there's a ${pct(ctx.threats.pBeatAny)} chance someone already beats your ${ctx.threats.hero.name.toLowerCase()}. Hands that beat you: ${top}.`);
        }
        break;
      case 'bluff':
        if (strong) replies.push(`This isn't really a bluff — with ${pct(ctx.equity.equity)} equity you're betting for value. Think of it as getting worse hands to pay you.`);
        else if (ctx.opponents >= 3) replies.push(`Bluffing into ${ctx.opponents} opponents rarely works: the more players, the more likely someone has something they won't fold.`);
        else if (ctx.outs && ctx.outs.total >= 6) replies.push(`A bluff with ${ctx.outs.total} outs is a semi-bluff — the best kind, since you can still win if called.`);
        else if (ctx.opponents === 1)
          replies.push(
            `Heads-up is the right place to bluff, but the story has to make sense. If you only called the earlier streets, you look like a missed draw — and a player who called with a pair rarely folds it.`,
          );
        else replies.push(`Pure bluffs work best heads-up, on scary boards, and with a story that makes sense from earlier streets.`);
        if (!strong && amountTo !== undefined && amountTo > 0 && ctx.toCall === 0) {
          replies.push(`The maths of a bluff: risking ${amountTo} to win ${ctx.pot} needs them to fold ${pct(bluffBreakeven(amountTo, ctx.pot))} of the time. Ask yourself whether they really fold that often.`);
        }
        break;
      case 'draw':
        if (!ctx.outs || ctx.outs.total === 0) {
          replies.push(ctx.street === 'river' ? 'On the river there are no cards to come — draws have no value now.' : `You don't actually have a meaningful draw here: no unseen card improves you to a better hand category.`);
        } else {
          replies.push(`You have ${ctx.outs.total} outs — about ${pct(ctx.outs.hitNextCard)} on the next card and ${pct(ctx.outs.hitByRiver)} by the river (rule of thumb: outs × 4 on the flop, × 2 on the turn).`);
          if (ctx.toCall > 0) replies.push(eq >= need ? `That's enough: you needed ${pct(need)}.` : `Not quite enough on its own: you needed ${pct(need)}, so you are relying on winning extra chips when you hit.`);
        }
        break;
      case 'odds':
        if (ctx.toCall === 0) replies.push(`There was nothing to call, so pot odds don't apply — the question is whether betting earns more than checking.`);
        else replies.push(`Pot odds check: ${ctx.toCall} to win ${ctx.pot + ctx.toCall} total means you need ${pct(need)}. Your realistic equity is ${pct(eq)}, so the call is ${eq >= need ? 'justified' : 'not justified'}.`);
        break;
      case 'scared':
        if (ctx.threats) replies.push(`The fear is ${ctx.threats.pBeatAny > 0.5 ? 'justified' : 'bigger than the reality'}: the chance someone is ahead right now is ${pct(ctx.threats.pBeatAny)}.`);
        else replies.push(`Pre-flop nobody has a made hand yet. ${ctx.start.notation} wins ${pct(ctx.equity.equity)} against ${ctx.opponents} random hand(s).`);
        if (action === 'fold' && eq > need + 0.1) replies.push(`Folding here gives up too much — playing scared is one of the most expensive leaks.`);
        break;
      case 'cheap':
        if (ctx.toCall === 0) replies.push('Checking was free, so seeing another card is always fine when you are not betting for value.');
        else replies.push(`"Cheap" is relative: ${ctx.toCall} chips needs ${pct(need)} equity. You had about ${pct(eq)}, so it ${eq >= need ? 'was' : "wasn't"} a good price.`);
        break;
      case 'position':
        replies.push('Position matters: acting last lets you see what others do first. It justifies playing slightly more hands, not ignoring hand strength.');
        break;
      case 'gut':
        replies.push(`Instincts improve with feedback. Here's what the numbers said: ${recommend(ctx).why}`);
        break;
    }
  }
  if (replies.length === 0) replies.push(`Thanks for explaining. The key numbers: ${recommend(ctx).why}`);
  return replies;
}

export function describeContext(ctx: DecisionContext): string {
  const board = ctx.board.length ? cardsLabel(ctx.board) : 'no board yet';
  return `${STREET_LABELS[ctx.street]} — you hold ${cardsLabel(ctx.hole)}, board ${board}, ${ctx.opponents} opponent(s), pot ${ctx.pot}, ${ctx.toCall > 0 ? `${ctx.toCall} to call` : 'no bet to you'}.`;
}
