import { pct } from '../engine/analysis';
import { VERDICT_LABELS } from '../engine/coach';
import { type GameState, STREET_LABELS, netResult } from '../engine/game';
import type { HandReview } from '../engine/review';
import { MiniCards } from './PlayingCard';

interface Props {
  game: GameState;
  review: HandReview;
  onNext: () => void;
  onDiscuss: () => void;
}

export function HandSummary({ game, review, onNext, onDiscuss }: Props) {
  const hero = game.players.find((p) => p.isHero)!;
  const net = netResult(game, hero.id);
  const winnerText = game.winners
    .map((w) => {
      const p = game.players[w.playerId];
      return `${p.isHero ? 'You' : p.name} won ${w.amount}${w.hand ? ` with ${w.hand.name}` : ''}`;
    })
    .join(' · ');

  return (
    <section className="panel summary" aria-label="Hand summary">
      <div className="summary-head">
        <div>
          <div className={`result-big ${net > 0 ? 'win' : net < 0 ? 'loss' : ''}`}>
            {net > 0 ? `+${net}` : net} chips
          </div>
          <div className="muted small">{winnerText}{!game.showdown && ' — everyone else folded'}</div>
        </div>
        <div className="row-btns" style={{ marginTop: 0 }}>
          {review.decisions.length > 0 && (
            <button className="btn ghost" onClick={onDiscuss}>
              Discuss with coach
            </button>
          )}
          <button className="btn primary" onClick={onNext} autoFocus>
            Deal next hand
          </button>
        </div>
      </div>

      {review.summary.length > 0 && (
        <ul className="points" style={{ marginTop: 12 }}>
          {review.summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}

      <div className="section">
        <h3>Hindsight — what everyone held</h3>
        <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {game.players
            .filter((p) => !p.isHero)
            .map((p) => (
              <span key={p.id} style={{ opacity: p.folded ? 0.6 : 1 }}>
                {p.name}: <MiniCards cards={p.hole} /> {p.folded ? '(folded)' : game.results[p.id] ? `— ${game.results[p.id].name}` : ''}
              </span>
            ))}
        </div>
      </div>

      {review.decisions.length > 0 && (
        <div className="section">
          <h3>Your decisions</h3>
          <ol className="decision-list">
            {review.decisions.map((r, i) => (
              <li key={i}>
                <div className="meta">
                  <b>{STREET_LABELS[r.decision.ctx.street]}</b>
                  <span>
                    You {r.decision.action}
                    {r.decision.action === 'bet' || r.decision.action === 'raise' ? ` to ${r.decision.amountTo}` : ''}
                  </span>
                  <span className={`verdict ${r.feedback.verdict}`}>{VERDICT_LABELS[r.feedback.verdict]}</span>
                  <span className="muted small">equity {pct(r.decision.ctx.equity.equity)}</span>
                  {r.hindsightEquity !== null && <span className="hs small">hindsight {pct(r.hindsightEquity)}</span>}
                </div>
                <div className="small">{r.feedback.headline}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
