import { useEffect, useMemo, useState } from 'react';
import {
  type CoachFeedback,
  type DecisionContext,
  type ReasonTag,
  REASON_OPTIONS,
  VERDICT_LABELS,
  decisionRecap,
  evaluateDecision,
  plainEnglish,
  pointGist,
  recommend,
} from '../engine/coach';
import { STREET_LABELS } from '../engine/game';
import type { Decision } from '../engine/review';
import type { CoachState, LastHand } from '../hooks/useGame';
import type { CoachMode } from '../hooks/useSettings';
import { TermText } from './Term';

interface Props {
  mode: CoachMode;
  coach: CoachState | null;
  decisions: Decision[];
  heroContext: DecisionContext | null;
  holdTable: boolean;
  beginner: boolean;
  /** Carried over from the previous hand; shown until this hand's first decision. */
  lastHand?: LastHand | null;
  onAnswer: (tags: ReasonTag[], note: string) => void;
  onResume: () => void;
}

const ACTION_VERBS: Record<string, string> = { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise' };

export function CoachPanel({ mode, coach, decisions, heroContext, holdTable, beginner, lastHand, onAnswer, onResume }: Props) {
  const [hint, setHint] = useState(false);
  useEffect(() => setHint(false), [heroContext]);

  // Only the latest decision gets full feedback; earlier ones this hand shrink to one line each.
  const shownIndex = coach?.decisionIndex ?? decisions.length;
  const earlier = useMemo(
    () => decisions.slice(0, shownIndex).map((d) => ({ d, fb: evaluateDecision(d.ctx, d.action, d.amountTo) })),
    [decisions, shownIndex],
  );

  if (mode === 'off') return null;
  const decision = coach ? decisions[coach.decisionIndex] : undefined;
  const seen = new Set(earlier.flatMap(({ fb }) => fb.background.map(pointGist)));
  const freshBackground = coach?.feedback?.background.filter((p) => !seen.has(pointGist(p))) ?? [];

  return (
    <section className="panel" aria-label="Coach" aria-live="polite" data-tour="coach-panel">
      <h2>
        Coach
        {heroContext && !coach?.awaitingWhy && (
          <button className="chip-btn" onClick={() => setHint((h) => !h)}>
            {hint ? 'Hide hint' : 'Hint'}
          </button>
        )}
      </h2>

      {lastHand && decisions.length === 0 && <LastHandNote lastHand={lastHand} />}

      {earlier.length > 0 && (
        <div className="recap">
          <div className="recap-title">Earlier this hand</div>
          <ul>
            {earlier.map(({ d, fb }, i) => (
              <li key={i} className={fb.verdict}>
                {decisionRecap(d.ctx.street, d.action, fb)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hint && heroContext && <HintCard ctx={heroContext} beginner={beginner} />}

      {coach?.awaitingWhy && decision ? (
        <WhyPrompt action={decision.action} street={STREET_LABELS[decision.ctx.street]} onAnswer={onAnswer} />
      ) : coach?.feedback ? (
        <FeedbackCard
          feedback={coach.feedback}
          background={freshBackground}
          replies={coach.replies}
          note={decision?.note ?? ''}
          beginner={beginner}
          title={decision ? `${STREET_LABELS[decision.ctx.street]} — you ${decision.action}` : undefined}
        />
      ) : (
        !hint && (
          <p className="muted small" style={{ margin: 0 }}>
            {mode === 'ask'
              ? "Make a move. I'll ask why you did it, then show you where the logic holds up — or doesn't."
              : "Make a move and I'll grade it against the maths."}
          </p>
        )
      )}

      {holdTable && coach && !coach.awaitingWhy && (
        <div className="row-btns" data-tour="continue">
          <button className="btn primary" onClick={onResume} autoFocus>
            Continue
          </button>
        </div>
      )}
    </section>
  );
}

export function LastHandNote({ lastHand }: { lastHand: LastHand }) {
  const { net, lesson } = lastHand;
  return (
    <div className="recap">
      <div className="recap-title">Last hand</div>
      <p>
        <b className={net > 0 ? 'pos' : net < 0 ? 'neg' : ''}>
          {net > 0 ? '+' : ''}
          {net} chips.
        </b>{' '}
        {lesson ? (
          <>
            Key lesson — <TermText text={lesson} />
          </>
        ) : (
          'No leaks in your decisions.'
        )}
      </p>
    </div>
  );
}

function HintCard({ ctx, beginner }: { ctx: DecisionContext; beginner: boolean }) {
  const rec = recommend(ctx);
  return (
    <div className="reply" style={{ marginTop: 0, marginBottom: 10 }}>
      <b>Coach would {rec.allIn ? 'go all-in' : rec.move}.</b> <TermText text={rec.why} />
      {beginner && <p className="plain">💡 {plainEnglish(ctx, rec)}</p>}
    </div>
  );
}

function WhyPrompt({ action, street, onAnswer }: { action: string; street: string; onAnswer: (tags: ReasonTag[], note: string) => void }) {
  const [tags, setTags] = useState<ReasonTag[]>([]);
  const [note, setNote] = useState('');
  const toggle = (t: ReasonTag) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  return (
    <div className="coach-card" data-tour="why-prompt">
      <div className="coach-q">
        Why did you {ACTION_VERBS[action] ?? action} on the {street.toLowerCase()}?
      </div>
      <div className="reason-chips" role="group" aria-label="Reasons">
        {REASON_OPTIONS.map((r) => (
          <button key={r.tag} className="reason-chip" aria-pressed={tags.includes(r.tag)} onClick={() => toggle(r.tag)}>
            {r.label}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="why-note">
        Explain in your own words
      </label>
      <textarea
        id="why-note"
        placeholder="Or explain in your own words…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onAnswer(tags, note);
          }
        }}
      />
      <div className="row-btns">
        <button className="btn primary" onClick={() => onAnswer(tags, note)}>
          Get feedback
        </button>
        <button className="btn ghost" onClick={() => onAnswer([], '')}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function FeedbackCard({
  feedback,
  background = feedback.background,
  replies,
  note,
  title,
  beginner,
}: {
  feedback: CoachFeedback;
  /** Which background lines to show; defaults to all of them. */
  background?: string[];
  replies: string[];
  note: string;
  title?: string;
  beginner: boolean;
}) {
  return (
    <div className="coach-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className={`verdict ${feedback.verdict}`} data-tour="verdict">
          {VERDICT_LABELS[feedback.verdict]}
        </span>
        {title && <span className="small muted">{title}</span>}
      </div>
      <p className="feedback-headline">
        <TermText text={feedback.headline} />
      </p>
      {beginner && (
        <p className="plain" data-tour="plain-english">
          💡 In plain English: {feedback.simple}
        </p>
      )}
      <ul className="points" data-tour="feedback-points">
        {[...feedback.points, ...background].map((p) => (
          <li key={p}>
            <TermText text={p} />
          </li>
        ))}
      </ul>
      {replies.length > 0 && (
        <div className="reply" data-tour="reason-reply">
          {note.trim() && (
            <div className="small muted" style={{ marginBottom: 4 }}>
              You said: “{note.trim()}”
            </div>
          )}
          {replies.map((r) => (
            <p key={r} style={{ margin: '0 0 6px' }}>
              <TermText text={r} />
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
