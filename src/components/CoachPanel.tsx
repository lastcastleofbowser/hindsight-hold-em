import { useEffect, useState } from 'react';
import {
  type CoachFeedback,
  type DecisionContext,
  type ReasonTag,
  REASON_OPTIONS,
  VERDICT_LABELS,
  plainEnglish,
  recommend,
} from '../engine/coach';
import { STREET_LABELS } from '../engine/game';
import type { Decision } from '../engine/review';
import type { CoachState } from '../hooks/useGame';
import type { CoachMode } from '../hooks/useSettings';
import { TermText } from './Term';

interface Props {
  mode: CoachMode;
  coach: CoachState | null;
  decisions: Decision[];
  heroContext: DecisionContext | null;
  holdTable: boolean;
  beginner: boolean;
  onAnswer: (tags: ReasonTag[], note: string) => void;
  onResume: () => void;
}

const ACTION_VERBS: Record<string, string> = { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise' };

export function CoachPanel({ mode, coach, decisions, heroContext, holdTable, beginner, onAnswer, onResume }: Props) {
  const [hint, setHint] = useState(false);
  useEffect(() => setHint(false), [heroContext]);

  if (mode === 'off') return null;
  const decision = coach ? decisions[coach.decisionIndex] : undefined;

  return (
    <section className="panel" aria-label="AI coach" aria-live="polite">
      <h2>
        Coach
        {heroContext && !coach?.awaitingWhy && (
          <button className="chip-btn" onClick={() => setHint((h) => !h)}>
            {hint ? 'Hide hint' : 'Hint'}
          </button>
        )}
      </h2>

      {hint && heroContext && <HintCard ctx={heroContext} beginner={beginner} />}

      {coach?.awaitingWhy && decision ? (
        <WhyPrompt action={decision.action} street={STREET_LABELS[decision.ctx.street]} onAnswer={onAnswer} />
      ) : coach?.feedback ? (
        <FeedbackCard
          feedback={coach.feedback}
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
        <div className="row-btns">
          <button className="btn primary" onClick={onResume} autoFocus>
            Continue
          </button>
        </div>
      )}
    </section>
  );
}

function HintCard({ ctx, beginner }: { ctx: DecisionContext; beginner: boolean }) {
  const rec = recommend(ctx);
  return (
    <div className="reply" style={{ marginTop: 0, marginBottom: 10 }}>
      <b>Coach would {rec.move}.</b> <TermText text={rec.why} />
      {beginner && <p className="plain">💡 {plainEnglish(ctx, rec)}</p>}
    </div>
  );
}

function WhyPrompt({ action, street, onAnswer }: { action: string; street: string; onAnswer: (tags: ReasonTag[], note: string) => void }) {
  const [tags, setTags] = useState<ReasonTag[]>([]);
  const [note, setNote] = useState('');
  const toggle = (t: ReasonTag) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  return (
    <div className="coach-card">
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
  replies,
  note,
  title,
  beginner,
}: {
  feedback: CoachFeedback;
  replies: string[];
  note: string;
  title?: string;
  beginner: boolean;
}) {
  return (
    <div className="coach-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className={`verdict ${feedback.verdict}`}>{VERDICT_LABELS[feedback.verdict]}</span>
        {title && <span className="small muted">{title}</span>}
      </div>
      <p className="feedback-headline">
        <TermText text={feedback.headline} />
      </p>
      {beginner && <p className="plain">💡 In plain English: {feedback.simple}</p>}
      <ul className="points">
        {feedback.points.map((p) => (
          <li key={p}>
            <TermText text={p} />
          </li>
        ))}
      </ul>
      {replies.length > 0 && (
        <div className="reply">
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
