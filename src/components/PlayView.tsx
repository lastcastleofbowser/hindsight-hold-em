import { useEffect, useRef, useState } from 'react';
import { isLimpSpot } from '../engine/coach';
import { legalActions, netResult, potSize } from '../engine/game';
import type { HandReview } from '../engine/review';
import { STARTING_STACK, useGame } from '../hooks/useGame';
import type { Settings } from '../hooks/useSettings';
import { ActionBar } from './ActionBar';
import { CoachPanel } from './CoachPanel';
import { GlanceStrip } from './GlanceStrip';
import { HandSummary } from './HandSummary';
import { ChartPanel, OddsPanel } from './OddsPanel';
import { PokerTable } from './PokerTable';
import { type SideTab, SideTabs } from './SideTabs';
import { SteadyArea } from './SteadyArea';
import { TermText } from './Term';
import { useAutoTour, useTour } from './Tour';

const AUTO_DEAL_SECONDS = 5;

interface Props {
  settings: Settings;
  /** True while this tab is on screen (tutorial tours only run then). */
  active: boolean;
  onDiscuss: (review: HandReview, handNumber: number) => void;
}

export function PlayView({ settings, active, onDiscuss }: Props) {
  const g = useGame(settings, { persistChips: 'hindsight.play.chips' });
  const resetChips = () => {
    if (window.confirm(`Reset everyone at the table back to ${STARTING_STACK} chips?`)) g.resetChips();
  };
  const showOddsPanel = settings.showOdds || !!g.game?.finished;
  useAutoTour('play-intro', active && !g.game);
  useAutoTour('play-decision', active && g.heroToAct && !g.holdTable && showOddsPanel);
  useAutoTour('play-postflop', active && g.heroToAct && !g.holdTable && showOddsPanel && g.game?.street !== 'preflop');
  useAutoTour('play-why', active && !!g.coach?.awaitingWhy);
  useAutoTour('play-feedback', active && !!g.coach?.feedback && !g.game?.finished);
  useAutoTour('play-summary', active && !!g.game?.finished && !!g.review);
  const { game, hero, analysis, review } = g;

  // Side column tabs. The summary opens when a hand ends; the next hand goes back to the tab the player had.
  const [sideTab, setSideTab] = useState<string>(settings.coachMode === 'off' ? 'odds' : 'coach');
  const beforeSummary = useRef('coach');
  const handOver = !!game?.finished && !!review;
  useEffect(() => {
    if (handOver) {
      setSideTab((t) => {
        if (t !== 'summary') beforeSummary.current = t;
        return 'summary';
      });
    } else setSideTab((t) => (t === 'summary' ? beforeSummary.current : t));
  }, [handOver]);
  // The coach is waiting for an answer, so bring it forward.
  useEffect(() => {
    if (g.coach?.awaitingWhy) setSideTab('coach');
  }, [g.coach?.awaitingWhy]);
  // New feedback the player hasn't opened yet puts a dot on the Coach tab.
  const coachKey = g.coach?.feedback ? `${game?.handNumber}-${g.coach.decisionIndex}` : '';
  const [seenCoach, setSeenCoach] = useState('');
  useEffect(() => {
    if (sideTab === 'coach') setSeenCoach(coachKey);
  }, [sideTab, coachKey]);

  // Auto-deal: the next hand starts after a short countdown unless the player cancels it.
  // It waits while a tour is open, the coach is asking why, the tab is hidden, or the mouse is over the side panel.
  const tour = useTour();
  const [autoDealCancelled, setAutoDealCancelled] = useState(false);
  const [reading, setReading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_DEAL_SECONDS);
  const autoDealWaiting = handOver && !autoDealCancelled;
  const autoDealRunning = autoDealWaiting && active && !tour.open && !g.coach?.awaitingWhy && !reading;
  useEffect(() => setAutoDealCancelled(false), [game?.handNumber]);
  useEffect(() => {
    setSecondsLeft(AUTO_DEAL_SECONDS);
    if (!autoDealRunning) return;
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [autoDealRunning]);
  useEffect(() => {
    if (autoDealRunning && secondsLeft <= 0) g.dealNext();
  }, [autoDealRunning, secondsLeft]);

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
        {g.bankroll !== null && g.bankroll !== STARTING_STACK && (
          <p>
            You have <b>{g.bankroll}</b> chips from last time.{' '}
            <button className="link-btn" onClick={resetChips}>
              Start again with {STARTING_STACK}
            </button>
          </p>
        )}
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
          {autoDealWaiting && (
            <button className="btn ghost" onClick={() => setAutoDealCancelled(true)} title="Stay on this hand until you deal the next one yourself">
              Cancel auto-deal
            </button>
          )}
          <button className="btn primary" onClick={g.dealNext} autoFocus data-tour="next-hand">
            Deal next hand
            {autoDealWaiting && <span className="countdown">{autoDealRunning ? ` in ${secondsLeft}s` : ' (paused)'}</span>}
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

  const sideTabs: SideTab[] = [];
  if (settings.coachMode !== 'off') {
    sideTabs.push({
      id: 'coach',
      label: 'Coach',
      dot: !!coachKey && coachKey !== seenCoach,
      content: (
        <CoachPanel
          mode={settings.coachMode}
          coach={g.coach}
          decisions={g.decisions}
          heroContext={g.holdTable ? null : g.heroContext}
          holdTable={g.holdTable}
          beginner={settings.beginnerMode}
          lastHand={game.finished ? null : g.lastHand}
          onAnswer={g.answerWhy}
          onResume={g.resume}
        />
      ),
    });
  }
  if (showOddsPanel) {
    sideTabs.push(
      {
        id: 'odds',
        label: 'Odds',
        content: (
          <OddsPanel
            analysis={analysis}
            readsEquity={g.heroContext?.rangeEquity?.equity}
            reads={g.heroContext?.reads}
            toCall={toCall}
            pot={potSize(game)}
            timeline={g.timeline}
            hindsight={g.hindsightTimeline}
            heroFolded={hero.folded}
            chart={false}
            limpSpot={!!g.heroContext && isLimpSpot(g.heroContext)}
          />
        ),
      },
      { id: 'chart', label: 'Chart', content: <ChartPanel timeline={g.timeline} hindsight={g.hindsightTimeline} /> },
    );
  }
  if (game.finished && review) {
    sideTabs.push({ id: 'summary', label: 'Summary', content: <HandSummary game={game} review={review} reveals={g.reveals} beginner={settings.beginnerMode} /> });
  }
  const glance = (
    <GlanceStrip
      game={game}
      hero={hero}
      analysis={analysis}
      showOdds={settings.showOdds}
      toCall={toCall}
      pot={potSize(game)}
      feedback={g.coach?.feedback ?? null}
      review={review}
      onOpen={setSideTab}
    />
  );

  return (
    <div className="play-layout fit">
      <div className="play-main">
        <div className="session-bar" aria-label="Session stats" data-tour="session-stats">
          <span className="stat">
            Hand <b>#{game.handNumber}</b>
          </span>
          <span className="stat" title="Your chips carry over between hands and visits">
            Chips <b>{hero.stack}</b>
            {g.canResetChips && (
              <button className="link-btn" onClick={resetChips}>
                Reset
              </button>
            )}
          </span>
          {g.reloaded && (
            <span className="stat">
              <b className="neg">Out of chips</b> — you've been given a fresh {STARTING_STACK}
            </span>
          )}
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
        <SteadyArea>
          <div className="action-area">{actionArea}</div>
        </SteadyArea>
      </div>

      <div className="side tabbed" onMouseEnter={() => setReading(true)} onMouseLeave={() => setReading(false)}>
        <SideTabs tabs={sideTabs} active={sideTab} onSelect={setSideTab} header={glance} />
      </div>
    </div>
  );
}
