import type Anthropic from '@anthropic-ai/sdk';

/**
 * Optional online coach. The SDK is loaded lazily so the offline app never
 * downloads or depends on it until the user enables Claude in Settings.
 *
 * The key is the user's own and stays in their browser (localStorage). That is
 * acceptable for a personal training tool, but a hosted multi-user deployment
 * should proxy requests through a backend instead.
 */

export const CLAUDE_MODEL = 'claude-opus-5-5';

const SYSTEM_PROMPT = `You are the coach inside Hindsight Hold'em, a No-Limit Texas Hold'em training app (Texas Hold'em only — two hole cards, five community cards, best five of seven).
The player recreated a hand they played and explained their reasoning. A poker engine has already computed the numbers (equity, pot odds, outs, the nuts, hindsight equity); they are given to you as HAND FACTS.

How to coach:
- Treat HAND FACTS as ground truth. Do not invent different percentages; if you estimate something the engine did not compute, say it's an estimate.
- Judge each decision by what the player could know at the time, then use hindsight separately to explain the result. Call out results-oriented thinking when you see it.
- If the HAND FACTS include a showdown, state clearly who should have won by the rules and why, and flag it if the player's reported result disagrees.
- Respond directly to the player's stated reasoning and explain where the logic was sound or flawed.
- Be encouraging but honest. Keep answers focused: short paragraphs or bullet points, plain language, define jargon the first time you use it.`;

const BEGINNER_NOTE = `- This player is new to Texas Hold'em. Use everyday words, explain any poker term in a few words the first time (e.g. "equity — your chance of winning"), and give probabilities as "about 4 times out of 10" alongside percentages.`;

export interface CoachTurn {
  role: 'user' | 'assistant';
  /** Plain text for user turns; full content blocks for assistant turns (replayed unchanged). */
  content: string | Anthropic.Beta.BetaContentBlockParam[];
}

export interface StreamResult {
  text: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
}

/** A failure with a message that is safe to show the player. */
export class CoachError extends Error {}

export async function askClaude(opts: {
  apiKey: string;
  handFacts: string;
  history: CoachTurn[];
  /** The player is new to poker: avoid jargon, define terms. */
  beginner?: boolean;
  onText: (textSoFar: string) => void;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const sdk = await import('@anthropic-ai/sdk');
  const client = new sdk.default({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  // Hand facts go first in the first user turn so the prefix stays stable
  // across the conversation (append-only history, cache friendly).
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.history.map((turn, i) => ({
    role: turn.role,
    content: i === 0 && typeof turn.content === 'string' ? `HAND FACTS\n${opts.handFacts}\n\nPLAYER\n${turn.content}` : turn.content,
  }));

  try {
    const stream = client.beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 64000,
        system: opts.beginner ? `${SYSTEM_PROMPT}\n${BEGINNER_NOTE}` : SYSTEM_PROMPT,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages,
      },
      { signal: opts.signal },
    );
    let text = '';
    stream.on('text', (delta) => {
      text += delta;
      opts.onText(text);
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new CoachError('Claude declined to answer this one. The offline coach can still help.');
    }
    return { text, content: final.content as Anthropic.Beta.BetaContentBlockParam[] };
  } catch (err) {
    if (err instanceof CoachError) throw err;
    if (err instanceof sdk.APIUserAbortError) throw new CoachError('Request cancelled.');
    if (err instanceof sdk.AuthenticationError) throw new CoachError('Claude rejected the API key. Check it in Settings.');
    if (err instanceof sdk.PermissionDeniedError) throw new CoachError("This API key isn't allowed to use that model.");
    if (err instanceof sdk.RateLimitError) throw new CoachError('Claude is rate-limiting requests. Wait a moment and try again.');
    if (err instanceof sdk.APIConnectionError) throw new CoachError("Couldn't reach Claude — are you offline?");
    if (err instanceof sdk.APIError) throw new CoachError(`Claude returned an error (${err.status ?? 'unknown'}).`);
    throw err;
  }
}
