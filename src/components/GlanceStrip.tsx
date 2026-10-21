import { pct, requiredEquity } from '../engine/analysis';
import { type CoachFeedback, VERDICT_LABELS } from '../engine/coach';
import { type GameState, type Player, netResult } from '../engine/game';
import type { HandReview } from '../engine/review';
import type { HandAnalysis } from './OddsPanel';

interface Props {
  game: GameState;
  hero: Player;
  analysis: HandAnalysis | null;
  /** Odds are hidden during the hand when the player turned them off in Settings. */
  showOdds: boolean;
  toCall: number;
  pot: number;
  /** The coach's grade for the latest decision, if any. */
  feedback: CoachFeedback | null;
  review: HandReview | null;
  onOpen: (tab: 'coach' | 'odds' | 'summary') => void;
}

const colourFor = (good: boolean) => (good ? 'var(--great)' : 'var(--mistake)');

/** The handful of numbers that matter right now, readable at a glance above the side tabs. */
export function GlanceStrip({ game, hero, analysis, showOdds, toCall, pot, feedback, review, onOpen }: Props) {
  let body: React.ReactNode;
  if (game.finished) {
    const net = netResult(game, hero.id);
    const graded = review?.decisions ?? [];
    const good = graded.filter((r) => r.feedback.verdict === 'great' || r.feedback.verdict === 'good').length;
    const won = game.winners.find((w) => w.playerId === hero.id);
    body = (
      <button className="glance-row" onClick={() => onOpen('summary')}>
        <span className="glance-num">
          <b className={net > 0 ? 'pos' : net < 0 ? 'neg' : ''}>
            {net > 0 ? '+' : ''}
            {net}
          </b>
          <small>chips this hand</small>
        </span>
        {graded.length > 0 && (
          <span className="glance-num">
            <b>
              {good}/{graded.length}
            </b>
            <small>good decisions</small>
          </span>
        )}
        <span className="glance-line">{won?.hand ? `Won with ${won.hand.name}` : won ? 'Everyone else folded' : hero.folded ? 'You folded' : 'Lost at showdown'}</span>
      </button>
    );
  } else if (hero.folded) {
    body = <span className="glance-line muted">You folded — watching the rest of the hand.</span>;
  } else if (showOdds && analysis) {
    const { equity, threats, outs, start } = analysis;
    const need = requiredEquity(toCall, pot);
    body = (
      <button className="glance-row" onClick={() => onOpen('odds')} title="Open the odds tab">
        <span className="glance-num">
          <b>{pct(equity.equity)}</b>
          <small>to win</small>
        </span>
        {toCall > 0 && (
          <span className="glance-num">
            <b style={{ color: colourFor(equity.equity >= need) }}>{pct(need)}</b>
            <small>needed to call</small>
          </span>
        )}
        {outs && outs.total > 0 && (
          <span className="glance-num">
            <b>{outs.total}</b>
            <small>outs</small>
          </span>
        )}
        <span className="glance-line">
          {threats ? (
            <>
              {threats.hero.name} ·{' '}
              <span style={{ color: threats.pBeatAny > 0.5 ? 'var(--mistake)' : threats.pBeatAny > 0.25 ? 'var(--questionable)' : 'var(--great)' }}>
                {pct(threats.pBeatAny)}
              </span>{' '}
              chance someone is ahead
            </>
          ) : (
            <>
              {start.notation} <span className={`tier ${start.tier}`}>{start.tier}</span>
            </>
          )}
        </span>
      </button>
    );
  } else {
    body = (
      <span className="glance-line">
        Pot <b>{pot}</b>
        {toCall > 0 && (
          <>
            {' '}
            · <b>{toCall}</b> to call
          </>
        )}{' '}
        <span className="muted small">(odds are hidden — turn them on in Settings)</span>
      </span>
    );
  }

  return (
    <div className="glance" data-tour="glance">
      <div className="glance-body">{body}</div>
      {feedback && !game.finished && (
        <button className={`verdict ${feedback.verdict} glance-verdict`} onClick={() => onOpen('coach')} title="Open the coach's feedback">
          {VERDICT_LABELS[feedback.verdict]}
        </button>
      )}
    </div>
  );
}
