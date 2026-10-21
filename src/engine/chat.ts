import { cardsLabel } from './cards';
import { pct, requiredEquity } from './analysis';
import { VERDICT_LABELS, fairShare, realisticEquity } from './coach';
import { orderBest5 } from './explain';
import { STREET_LABELS, type Street } from './game';
import { type DecisionReview, type HandReview, type Outcome, type Showdown, outcomeWords } from './review';

export interface ChatOptions {
  /** Add plain-English explanations aimed at new players. */
  beginner?: boolean;
}

/**
 * The offline coach. It answers from the numbers the engine computed, so it
 * works with no network, and every answer is grounded in the engine's maths.
 */

const verdictIcon = { great: '✅', good: '👍', questionable: '⚠️', mistake: '❌' } as const;

function describeDecision(r: DecisionReview, index: number, opts: ChatOptions = {}): string {
  const { ctx, action, amountTo, note } = r.decision;
  const lines: string[] = [];
  const amount = amountTo !== undefined && (action === 'bet' || action === 'raise') ? ` to ${amountTo}` : action === 'call' ? ` ${ctx.toCall}` : '';
  lines.push(`**${index + 1}. ${STREET_LABELS[ctx.street]}${ctx.board.length ? ` (${cardsLabel(ctx.board)})` : ''} — you ${action}${amount}.**`);
  lines.push(`${verdictIcon[r.feedback.verdict]} *${VERDICT_LABELS[r.feedback.verdict]}.* ${r.feedback.headline}`);
  if (opts.beginner) lines.push(`💡 In plain English: ${r.feedback.simple}`);
  for (const p of r.feedback.points) lines.push(`- ${p}`);
  if (note.trim()) lines.push(`You said: "${note.trim()}"`);
  for (const reply of r.reasonReplies) lines.push(`- ${reply}`);
  if (r.hindsightEquity !== null) {
    lines.push(`- 🔍 Hindsight: against the cards they actually held, you had ${pct(r.hindsightEquity)} equity here.`);
  }
  return lines.join('\n');
}

/**
 * "Who should have won?" — both best hands, why one beats the other, what
 * would have beaten the player, and whether their reported result matches.
 */
export function showdownCheck(sd: Showdown): string {
  const top = sd.villains.reduce((a, b) => (b.hand.score > a.hand.score ? b : a));
  const verdict: Record<Outcome, string> = {
    won: '**You should have won this hand.**',
    lost: '**Your opponent should have won this hand.**',
    split: '**This hand should have been a split pot.**',
  };
  const lines = [
    '**Showdown check — who should have won?**',
    `- **You:** ${sd.hero.name} — best five cards ${cardsLabel(orderBest5(sd.hero))}`,
    ...sd.villains.map((v) => `- **Opponent (${cardsLabel(v.hole)}):** ${v.hand.name} — best five cards ${cardsLabel(orderBest5(v.hand))}`),
    sd.explanation,
    verdict[sd.outcome],
  ];
  if (sd.beatenBy.length === 0) {
    lines.push('Nothing could have beaten you on this board — you had **the nuts** (the best possible hand).');
  } else {
    const list = sd.beatenBy.map((g) => `${g.name} (${g.combos} possible holdings)`).join(', ');
    const theyBeat = top.hand.score > sd.hero.score;
    lines.push(`To beat your ${sd.hero.name.toLowerCase()} on this board an opponent needed: ${list}.`);
    lines.push(theyBeat ? `Their ${top.hand.name.toLowerCase()} was one of those, so it beat you.` : `Their ${top.hand.name.toLowerCase()} wasn't one of those, so it did not beat you.`);
  }
  if (sd.mismatch && sd.reported !== 'unknown') {
    lines.push(
      `⚠️ You said you **${outcomeWords(sd.reported)}**, but by the rules of Texas Hold'em you should have **${outcomeWords(sd.outcome)}**. Double-check the cards you entered — if they're right, the pot went to the wrong player.`,
    );
  } else if (sd.reported !== 'unknown') {
    lines.push(`✔️ That matches the result you reported (${outcomeWords(sd.reported)}).`);
  }
  return lines.join('\n');
}

export function walkthrough(review: HandReview, opts: ChatOptions = {}): string[] {
  const out: string[] = [];
  if (review.decisions.length === 0) {
    out.push("I don't see any decisions recorded yet. Add at least one round with your action and I'll walk through it.");
    return out;
  }
  const first = review.decisions[0].decision.ctx;
  out.push(
    `Let's look at this hand. You held **${cardsLabel(first.hole)}** (${first.start.notation}, rated *${first.start.tier}* pre-flop) against ${first.opponents} opponent(s). I'll go round by round (pre-flop, flop, turn, river), judging each decision on what you could see at the time — then we'll use hindsight.`,
  );
  review.decisions.forEach((r, i) => out.push(describeDecision(r, i, opts)));
  if (review.showdown) out.push(showdownCheck(review.showdown));
  out.push(`**Summary**\n${review.summary.map((s) => `- ${s}`).join('\n')}\n\nAsk me anything — e.g. *"what should I have done on the turn?"*, *"how many outs did I have?"*, *"who should have won?"* Hover over any dotted-underlined term for a definition.`);
  return out;
}

const STREET_WORDS: [Street, RegExp][] = [
  ['preflop', /pre-?flop|before the flop|starting hand/i],
  ['flop', /\bflop\b/i],
  ['turn', /\bturn\b/i],
  ['river', /\briver\b/i],
];

export function offlineReply(question: string, review: HandReview, opts: ChatOptions = {}): string {
  const q = question.toLowerCase();
  const mentioned = STREET_WORDS.filter(([, re]) => re.test(q)).map(([s]) => s);
  const scoped = mentioned.length ? review.decisions.filter((r) => mentioned.includes(r.decision.ctx.street)) : review.decisions;
  if (review.decisions.length === 0) return 'Set up the hand and record at least one decision first, then I can coach you through it.';
  if (mentioned.length && scoped.length === 0) return `You didn't record a decision on the ${mentioned.join('/')}. Add one in the hand builder and re-run the analysis.`;

  // Questions about the result come first: "who should have won?" must not be read as "what should I have done?".
  const aboutResult = /who (should have |would have )?(won|wins?)|should(n't)? have (won|lost)|did i (win|lose)|why did i (lose|win)|showdown/.test(q);
  if (aboutResult || (/\bwon\b|\bwin(ner)?\b|lose|lost|beat|unlucky|bad beat|cooler/.test(q) && !/chance|equity|odds|should i|what should/.test(q))) {
    return resultReply(review);
  }

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
    return scoped.map((r) => describeDecision(r, review.decisions.indexOf(r), opts)).join('\n\n');
  }

  return "I'm the offline coach, so I answer from the hand's numbers. Try asking about **outs**, **pot odds**, **what you should have done** in a round, **the nuts**, **your equity**, or **who should have won**. You can also name a round, e.g. *“what happened on the flop?”*";
}

function resultReply(review: HandReview): string {
  const sd = review.showdown;
  if (!sd) return "I can't tell who won — add the opponent's cards and the full board (flop, turn and river) so I can compare the final hands.";
  const swings = review.decisions
    .filter((r) => r.hindsightEquity !== null)
    .map((r) => `${STREET_LABELS[r.decision.ctx.street]} ${pct(r.hindsightEquity!)}`)
    .join(' → ');
  const verdict =
    sd.outcome === 'lost'
      ? review.biggestLeak
        ? `Part of it was a decision: ${review.biggestLeak.feedback.headline}`
        : 'Your decisions were reasonable — sometimes the better hand going in still loses.'
      : sd.outcome === 'won'
        ? "You didn't lose this one — your hand was the winner."
        : 'Neither hand was better, so the pot is shared.';
  return `${showdownCheck(sd)}\n\nYour true equity against their actual cards went: ${swings || 'n/a'}.\n\n${verdict}`;
}
