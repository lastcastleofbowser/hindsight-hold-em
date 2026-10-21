import { cardsLabel } from './cards';
import { pct, requiredEquity } from './analysis';
import { VERDICT_LABELS, fairShare, realisticEquity } from './coach';
import { STREET_LABELS, type Street } from './game';
import type { DecisionReview, HandReview } from './review';

/**
 * The offline coach. It answers from the numbers the engine computed, so it
 * works with no network. When Claude is enabled the same facts are passed to
 * the model (see `handFacts`) so its answers stay grounded in real maths.
 */

const verdictIcon = { great: '✅', good: '👍', questionable: '⚠️', mistake: '❌' } as const;

function describeDecision(r: DecisionReview, index: number): string {
  const { ctx, action, amountTo, note } = r.decision;
  const lines: string[] = [];
  const amount = amountTo !== undefined && (action === 'bet' || action === 'raise') ? ` to ${amountTo}` : action === 'call' ? ` ${ctx.toCall}` : '';
  lines.push(`**${index + 1}. ${STREET_LABELS[ctx.street]}${ctx.board.length ? ` (${cardsLabel(ctx.board)})` : ''} — you ${action}${amount}.**`);
  lines.push(`${verdictIcon[r.feedback.verdict]} *${VERDICT_LABELS[r.feedback.verdict]}.* ${r.feedback.headline}`);
  for (const p of r.feedback.points) lines.push(`- ${p}`);
  if (note.trim()) lines.push(`You said: "${note.trim()}"`);
  for (const reply of r.reasonReplies) lines.push(`- ${reply}`);
  if (r.hindsightEquity !== null) {
    lines.push(`- 🔍 Hindsight: against the cards they actually held, you had ${pct(r.hindsightEquity)} equity here.`);
  }
  return lines.join('\n');
}

export function walkthrough(review: HandReview): string[] {
  const out: string[] = [];
  if (review.decisions.length === 0) {
    out.push("I don't see any decisions recorded yet. Add at least one street with your action and I'll walk through it.");
    return out;
  }
  const first = review.decisions[0].decision.ctx;
  out.push(
    `Let's look at this hand. You held **${cardsLabel(first.hole)}** (${first.start.notation}, rated *${first.start.tier}* pre-flop) against ${first.opponents} opponent(s). I'll go street by street, judging each decision on what you could see at the time — then we'll use hindsight.`,
  );
  review.decisions.forEach((r, i) => out.push(describeDecision(r, i)));
  out.push(`**Summary**\n${review.summary.map((s) => `- ${s}`).join('\n')}\n\nAsk me anything — e.g. *"what should I have done on the turn?"*, *"how many outs did I have?"*, *"why did I lose?"*`);
  return out;
}

const STREET_WORDS: [Street, RegExp][] = [
  ['preflop', /pre-?flop|before the flop|starting hand/i],
  ['flop', /\bflop\b/i],
  ['turn', /\bturn\b/i],
  ['river', /\briver\b/i],
];

export function offlineReply(question: string, review: HandReview): string {
  const q = question.toLowerCase();
  const mentioned = STREET_WORDS.filter(([, re]) => re.test(q)).map(([s]) => s);
  const scoped = mentioned.length ? review.decisions.filter((r) => mentioned.includes(r.decision.ctx.street)) : review.decisions;
  if (review.decisions.length === 0) return 'Set up the hand and record at least one decision first, then I can coach you through it.';
  if (mentioned.length && scoped.length === 0) return `You didn't record a decision on the ${mentioned.join('/')}. Add one in the hand builder and re-run the analysis.`;

  if (/\bouts?\b|draw/.test(q)) {
    return scoped
      .map((r) => {
        const { ctx } = r.decision;
        if (!ctx.outs) return `**${STREET_LABELS[ctx.street]}:** outs only apply on the flop and turn.`;
        if (ctx.outs.total === 0) return `**${STREET_LABELS[ctx.street]}:** no clean outs — no single card lifts you to a better hand category.`;
        const groups = ctx.outs.groups.map((g) => `${g.cards.length} to a ${g.name.toLowerCase()} (${cardsLabel(g.cards)})`).join('; ');
        const odds = ctx.street === 'flop' ? `${pct(ctx.outs.hitNextCard)} on the turn, ${pct(ctx.outs.hitByRiver)} by the river` : `${pct(ctx.outs.hitNextCard)} on the river`;
        return `**${STREET_LABELS[ctx.street]}:** ${ctx.outs.total} outs — ${groups}. That's ${odds}.`;
      })
      .join('\n\n');
  }

  if (/odds|price/.test(q)) {
    return scoped
      .map((r) => {
        const { ctx } = r.decision;
        if (ctx.toCall === 0) return `**${STREET_LABELS[ctx.street]}:** nothing to call, so pot odds didn't apply.`;
        const need = requiredEquity(ctx.toCall, ctx.pot);
        return `**${STREET_LABELS[ctx.street]}:** ${ctx.toCall} to call into a pot of ${ctx.pot} → you need ${ctx.toCall} ÷ ${ctx.pot + ctx.toCall} = **${pct(need)}** equity. You had about ${pct(realisticEquity(ctx))} realistically, so calling was ${realisticEquity(ctx) >= need ? 'profitable' : 'losing'}.`;
      })
      .join('\n\n');
  }

  if (/should|instead|better|right play|correct|what would you/.test(q)) {
    return scoped
      .map((r) => `**${STREET_LABELS[r.decision.ctx.street]}:** you chose to ${r.decision.action}; I'd ${r.feedback.recommendation.move}. ${r.feedback.recommendation.why}`)
      .join('\n\n');
  }

  if (/nuts|best (possible )?hand/.test(q)) {
    return scoped
      .map((r) => {
        const { ctx } = r.decision;
        if (!ctx.nuts) return `**${STREET_LABELS[ctx.street]}:** there's no board yet, so pocket aces are the best you can start with.`;
        return `**${STREET_LABELS[ctx.street]}:** the nuts was ${ctx.nuts.name} (e.g. ${cardsLabel(ctx.nuts.example)}). You had ${ctx.threats?.hero.name ?? 'no made hand'}.`;
      })
      .join('\n\n');
  }

  if (/lose|lost|beat|unlucky|bad beat|cooler/.test(q)) {
    const sd = review.showdown;
    if (!sd) return "I can't tell who won — add the opponent's cards and the full board (flop, turn and river) so I can compare the final hands.";
    const top = sd.villains.reduce((a, b) => (b.hand.score > a.hand.score ? b : a));
    const swings = review.decisions
      .filter((r) => r.hindsightEquity !== null)
      .map((r) => `${STREET_LABELS[r.decision.ctx.street]} ${pct(r.hindsightEquity!)}`)
      .join(' → ');
    const verdict =
      sd.outcome === 'lost'
        ? review.biggestLeak
          ? `Part of it was a decision: ${review.biggestLeak.feedback.headline}`
          : 'Your decisions were reasonable — sometimes the better hand going in still loses.'
        : 'Actually, you came out ahead in this one!';
    return `Final hands: you made **${sd.hero.name}**; they made **${top.hand.name}** with ${cardsLabel(top.hole)}.\n\nYour true equity against their actual cards went: ${swings || 'n/a'}.\n\n${verdict}`;
  }

  if (/bluff/.test(q)) {
    return 'Good bluffs share three traits: few opponents (ideally one), a board that fits the story your earlier bets told, and some backup equity (outs) if you get called. Bluffing into several players or on a board that hits everyone burns chips.';
  }

  if (/equity|chance|probab|percent|%|win/.test(q)) {
    return scoped
      .map((r) => {
        const { ctx } = r.decision;
        const hs = r.hindsightEquity !== null ? ` With hindsight vs their real cards: ${pct(r.hindsightEquity)}.` : '';
        return `**${STREET_LABELS[ctx.street]}:** ${pct(ctx.equity.equity)} vs ${ctx.opponents} random hand(s) (even share ${pct(fairShare(ctx.opponents))}).${ctx.threats ? ` Chance someone was already ahead: ${pct(ctx.threats.pBeatAny)}.` : ''}${hs}`;
      })
      .join('\n\n');
  }

  if (mentioned.length) {
    return scoped.map((r) => describeDecision(r, review.decisions.indexOf(r))).join('\n\n');
  }

  return "I'm the offline coach, so I answer from the hand's numbers. Try asking about **outs**, **pot odds**, **what you should have done** on a street, **the nuts**, **your equity**, or **why you lost**. For open-ended discussion, add a Claude API key in Settings and go online.";
}

/** Compact, factual description of the hand for the LLM coach. */
export function handFacts(review: HandReview): string {
  const lines: string[] = [];
  for (const r of review.decisions) {
    const { ctx, action, amountTo, note } = r.decision;
    lines.push(
      [
        `Street: ${STREET_LABELS[ctx.street]}`,
        `Hero hole cards: ${cardsLabel(ctx.hole)} (${ctx.start.notation}, ${ctx.start.tier})`,
        `Board: ${ctx.board.length ? cardsLabel(ctx.board) : '(none)'}`,
        `Opponents in hand: ${ctx.opponents}; pot ${ctx.pot}; to call ${ctx.toCall}`,
        `Hero action: ${action}${amountTo !== undefined ? ` to ${amountTo}` : ''}`,
        `Hero's reasoning: ${note.trim() || '(not given)'}`,
        `Equity vs random hands: ${pct(ctx.equity.equity)}; realistic equity: ${pct(realisticEquity(ctx))}; required by pot odds: ${pct(requiredEquity(ctx.toCall, ctx.pot))}`,
        ctx.threats ? `Hero's made hand: ${ctx.threats.hero.name}; P(someone ahead now): ${pct(ctx.threats.pBeatAny)}` : '',
        ctx.outs ? `Outs: ${ctx.outs.total} (${ctx.outs.groups.map((g) => `${g.cards.length} to ${g.name}`).join(', ') || 'none'}), ${pct(ctx.outs.hitByRiver)} by river` : '',
        ctx.nuts ? `The nuts: ${ctx.nuts.name}` : '',
        `Engine recommendation: ${r.feedback.recommendation.move} — ${r.feedback.recommendation.why} (verdict on hero: ${r.feedback.verdict})`,
        r.hindsightEquity !== null ? `Hindsight equity vs actual opponent cards: ${pct(r.hindsightEquity)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  if (review.showdown) {
    const sd = review.showdown;
    lines.push(
      `Showdown: hero ${sd.hero.name}; ${sd.villains.map((v) => `opponent ${cardsLabel(v.hole)} ${v.hand.name}`).join('; ')}; result: hero ${sd.outcome}`,
    );
  }
  return lines.join('\n\n');
}
