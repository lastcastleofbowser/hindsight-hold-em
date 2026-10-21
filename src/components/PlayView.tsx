import { legalActions, netResult, potSize } from '../engine/game';
import type { HandReview } from '../engine/review';
import { useGame } from '../hooks/useGame';
import type { Settings } from '../hooks/useSettings';
import { ActionBar } from './ActionBar';
import { CoachPanel } from './CoachPanel';
import { HandSummary } from './HandSummary';
import { OddsPanel } from './OddsPanel';
import { PokerTable } from './PokerTable';
import { TermText } from './Term';
import { useAutoTour } from './Tour';

interface Props {
  settings: Settings;
  /** True while this tab is on screen (tutorial tours only run then). */
  active: boolean;
  onDiscuss: (review: HandReview, handNumber: number) => void;
}

export function PlayView({ settings, active, onDiscuss }: Props) {
  const g = useGame(settings);
  const showOddsPanel = settings.showOdds || !!g.game?.finished;
  useAutoTour('play-intro', active && !g.game);
  useAutoTour('play-decision', active && g.heroToAct && !g.holdTable && showOddsPanel);
  useAutoTour('play-postflop', active && g.heroToAct && !g.holdTable && showOddsPanel && g.game?.street !== 'preflop');
  useAutoTour('play-why', active && !!g.coach?.awaitingWhy);
  useAutoTour('play-feedback', active && !!g.coach?.feedback && !g.game?.finished);
  useAutoTour('play-summary', active && !!g.game?.finished && !!g.review);
  const { game, hero, analysis, review } = g;
  const accuracy = g.session.verdicts.great + g.session.verdicts.good;
  const graded = accuracy + g.session.verdicts.questionable + g.session.verdicts.mistake;

  if (!game || !hero) {
    return (
      <div className="panel welcome">
        <h1>Hindsight Hold'em</h1>
        <p>
          Play No-Limit <TermText text="Texas Hold'em" /> against bots with live win chances. After every move the coach asks <i>why</i> — then shows where your
          logic held up, and what the cards really were. New to the game? Start with the <b>Learn</b> tab, and hover over any dotted-underlined word for a definition.
        </p>
        <button className="btn primary" onClick={g.dealNext} data-tour="deal-button">
          Deal me in
        </button>
      </div>
    );
  }

  const toCall = g.heroToAct ? legalActions(game).callAmount : 0;
  const net = game.finished ? netResult(game, hero.id) : 0;

  // The action area always sits directly under the table, so the next thing to press is never off-screen.
  let actionArea: React.ReactNode;
  if (game.finished && review) {
    actionArea = (
      <div className="result-bar" data-tour="summary-result">
        <span className={`result-big ${net > 0 ? 'win' : net < 0 ? 'loss' : ''}`}>
          {net > 0 ? `+${net}` : net} chips
        </span>
        <div className="row-btns" style={{ marginTop: 0 }}>
          {review.decisions.length > 0 && (
            <button className="btn ghost" onClick={() => onDiscuss(review, game.handNumber)} data-tour="discuss">
              Discuss with coach
            </button>
          )}
          <button className="btn primary" onClick={g.dealNext} autoFocus data-tour="next-hand">
            Deal next hand
          </button>
        </div>
      </div>
    );
  } else if (g.heroToAct && !g.holdTable) {
    actionArea = <ActionBar game={game} onAction={g.heroAct} shortcuts={active} />;
  } else if (g.holdTable && g.coach?.awaitingWhy) {
    actionArea = (
      <div className="result-bar">
        <span className="muted">The coach is asking why you made that move — answer in the Coach panel, or skip.</span>
        <button className="btn ghost" onClick={() => g.answerWhy([], '')}>
          Skip
        </button>
      </div>
    );
  } else if (g.holdTable) {
    actionArea = (
      <div className="result-bar">
        <span className="muted">Read the coach's feedback, then carry on.</span>
        <button className="btn primary" onClick={g.resume}>
          Continue
        </button>
      </div>
    );
  } else {
    actionArea = (
      <div className="waiting">{hero.folded ? 'You folded. Finishing the hand…' : `Waiting for ${game.players[game.toAct]?.name ?? 'the dealer'}…`}</div>
    );
  }

  return (
    <div className="play-layout fit">
      <div className="play-main">
        <div className="session-bar" aria-label="Session stats" data-tour="session-stats">
          <span className="stat">
            Hand <b>#{game.handNumber}</b>
          </span>
          <span className="stat">
            Session{' '}
            <b className={g.session.net > 0 ? 'pos' : g.session.net < 0 ? 'neg' : ''}>
              {g.session.net > 0 ? '+' : ''}
              {g.session.net}
            </b>
          </span>
          <span className="stat">
            Good decisions <b>{graded ? `${Math.round((accuracy / graded) * 100)}%` : '—'}</b>
          </span>
          <span className="stat">
            Blinds <b>{game.smallBlind}/{game.bigBlind}</b>
          </span>
        </div>
        <div className="table-area">
          <PokerTable game={game} heroHandName={showOddsPanel ? analysis?.threats?.hero.name : undefined} />
        </div>
        <div className="action-area">{actionArea}</div>
      </div>

      <div className="side">
        {game.finished && review && <HandSummary game={game} review={review} reveals={g.reveals} beginner={settings.beginnerMode} />}
        <CoachPanel
          mode={settings.coachMode}
          coach={g.coach}
          decisions={g.decisions}
          heroContext={g.holdTable ? null : g.heroContext}
          holdTable={g.holdTable}
          beginner={settings.beginnerMode}
          onAnswer={g.answerWhy}
          onResume={g.resume}
        />
        {showOddsPanel && (
          <OddsPanel
            analysis={analysis}
            readsEquity={g.heroContext?.rangeEquity?.equity}
            reads={g.heroContext?.reads}
            toCall={toCall}
            pot={potSize(game)}
            timeline={g.timeline}
            hindsight={g.hindsightTimeline}
            heroFolded={hero.folded}
          />
        )}
      </div>
    </div>
  );
}
