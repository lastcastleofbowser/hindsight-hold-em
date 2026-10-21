import { useEffect, useMemo, useRef, useState } from 'react';
import { beginnerAdvice, beginnerFeedback, strengthLabel } from '../engine/beginnerCoach';
import { cardsLabel } from '../engine/cards';
import { type DecisionContext, type Move } from '../engine/coach';
import { orderBest5 } from '../engine/explain';
import { type GameState, type PlayerAction, POSITION_NAMES, legalActions, netResult, positionOf, potSize } from '../engine/game';
import { useGame } from '../hooks/useGame';
import type { Settings } from '../hooks/useSettings';
import { PokerTable } from './PokerTable';
import { TermText } from './Term';
import { useAutoTour } from './Tour';

interface CoachMessage {
  id: string;
  kind: 'advice' | 'feedback' | 'summary' | 'info';
  title?: string;
  paragraphs: string[];
}

interface Props {
  settings: Settings;
  /** True while the Beginner tab is on screen. */
  active: boolean;
}

/** The player who made the last bet or raise this round, for "Sam bet…". */
function lastAggressor(game: GameState): string | undefined {
  for (let i = game.log.length - 1; i >= 0; i--) {
    const a = game.log[i];
    if (a.street !== game.street) break;
    if ((a.type === 'bet' || a.type === 'raise') && !game.players[a.playerId].isHero) return game.players[a.playerId].name;
  }
  return undefined;
}

/**
 * A calmer version of Play & Train: two opponents, no odds panel, and a
 * coach that talks the player through every decision in everyday words.
 */
export function BeginnerView({ settings, active }: Props) {
  const tableSettings = useMemo<Settings>(
    () => ({ ...settings, opponents: 2, botStyle: 'balanced', coachMode: 'off', speed: 'slow' }),
    [settings],
  );
  const g = useGame(tableSettings, { pauseAfterAction: true });
  const { game, hero, heroContext, review } = g;
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const added = useRef(new Set<string>());
  const logRef = useRef<HTMLDivElement>(null);
  const position = game && hero ? positionOf(hero.id, game.buttonIndex, game.players.length) : null;

  const push = (msg: CoachMessage) => {
    if (added.current.has(msg.id)) return;
    added.current.add(msg.id);
    setMessages((m) => [...m, msg]);
  };

  // New hand: clear the conversation.
  useEffect(() => {
    if (!game) return;
    added.current = new Set();
    setMessages([]);
  }, [game?.handNumber]);

  // Advice before each decision.
  const advice = useMemo(
    () => (heroContext && game && position && !g.holdTable ? beginnerAdvice(heroContext, position, lastAggressor(game)) : null),
    [heroContext, game, position, g.holdTable],
  );
  useEffect(() => {
    if (!advice || !game) return;
    push({ id: `${game.handNumber}-advice-${g.decisions.length}`, kind: 'advice', title: advice.headline, paragraphs: advice.paragraphs });
  }, [advice]);

  // Short feedback after each decision.
  useEffect(() => {
    if (!g.coach?.feedback || !game) return;
    const d = g.decisions[g.coach.decisionIndex];
    if (!d) return;
    push({
      id: `${game.handNumber}-feedback-${g.coach.decisionIndex}`,
      kind: 'feedback',
      paragraphs: [beginnerFeedback(d.ctx, d.action, g.coach.feedback.verdict, g.coach.feedback.recommendation.move)],
    });
  }, [g.coach]);

  // Wrap-up when the hand ends.
  useEffect(() => {
    if (!game?.finished || !hero) return;
    const net = netResult(game, hero.id);
    const paragraphs: string[] = [];
    const winner = game.players[game.winners[0]?.playerId];
    if (review?.showdown) {
      paragraphs.push(`You had ${review.showdown.hero.name.toLowerCase()} (${cardsLabel(orderBest5(review.showdown.hero))}).`);
      paragraphs.push(review.showdown.explanation);
    } else if (!game.showdown) {
      paragraphs.push(winner?.isHero ? 'Everyone else folded, so the pot is yours without showing your cards.' : `${winner?.name ?? 'Someone'} won because everyone else folded.`);
    } else if (hero.folded) {
      const w = game.winners[0];
      paragraphs.push(`You folded earlier. ${winner?.name} won the showdown${w?.hand ? ` with ${w.hand.name.toLowerCase()}` : ''}.`);
    }
    paragraphs.push(net > 0 ? `You won ${net} chips this hand. 🎉` : net < 0 ? `You lost ${-net} chips this hand.` : 'You broke even this hand.');
    for (const r of g.reveals) paragraphs.push(r.text);
    paragraphs.push("Everyone's cards are now face up — have a look at what they had.");
    push({ id: `${game.handNumber}-summary`, kind: 'summary', title: 'Hand over', paragraphs });
  }, [game?.finished, review]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useAutoTour('beginner', active && !!heroContext && !g.holdTable);

  if (!game || !hero) {
    return (
      <div className="panel welcome">
        <h1>Beginner table</h1>
        <p>
          A calmer game against two friendly opponents. Before every decision your coach explains what your cards mean, what your seat means, and what they would do —
          in plain words. No charts, no jargon overload.
        </p>
        <button className="btn primary" onClick={g.dealNext}>
          Start a hand
        </button>
      </div>
    );
  }

  const strength = heroContext ? strengthLabel(heroContext) : null;

  return (
    <div className="play-layout beginner">
      <div>
        <PokerTable game={game} longPositions heroHandName={heroContext?.threats?.hero.name} />
        {game.finished ? (
          <div className="action-bar">
            <button className="btn primary" onClick={g.dealNext} autoFocus>
              Deal next hand
            </button>
          </div>
        ) : g.holdTable ? (
          <div className="action-bar">
            <button className="btn primary" onClick={g.resume} autoFocus>
              Continue
            </button>
          </div>
        ) : g.heroToAct && heroContext && advice ? (
          <BeginnerActions game={game} ctx={heroContext} suggested={advice.move} suggestedSize={advice.size} onAction={g.heroAct} />
        ) : (
          <div className="action-bar">
            <div className="waiting">{hero.folded ? 'You folded. Finishing the hand…' : `Waiting for ${game.players[game.toAct]?.name ?? 'the dealer'}…`}</div>
          </div>
        )}
      </div>

      <div className="side">
        {strength && position && (
          <section className="panel beginner-strength" data-tour="beginner-strength" aria-label="Hand strength">
            <h2>
              Your hand <span className="small muted">{POSITION_NAMES[position]}</span>
            </h2>
            <div className="strength-meter" aria-label={`Hand strength: ${strength.label}`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={i <= strength.level ? `on l${strength.level}` : ''} />
              ))}
            </div>
            <div className="strength-label">{strength.label}</div>
          </section>
        )}
        <section className="panel coach-talk" data-tour="beginner-coach" aria-label="Coach" aria-live="polite">
          <h2>Coach</h2>
          <div className="coach-log" ref={logRef}>
            {messages.length === 0 && <p className="muted small">Cards are being dealt…</p>}
            {messages.map((m, i) => (
              <div key={m.id} className={`talk ${m.kind}${i === messages.length - 1 ? ' latest' : ''}`}>
                {m.title && <div className="talk-title">{m.title}</div>}
                {m.paragraphs.map((p) => (
                  <p key={p}>
                    <TermText text={p} />
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function BeginnerActions({
  game,
  ctx,
  suggested,
  suggestedSize,
  onAction,
}: {
  game: GameState;
  ctx: DecisionContext;
  suggested: Move;
  suggestedSize?: number;
  onAction: (a: PlayerAction) => void;
}) {
  const legal = legalActions(game);
  const pot = potSize(game);
  const clamp = (to: number) => Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(to / game.bigBlind) * game.bigBlind));
  const aggressive = legal.canBet || legal.canRaise;
  const small = clamp(legal.canBet ? pot * 0.5 : game.currentBet + (pot + ctx.toCall) * 0.5);
  const big = clamp(legal.canBet ? pot : game.currentBet + (pot + ctx.toCall));
  const pick = (m: Move) => (m === suggested || (m === 'bet' && suggested === 'raise') || (m === 'raise' && suggested === 'bet') ? ' suggested' : '');
  // Small bluffs and continuation bets point at the smaller button; value bets at the bigger one.
  const bigSuggested = (suggestedSize ?? 0.5) > 0.5;

  return (
    <div className="action-bar beginner-actions" data-tour="beginner-actions">
      <div className="action-row">
        <button className={`btn fold${pick('fold')}`} onClick={() => onAction({ type: 'fold' })}>
          Fold
          <small>give up this hand</small>
        </button>
        {legal.canCheck ? (
          <button className={`btn passive${pick('check')}`} onClick={() => onAction({ type: 'check' })}>
            Check
            <small>free — pass to the next player</small>
          </button>
        ) : (
          <button className={`btn passive${pick('call')}`} onClick={() => onAction({ type: 'call' })}>
            Call {legal.callAmount}
            <small>match the bet to keep playing</small>
          </button>
        )}
        {aggressive && (
          <>
            <button
              className={`btn aggressive${big > small && bigSuggested ? '' : pick(legal.canBet ? 'bet' : 'raise')}`}
              onClick={() => onAction({ type: legal.canBet ? 'bet' : 'raise', to: small })}
            >
              {legal.canBet ? `Bet ${small}` : `Raise to ${small}`}
              <small>a smaller {legal.canBet ? 'bet' : 'raise'}</small>
            </button>
            {big > small && (
              <button
                className={`btn aggressive${bigSuggested ? pick(legal.canBet ? 'bet' : 'raise') : ''}`}
                onClick={() => onAction({ type: legal.canBet ? 'bet' : 'raise', to: big })}
              >
                {legal.canBet ? `Bet ${big}` : `Raise to ${big}`}
                <small>a bigger {legal.canBet ? 'bet' : 'raise'}</small>
              </button>
            )}
          </>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        ★ marks the coach's suggestion — you're free to choose anything.
      </p>
    </div>
  );
}
