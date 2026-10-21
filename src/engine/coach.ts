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
import type { ActionType, Position, Street } from './game';
import { POSITION_NAMES, STREET_LABELS } from './game';
import type { HandLine, OpponentRead } from './reads';
import { CHARTS, type ChartId, chartAction, chartFor, rangeShare } from './ranges';

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
  /** Hero's seat, for position-aware pre-flop advice. */
  position?: Position;
  /** What each opponent's actions suggest they hold (live table only). */
  reads?: OpponentRead[];
  /** Hero's own line this hand, for spotting bluffs and continuation bets. */
  line?: HandLine;
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
  position?: Position;
  reads?: OpponentRead[];
  line?: HandLine;
}): DecisionContext {
  const opponents = Math.max(1, args.opponents);
  const iterations = args.iterations ?? 6000;
  return {
    ...args,
    opponents,
    equity: args.equity ?? calculateEquity({ hero: args.hole, board: args.board, opponents, iterations }),
    rangeEquity: args.reads?.length
      ? readsEquity(args.hole, args.board, args.reads, iterations)
      : facingBetEquity(args.hole, args.board, opponents, args.toCall, iterations),
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
  /** What kind of bet this is, when the move is aggressive. */
  kind?: 'value' | 'bluff' | 'semi-bluff' | 'c-bet';
  /** Suggested bet size as a fraction of the pot. */
  size?: number;
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

/** Equity against what each opponent's actions suggest they hold. */
export function readsEquity(hole: Card[], board: Card[], reads: OpponentRead[], iterations: number): EquityResult {
  return calculateEquity({ hero: hole, board, opponents: reads.length, iterations, opponentFilters: reads.map((r) => r.accepts) });
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

/** Pre-flop advice from the position charts (unopened pots, and big blind defence). */
function chartRecommendation(ctx: DecisionContext, position: Position, facingRaise: boolean): Recommendation | null {
  const hand = ctx.start.notation;
  const share = (id: ChartId) => Math.round(rangeShare(CHARTS[id].raise) * 100);
  if (position === 'BB') {
    if (!facingRaise) return null; // free option: handled by the general logic
    const act = chartAction('BB', hand);
    if (act === 'raise') return { move: 'raise', acceptable: ['raise', 'call'], kind: 'value', why: `From the big blind, ${hand} is strong enough to re-raise (3-bet) a raise.` };
    if (act === 'call') return { move: 'call', acceptable: ['call', 'fold'], why: `From the big blind you get a good price, and ${hand} is in the usual defending range.` };
    return { move: 'fold', acceptable: ['fold'], why: `Even with the big blind's discount, ${hand} is outside the defending range.` };
  }
  if (facingRaise) return null;
  const id = chartFor(position);
  const act = chartAction(id, hand);
  const seat = POSITION_NAMES[position].toLowerCase();
  return act === 'raise'
    ? { move: 'raise', acceptable: ['raise', 'bet'], kind: 'value', why: `${hand} is in the ${seat} opening range (about ${share(id)}% of hands) — raise.` }
    : {
        move: 'fold',
        acceptable: ['fold'],
        why: `${hand} is outside the ${seat} opening range (only about ${share(id)}% of hands are played from there) — fold.`,
      };
}

/**
 * Spots where betting a weak hand makes money: a continuation bet as the
 * pre-flop raiser, or a river bluff when the opponent has shown no interest.
 */
function bluffSpot(ctx: DecisionContext, eq: number): Recommendation | null {
  const line = ctx.line;
  if (!line || ctx.opponents !== 1 || !line.checkedToHero) return null;
  if (ctx.street === 'flop' && line.heroRaisedPreflop) {
    return {
      move: 'bet',
      acceptable: ['bet', 'check'],
      kind: 'c-bet',
      size: 0.33,
      why: `You raised before the flop and they checked to you, so a small "continuation bet" (about a third of the pot) often wins right away — they miss the flop most of the time.`,
    };
  }
  if (ctx.street === 'river' && line.opponentsPassive && eq < 0.4) {
    return {
      move: 'bet',
      acceptable: ['bet', 'check'],
      kind: 'bluff',
      size: 0.6,
      why: `Your opponent has checked every round since the flop, which usually means a weak hand. You can't win by checking, so bluff: a bet of about 60% of the pot only has to work ${pct(bluffBreakeven(0.6, 1))} of the time.`,
    };
  }
  if (ctx.street === 'turn' && line.opponentsPassive && line.checkedRounds >= 2 && eq < 0.45) {
    return {
      move: 'bet',
      acceptable: ['bet', 'check'],
      kind: 'bluff',
      size: 0.5,
      why: `Your opponent has checked the flop and the turn — they rarely have much. A half-pot bet can take the pot away now.`,
    };
  }
  return null;
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
    const chartRec = ctx.position ? chartRecommendation(ctx, ctx.position, facingRaise) : null;
    if (chartRec) return chartRec;
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

  if (eq >= value) return { move: 'bet', acceptable: ['bet', 'raise'], kind: 'value', size: 0.6, why: `With ${pct(eq)} equity vs ${ctx.opponents} opponent(s) you should bet for value.` };
  if (hasStrongDraw(ctx))
    return { move: 'bet', acceptable: ['bet', 'raise', 'check'], kind: 'semi-bluff', size: 0.6, why: `A semi-bluff with ${ctx.outs!.total} outs can win now or improve later.` };
  const bluff = bluffSpot(ctx, eq);
  if (bluff) return bluff;
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
  /** The same advice in plain English for new players, with no jargon. */
  simple: string;
}

/** "about 4" / "fewer than 1" — probabilities as times out of 10. */
function outOfTen(p: number): string {
  const n = Math.round(p * 10);
  return n === 0 ? 'fewer than 1' : n === 10 && p < 1 ? 'nearly 10' : `about ${n}`;
}

/** Explains a spot with everyday words: "you'd win about 4 times out of 10…". */
export function plainEnglish(ctx: DecisionContext, rec: Recommendation): string {
  const eq = realisticEquity(ctx);
  const parts: string[] = [];
  if (ctx.street === 'preflop') {
    parts.push(
      `Before any shared cards are dealt, ${ctx.start.notation} is a ${ctx.start.tier.toLowerCase()} starting hand. Against ${ctx.opponents} other player${ctx.opponents > 1 ? 's' : ''} it ends up the best hand ${outOfTen(ctx.equity.equity)} times out of 10.`,
    );
  } else {
    parts.push(`If this hand were played to the end many times, you would win ${outOfTen(eq)} times out of 10.`);
  }
  if (ctx.toCall > 0) {
    const need = requiredEquity(ctx.toCall, ctx.pot);
    parts.push(`Calling costs ${ctx.toCall} to win a pot of ${ctx.pot + ctx.toCall}, so it pays off if you win more than ${outOfTen(need)} times out of 10.`);
    parts.push(eq >= need ? 'You win more often than that, so staying in makes money over time.' : 'You win less often than that, so calling loses money over time and folding saves chips.');
  } else if (rec.kind === 'bluff') {
    parts.push("Your opponent keeps checking, which usually means they're weak. Your hand won't win if it's shown, so a bet is your only way to win — if they fold, the pot is yours.");
  } else if (rec.kind === 'c-bet') {
    parts.push('You raised before the flop, so they expect you to have something. A small bet now often makes them fold, because most of the time the flop missed them too.');
  } else if (rec.kind === 'semi-bluff') {
    parts.push("You don't have a made hand yet, but you could improve. Betting can win the pot now, and you can still hit your card if they call.");
  } else if (rec.move === 'bet' || rec.move === 'raise') {
    parts.push('Your hand is strong, so betting makes players with weaker hands pay to stay in.');
  } else if (rec.move === 'check') {
    parts.push(ctx.street === 'river' ? 'Your hand is not strong enough to bet: only better hands would pay you now.' : 'Your hand is not strong enough to bet, and checking lets you see the next card for free.');
  }
  return parts.join(' ');
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
    if (ctx.rangeEquity && !ctx.reads?.length) points.push(`Players who bet usually hold a pair or a draw. Against that kind of range your equity is about ${pct(eq)}.`);
  }
  for (const read of (ctx.reads ?? []).filter((r) => r.steps.length > 0).slice(0, 2)) {
    points.push(`Read: ${read.summary}`);
  }
  if (ctx.reads?.length && ctx.rangeEquity) {
    points.push(`Against the hands their actions suggest, you win about ${pct(ctx.rangeEquity.equity)} (vs ${pct(ctx.equity.equity)} against random cards).`);
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

  if ((rec.kind === 'bluff' || rec.kind === 'c-bet') && move === 'check') {
    points.push('Checking is fine too — but this was a good chance to win the pot without the best hand.');
  }
  const headline =
    verdict === 'great'
      ? `Good ${move}. ${rec.why}`
      : verdict === 'good'
        ? `A ${move} is fine here, though ${rec.move} is slightly better. ${rec.why}`
        : `Better was to ${rec.move}. ${rec.why}`;

  return { verdict, headline, recommendation: rec, points, simple: plainEnglish(ctx, rec) };
}

const value = (ctx: DecisionContext) => valueLine(ctx.opponents);

// ---------------------------------------------------------------------------
// "Why did you do that?" — responding to the player's stated reasoning.
// ---------------------------------------------------------------------------

export type ReasonTag = 'value' | 'bluff' | 'draw' | 'odds' | 'scared' | 'cheap' | 'position' | 'gut';

export const REASON_OPTIONS: { tag: ReasonTag; label: string }[] = [
  { tag: 'value', label: 'I think I have the best hand' },
  { tag: 'bluff', label: 'Bluffing — trying to make them fold' },
  { tag: 'draw', label: "I'm hoping the next card improves my hand" },
  { tag: 'odds', label: 'The price to call was worth it (pot odds)' },
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
            `Heads-up is the right place to bluff, but the story has to make sense. If you only called in the earlier rounds, you look like a missed draw — and a player who called with a pair rarely folds it.`,
          );
        else replies.push(`Pure bluffs work best heads-up, on scary boards, and with a story that makes sense from earlier rounds.`);
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
