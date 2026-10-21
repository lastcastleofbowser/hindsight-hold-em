import { pct } from '../engine/analysis';
import { VERDICT_LABELS } from '../engine/coach';
import { orderBest5 } from '../engine/explain';
import { type GameState, STREET_LABELS, netResult } from '../engine/game';
import type { HandReview } from '../engine/review';
import { MiniCards } from './PlayingCard';
import { TermText } from './Term';

interface Props {
  game: GameState;
  review: HandReview;
  beginner: boolean;
  onNext: () => void;
  onDiscuss: () => void;
}

export function HandSummary({ game, review, beginner, onNext, onDiscuss }: Props) {
  const hero = game.players.find((p) => p.isHero)!;
  const net = netResult(game, hero.id);
  const sd = review.showdown;
  const winnerText = game.winners
    .map((w) => {
      const p = game.players[w.playerId];
      return `${p.isHero ? 'You' : p.name} won ${w.amount}${w.hand ? ` with ${w.hand.name}` : ''}`;
    })
    .join(' · ');

  return (
    <section className="panel summary" aria-label="Hand summary">
      <div className="summary-head">
        <div data-tour="summary-result">
          <div className={`result-big ${net > 0 ? 'win' : net < 0 ? 'loss' : ''}`}>
            {net > 0 ? `+${net}` : net} chips
          </div>
          <div className="muted small">
            {winnerText}
            {!game.showdown && ' — everyone else folded'}
          </div>
        </div>
        <div className="row-btns" style={{ marginTop: 0 }}>
          {review.decisions.length > 0 && (
            <button className="btn ghost" onClick={onDiscuss} data-tour="discuss">
              Discuss with coach
            </button>
          )}
          <button className="btn primary" onClick={onNext} autoFocus data-tour="next-hand">
            Deal next hand
          </button>
        </div>
      </div>

      {sd && (
        <div className="section showdown-check" data-tour="showdown-check">
          <h3>
            <TermText text="Showdown" /> — why this result?
          </h3>
          <div className="small">
            You: <b>{sd.hero.name}</b> <MiniCards cards={orderBest5(sd.hero)} />
          </div>
          {sd.villains.map((v, i) => (
            <div key={i} className="small">
              {game.players.find((p) => p.hole === v.hole)?.name ?? 'Opponent'}: <b>{v.hand.name}</b> <MiniCards cards={orderBest5(v.hand)} />
            </div>
          ))}
          <p className="small" style={{ marginBottom: 0 }}>
            <TermText text={sd.explanation} />
          </p>
        </div>
      )}

      {review.summary.length > 0 && (
        <ul className="points" style={{ marginTop: 12 }}>
          {review.summary.map((s) => (
            <li key={s}>
              <TermText text={s} />
            </li>
          ))}
        </ul>
      )}

      <div className="section" data-tour="hindsight-cards">
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
        <div className="section" data-tour="decision-list">
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
                  <span className="muted small">
                    <TermText text={`win chance ${pct(r.decision.ctx.equity.equity)}`} />
                  </span>
                  {r.hindsightEquity !== null && (
                    <span className="hs small">
                      <TermText text={`hindsight ${pct(r.hindsightEquity)}`} />
                    </span>
                  )}
                </div>
                <div className="small">
                  <TermText text={r.feedback.headline} />
                </div>
                {beginner && <div className="small plain">💡 {r.feedback.simple}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
