import { BOT_STYLE_LABELS } from '../engine/bots';
import type { Card } from '../engine/cards';
import { type GameState, STREET_LABELS, potSize } from '../engine/game';
import { PlayingCard } from './PlayingCard';

interface Props {
  game: GameState;
  /** Hero's current made hand, shown under their cards. */
  heroHandName?: string;
}

/** Seat i sits at this angle around the oval; hero (seat 0) is bottom-centre. */
function seatPosition(i: number, n: number, rx: number, ry: number) {
  const angle = Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { left: `${50 + rx * Math.cos(angle)}%`, top: `${50 + ry * Math.sin(angle)}%` };
}

export function PokerTable({ game, heroHandName }: Props) {
  const n = game.players.length;
  const pot = potSize(game);
  const winners = new Set(game.winners.map((w) => w.playerId));
  const winningCards = new Set<Card>(game.showdown ? game.winners.flatMap((w) => w.hand?.best5 ?? []) : []);
  // Hindsight: once the hand is over, everyone's cards are revealed.
  const reveal = game.finished;

  return (
    <div className="table-wrap" aria-label="Poker table">
      <div className="table-rail">
        <div className="table-felt">
          <div className="felt-logo">Hindsight Hold'em</div>
          <div className="board">
            <div className="board-cards" aria-label="Community cards">
              {Array.from({ length: 5 }, (_, i) => {
                const c = game.board[i];
                return c === undefined ? (
                  <div key={`slot-${i}`} className="card-slot" />
                ) : (
                  <PlayingCard
                    key={`${game.handNumber}-${c}`}
                    card={c}
                    dealDelay={i < 3 ? i * 0.12 : 0}
                    highlight={winningCards.has(c)}
                    dim={game.showdown && winningCards.size > 0 && !winningCards.has(c)}
                  />
                );
              })}
            </div>
            <div className="pot" aria-live="polite">
              <span className="street-tag">{game.finished ? 'Hand over' : STREET_LABELS[game.street]}</span>
              <span>Pot {pot}</span>
            </div>
          </div>

          {game.players.map((p, i) => {
            const pos = seatPosition(i, n, 44, 42);
            const chipsPos = seatPosition(i, n, 29, 25);
            const showCards = p.isHero || reveal;
            const lastAction = p.lastAction ?? '';
            const actionClass = /fold/i.test(lastAction) ? 'fold' : /bet|raise|all-in/i.test(lastAction) ? 'aggressive' : '';
            const handName = game.results[p.id]?.name;
            const classes = [
              'seat',
              p.isHero && 'hero',
              p.folded && 'folded',
              !game.finished && game.toAct === p.id && 'to-act',
              winners.has(p.id) && 'winner',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={p.id}>
                <div className={classes} style={pos}>
                  <div className="seat-cards">
                    {p.hole.map((c, ci) => (
                      <PlayingCard
                        key={`${game.handNumber}-${p.id}-${ci}`}
                        card={c}
                        faceDown={!showCards}
                        dealDelay={ci * 0.3 + i * 0.06}
                        highlight={winningCards.has(c) && winners.has(p.id)}
                        dim={p.folded && reveal}
                      />
                    ))}
                  </div>
                  <div className="nameplate">
                    <div className="name">
                      {p.name}
                      {game.buttonIndex === p.id && (
                        <span className="dealer-btn" title="Dealer button">
                          D
                        </span>
                      )}
                    </div>
                    <div className="stack">{p.stack} chips</div>
                    {!p.isHero && <div className="style-tag">{BOT_STYLE_LABELS[p.style]}</div>}
                  </div>
                  {handName && !p.folded ? (
                    <span className="hand-label">{handName}</span>
                  ) : p.isHero && heroHandName && !p.folded && !game.finished ? (
                    <span className="hand-label">{heroHandName}</span>
                  ) : lastAction ? (
                    <span className={`last-action ${actionClass}`}>{lastAction}</span>
                  ) : null}
                </div>
                {p.committed > 0 && !game.finished && (
                  <div className="bet-chips" style={chipsPos} aria-label={`${p.name} has ${p.committed} in front`}>
                    <span className="chip" />
                    {p.committed}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
