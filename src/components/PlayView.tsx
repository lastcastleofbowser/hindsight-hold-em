import { legalActions, potSize } from '../engine/game';
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
  const showOdds = showOddsPanel;
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

  return (
    <div className="play-layout">
      <div>
        <div className="session-bar" aria-label="Session stats" data-tour="session-stats">
          <span className="stat">
            Hand <b>#{game.handNumber}</b>
          </span>
          <span className="stat">
            Session{' '}
            <b className={g.session.net > 0 ? 'pos' : g.session.net < 0 ? 'neg' : ''}>
              {g.session.net > 0 ? '+' : ''}
              {g.session.net}
            </b>{' '}
            chips
          </span>
          <span className="stat">
            Good decisions <b>{graded ? `${Math.round((accuracy / graded) * 100)}%` : '—'}</b> of {graded}
          </span>
          <span className="stat">
            Blinds <b>{game.smallBlind}/{game.bigBlind}</b> · stacks reset each hand
          </span>
        </div>

        <PokerTable game={game} heroHandName={showOdds ? analysis?.threats?.hero.name : undefined} />

        {game.finished && review ? (
          <HandSummary game={game} review={review} reveals={g.reveals} beginner={settings.beginnerMode} onNext={g.dealNext} onDiscuss={() => onDiscuss(review, game.handNumber)} />
        ) : g.heroToAct && !g.holdTable ? (
          <ActionBar game={game} onAction={g.heroAct} shortcuts={active} />
        ) : (
          <div className="action-bar">
            <div className="waiting">
              {g.holdTable ? 'Table paused — answer the coach to continue.' : hero.folded ? 'You folded. Finishing the hand…' : `Waiting for ${game.players[game.toAct]?.name ?? 'the dealer'}…`}
            </div>
          </div>
        )}
      </div>

      <div className="side">
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
        {showOdds && (
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
