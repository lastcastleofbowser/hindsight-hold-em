import { type Card, RANK_NAMES, RANK_PLURALS, SUIT_NAMES, rankOf, suitOf } from './cards';
import { requiredEquity } from './analysis';
import { type DecisionContext, type Move, type Verdict, bluffBreakeven, realisticEquity, recommend, valueLine } from './coach';
import { Category } from './evaluator';
import type { ActionType, Position } from './game';

/**
 * The Beginner tab's coach: short, conversational advice with no jargon
 * (or with jargon explained). It reuses the main coach's recommendation so
 * both tabs always agree on what the right move is.
 */

/** "about 4 times in 10" style phrasing. */
export function timesInTen(p: number): string {
  const n = Math.round(p * 10);
  if (n <= 0) return 'less than 1 time in 10';
  if (n >= 10) return p >= 0.995 ? 'every time' : 'nearly every time';
  return `about ${n} time${n === 1 ? '' : 's'} in 10`;
}

const article = (word: string) => (/^[AEIOU]/i.test(word) ? 'an' : 'a');

/** Explains two hole cards in plain words, e.g. 4♠ 6♥ → "a Six and a Four of different suits…". */
export function describeHoleCards(hole: readonly Card[], notation: string): string[] {
  const [hi, lo] = [...hole].sort((a, b) => rankOf(b) - rankOf(a));
  const r1 = rankOf(hi);
  const r2 = rankOf(lo);
  const lines: string[] = [];
  if (r1 === r2) {
    lines.push(`You have a pair of ${RANK_PLURALS[r1]} in your hand — a "pocket pair" (written ${notation}).`);
    lines.push(
      r1 >= 8
        ? 'Big pairs like this are already a strong hand before any shared cards come out.'
        : 'Small pairs usually need a third matching card on the board to win a big pot.',
    );
    return lines;
  }
  const suited = suitOf(hi) === suitOf(lo);
  lines.push(
    `You have ${article(RANK_NAMES[r1])} ${RANK_NAMES[r1]} and ${article(RANK_NAMES[r2])} ${RANK_NAMES[r2]} ${
      suited ? `of the same suit — "suited" (written ${notation})` : `of different suits — "offsuit" (written ${notation}, the "o" means offsuit)`
    }.`,
  );
  const gap = r1 - r2 - 1;
  const traits: string[] = [];
  if (r2 >= 8) traits.push('both are big cards, so if you pair one it is often the best pair');
  else if (r1 === 12) traits.push('the Ace is the strongest card, but your second card (the "kicker") is small, so even a pair of Aces can be out-kicked');
  else if (r1 <= 6) traits.push('both are low cards, so even when you make a pair someone often has a bigger one');
  if (gap === 0) traits.push('they are next to each other in rank, which helps make straights');
  else if (gap <= 2) traits.push(`they are ${gap} rank${gap > 1 ? 's' : ''} apart, so a straight is still possible`);
  else traits.push('they are far apart in rank, so they rarely make a straight together');
  if (suited) traits.push('being suited adds a small chance of a flush');
  lines.push(traits.map((t, i) => (i === 0 ? t[0].toUpperCase() + t.slice(1) : t)).join('; ') + '.');
  return lines;
}

const TIER_MEANING = {
  Premium: 'This is one of the best starting hands in Texas Hold\'em.',
  Strong: 'This is a strong starting hand.',
  Playable: 'This is a playable hand — fine to see the flop if it is not expensive.',
  Marginal: 'This is a borderline hand — only worth playing if it is cheap.',
  Weak: 'This is a weak starting hand — most of the time it is best to let it go.',
} as const;

const POSITION_ADVICE: Record<Position, (bb: number) => string> = {
  BB: (bb) => `You are the big blind: you have already put in ${bb}. If nobody raises, you can check and see the flop for free.`,
  SB: () => 'You are the small blind: you have put in half a bet, but you will act first after the flop, which makes hands harder to play.',
  'BTN/SB': () => 'You are the dealer and the small blind: you act first now, but last after the flop — a nice advantage.',
  BTN: () => 'You are the dealer (button): after the flop you act last, so you see what everyone else does first. That is the best seat.',
  UTG: () => 'You are "under the gun": first to act, with everyone else still to decide behind you. Only play good hands from here.',
  MP: () => 'You are in middle position: some players act after you, so be a little picky.',
  CO: () => 'You are in the cutoff, just before the dealer: a good seat, as only a couple of players act after you.',
};

function madeHandWords(ctx: DecisionContext): string {
  const t = ctx.threats;
  if (!t) return '';
  const name = t.hero.name;
  const topBoard = Math.max(...ctx.board.map(rankOf));
  switch (t.hero.category) {
    case Category.HighCard:
      return `You have no pair yet — just ${name.toLowerCase()}, which rarely wins.`;
    case Category.Pair: {
      const pairRank = (t.hero.score >> 16) & 0xf;
      const usesHole = ctx.hole.some((c) => rankOf(c) === pairRank);
      if (!usesHole) return `The pair on the board belongs to everyone — you really only have ${RANK_NAMES[Math.max(...ctx.hole.map(rankOf))]} high.`;
      if (pairRank > topBoard) return `You have ${name.toLowerCase()} — bigger than every card on the board (an "overpair"). That's a good hand.`;
      if (pairRank === topBoard) return `You have ${name.toLowerCase()} — the top pair on the board. That's usually a good hand.`;
      return `You have ${name.toLowerCase()}, but there are bigger cards on the board, so anyone holding one of those has a better pair.`;
    }
    default:
      return `You have ${article(name)} ${name.toLowerCase()} — a strong hand.`;
  }
}

function boardDangers(ctx: DecisionContext): string[] {
  const out: string[] = [];
  const suits = [0, 0, 0, 0];
  for (const c of ctx.board) suits[suitOf(c)]++;
  const flushSuit = suits.findIndex((n) => n >= 3);
  const heroCat = ctx.threats?.hero.category ?? Category.HighCard;
  if (flushSuit >= 0 && heroCat < Category.Flush) {
    out.push(`Careful: there are ${suits[flushSuit]} ${SUIT_NAMES[flushSuit]} on the board, so a player with ${suits[flushSuit] >= 4 ? 'one' : 'two'} more ${SUIT_NAMES[flushSuit]} has a flush.`);
  }
  const ranks = ctx.board.map(rankOf);
  if (new Set(ranks).size < ranks.length && heroCat < Category.FullHouse) out.push('The board has a pair in it, so three of a kind and full houses are possible.');
  return out;
}

function drawWords(ctx: DecisionContext): string | null {
  if (!ctx.outs || ctx.outs.total === 0) return null;
  const main = ctx.outs.groups[0];
  const when = ctx.street === 'flop' ? 'by the river' : 'on the river';
  return `${ctx.outs.total} of the unseen cards would improve you (for example to ${article(main.name)} ${main.name.toLowerCase()}) — that happens ${timesInTen(ctx.outs.hitByRiver)} ${when}.`;
}

export interface BeginnerAdvice {
  move: Move;
  /** Suggested bet size as a fraction of the pot, for bets and raises. */
  size?: number;
  /** e.g. "I'd fold here." */
  headline: string;
  /** Short paragraphs, conversational, one idea each. */
  paragraphs: string[];
}

const VERB: Record<Move, string> = { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise' };

/** What the coach says before the player acts. */
export function beginnerAdvice(ctx: DecisionContext, position: Position, bettor?: string): BeginnerAdvice {
  const rec = recommend(ctx);
  const eq = realisticEquity(ctx);
  const paragraphs: string[] = [];

  if (ctx.street === 'preflop') {
    paragraphs.push(...describeHoleCards(ctx.hole, ctx.start.notation));
    paragraphs.push(TIER_MEANING[ctx.start.tier]);
    paragraphs.push(POSITION_ADVICE[position](ctx.bigBlind));
    if (ctx.toCall > ctx.bigBlind) paragraphs.push(`${bettor ?? 'Someone'} has raised, which usually means a good hand — so you need a better hand than usual to continue.`);
    if (ctx.position && (rec.kind === 'value' || rec.move === 'fold')) paragraphs.push(rec.why);
  } else {
    paragraphs.push(madeHandWords(ctx));
    paragraphs.push(...boardDangers(ctx));
    const draw = drawWords(ctx);
    if (draw) paragraphs.push(draw);
    for (const read of (ctx.reads ?? []).filter((r) => r.steps.some((s) => s.street !== 'preflop'))) {
      paragraphs.push(`Reading ${read.name}: ${read.summary}`);
    }
    paragraphs.push(`Overall, you would win this hand ${timesInTen(eq)} against the hands they are likely to have.`);
  }

  if (ctx.toCall > 0 && ctx.street !== 'preflop') {
    const need = requiredEquity(ctx.toCall, ctx.pot);
    paragraphs.push(
      `${bettor ?? 'Someone'} bet. Calling costs ${ctx.toCall} to win ${ctx.pot + ctx.toCall}, so it's worth it if you win more than ${timesInTen(need)}. You win ${timesInTen(eq)}${
        eq >= need ? ' — enough.' : ' — not enough.'
      }`,
    );
  } else if (rec.kind === 'bluff') {
    const bet = Math.round((rec.size ?? 0.5) * 100);
    paragraphs.push(
      `This is a good moment to bluff. Your opponent has kept checking, which usually means a weak hand. Your hand probably won't win if the cards are shown, so checking gives up the pot. A bet of about ${bet}% of the pot only needs them to fold ${timesInTen(bluffBreakeven(rec.size ?? 0.5, 1))} to make money — and weak hands fold more often than that.`,
    );
  } else if (rec.kind === 'c-bet') {
    paragraphs.push(
      'You raised before the flop and they checked to you. A small bet (about a third of the pot) — a "continuation bet" — tells the story that you still have a strong hand, and most of the time the flop missed them, so they fold.',
    );
  } else if (ctx.toCall === 0 && ctx.street !== 'preflop') {
    paragraphs.push(
      eq >= valueLine(ctx.opponents)
        ? 'Nobody has bet. Your hand is strong, so bet — make the weaker hands pay to keep playing.'
        : ctx.street === 'river'
          ? 'Nobody has bet. Your hand is not strong enough to bet: only better hands would call you now.'
          : 'Nobody has bet, so checking is free — take a free look at the next card.',
    );
  }

  const headline =
    rec.kind === 'bluff'
      ? `I'd bluff here — bet about ${Math.round((rec.size ?? 0.5) * 100)}% of the pot.`
      : rec.kind === 'c-bet'
        ? "I'd make a small continuation bet here."
        : `I'd ${VERB[rec.move]} here.`;
  return { move: rec.move, size: rec.size, headline, paragraphs: paragraphs.filter(Boolean) };
}

const PAST: Record<ActionType, string> = { fold: 'folded', check: 'checked', call: 'called', bet: 'bet', raise: 'raised' };

/** One or two sentences after the player acts. */
export function beginnerFeedback(ctx: DecisionContext, action: ActionType, verdict: Verdict, move: Move): string {
  const eq = realisticEquity(ctx);
  const need = requiredEquity(ctx.toCall, ctx.pot);
  const why =
    action === 'fold' && ctx.toCall === 0
      ? 'Checking was free, so there was no reason to fold.'
      : ctx.toCall > 0 && (action === 'call' || action === 'fold')
        ? `You needed to win more than ${timesInTen(need)} and you win ${timesInTen(eq)}.`
        : ctx.street === 'preflop'
          ? `${ctx.start.notation} is a ${ctx.start.tier.toLowerCase()} starting hand.`
          : `You win ${timesInTen(eq)} from here.`;
  switch (verdict) {
    case 'great':
      return `👍 Good ${action}! ${why}`;
    case 'good':
      return `👍 That works. I'd have ${PAST[move]}, but it's close. ${why}`;
    case 'questionable':
      return `🤔 I'd have ${PAST[move]} instead. ${why}`;
    default:
      return `✋ That one costs chips — I'd have ${PAST[move]}. ${why}`;
  }
}

/** Plain strength label for the beginner meter. */
export function strengthLabel(ctx: DecisionContext): { label: string; level: 0 | 1 | 2 | 3 | 4 } {
  const rel = realisticEquity(ctx) * (ctx.opponents + 1);
  if (rel >= 2) return { label: 'Very strong', level: 4 };
  if (rel >= 1.4) return { label: 'Strong', level: 3 };
  if (rel >= 1) return { label: 'Okay', level: 2 };
  if (rel >= 0.6) return { label: 'Weak', level: 1 };
  return { label: 'Very weak', level: 0 };
}
