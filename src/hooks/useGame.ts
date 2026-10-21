import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Card } from '../engine/cards';
import { analyseThreats, calculateEquity, countOuts, findNuts, startingHand } from '../engine/analysis';
import { decideBotAction } from '../engine/bots';
import {
  type CoachFeedback,
  type DecisionContext,
  type ReasonTag,
  type Verdict,
  evaluateDecision,
  readsEquity,
  inferReasons,
  respondToReason,
} from '../engine/coach';
import {
  type BotStyle,
  type GameState,
  type PlayerAction,
  type SeatConfig,
  type Street,
  activePlayers,
  applyAction,
  legalActions,
  netResult,
  newHand,
  positionOf,
  potSize,
} from '../engine/game';
import { buildReads, handLine, readChecks } from '../engine/reads';
import { type Decision, type HandReview, resolveShowdown, reviewHand } from '../engine/review';
import { BOT_DELAY_MS, ITERATIONS, type Settings } from './useSettings';

export const BIG_BLIND = 10;
export const SMALL_BLIND = 5;
export const STARTING_STACK = 1000;

const BOT_NAMES = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey'];
const STYLE_CYCLE: BotStyle[] = ['balanced', 'loose', 'tight', 'aggressive', 'balanced'];

export interface TimelinePoint {
  street: Street;
  equity: number;
  opponents: number;
  /** Opponents still in when this street began (for hindsight equity). */
  opponentIds: number[];
}

export interface CoachState {
  decisionIndex: number;
  /** Waiting for the player to say why. */
  awaitingWhy: boolean;
  feedback: CoachFeedback | null;
  replies: string[];
}

export interface SessionStats {
  hands: number;
  net: number;
  verdicts: Record<Verdict, number>;
}

function seatsFor(settings: Settings): SeatConfig[] {
  const seats: SeatConfig[] = [{ name: 'You', isHero: true, style: 'balanced' }];
  for (let i = 0; i < settings.opponents; i++) {
    seats.push({ name: BOT_NAMES[i], isHero: false, style: settings.botStyle === 'mixed' ? STYLE_CYCLE[i] : settings.botStyle });
  }
  return seats;
}

export interface GameOptions {
  /** Grade each action and hold the table until resume() — used by the Beginner tab. */
  pauseAfterAction?: boolean;
}

export function useGame(settings: Settings, options: GameOptions = {}) {
  const [game, setGame] = useState<GameState | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [coach, setCoach] = useState<CoachState | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [session, setSession] = useState<SessionStats>({ hands: 0, net: 0, verdicts: { great: 0, good: 0, questionable: 0, mistake: 0 } });
  const handCounter = useRef(0);
  const recorded = useRef(-1);

  const hero = game?.players.find((p) => p.isHero) ?? null;
  const heroIn = !!hero && !hero.folded;
  const iterations = ITERATIONS[settings.accuracy];
  const activeOpponents = game ? activePlayers(game).filter((p) => !p.isHero) : [];
  const opponentKey = activeOpponents.map((p) => p.id).join(',');
  const boardKey = game?.board.join(',') ?? '';
  const holeKey = hero?.hole.join(',') ?? '';

  /** Everything about hero's hand that doesn't depend on bet sizes. */
  const analysis = useMemo(() => {
    if (!game || !hero || !heroIn || activeOpponents.length === 0) return null;
    const opponents = activeOpponents.length;
    return {
      equity: calculateEquity({ hero: hero.hole, board: game.board, opponents, iterations }),
      threats: analyseThreats(hero.hole, game.board, opponents),
      outs: countOuts(hero.hole, game.board),
      nuts: findNuts(game.board),
      start: startingHand(hero.hole),
      opponents,
    };
    // Keyed on exactly what the analysis depends on, not on every bet.
  }, [holeKey, boardKey, opponentKey, heroIn, iterations, game?.handNumber]);

  // Record equity per street for the chart (latest value wins within a street).
  useEffect(() => {
    if (!analysis || !game || game.finished) return;
    const point: TimelinePoint = {
      street: game.street,
      equity: analysis.equity.equity,
      opponents: analysis.opponents,
      opponentIds: activeOpponents.map((p) => p.id),
    };
    setTimeline((t) => [...t.filter((x) => x.street !== point.street), point]);
  }, [analysis]);

  const heroToAct = !!game && !game.finished && game.players[game.toAct]?.isHero;

  const heroContext: DecisionContext | null = useMemo(() => {
    if (!game || !hero || !analysis || !heroToAct) return null;
    const toCall = legalActions(game).callAmount;
    const reads = buildReads(game, hero.id);
    return {
      street: game.street,
      hole: hero.hole,
      board: game.board,
      opponents: analysis.opponents,
      pot: potSize(game),
      toCall,
      bigBlind: game.bigBlind,
      heroStack: hero.stack,
      equity: analysis.equity,
      rangeEquity: readsEquity(hero.hole, game.board, reads, iterations),
      position: positionOf(hero.id, game.buttonIndex, game.players.length),
      reads,
      line: handLine(game, hero.id),
      threats: analysis.threats,
      outs: analysis.outs,
      nuts: analysis.nuts,
      start: analysis.start,
    };
  }, [game, hero, analysis, heroToAct, iterations]);

  const dealNext = useCallback(() => {
    const seats = seatsFor(settings);
    const handNumber = ++handCounter.current;
    setGame(
      newHand({
        seats,
        handNumber,
        buttonIndex: (handNumber - 1) % seats.length,
        startingStack: STARTING_STACK,
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
      }),
    );
    setDecisions([]);
    setCoach(null);
    setTimeline([]);
    setHoldTable(false);
  }, [settings]);

  // In "ask" mode the table waits until the player has explained their action
  // and read the feedback (pressing Continue).
  const [holdTable, setHoldTable] = useState(false);

  const heroAct = useCallback(
    (action: PlayerAction) => {
      if (!game || !heroContext) return;
      const villainHoles: Card[][] = activePlayers(game)
        .filter((p) => !p.isHero)
        .map((p) => p.hole);
      const next = applyAction(game, action);
      const logged = next.log[next.log.length - 1];
      const decision: Decision = { ctx: heroContext, action: logged.type, amountTo: logged.to, reasons: [], note: '', villainHoles };
      const index = decisions.length;
      setDecisions((d) => [...d, decision]);
      setGame(next);
      if (settings.coachMode === 'ask') {
        setCoach({ decisionIndex: index, awaitingWhy: true, feedback: null, replies: [] });
        setHoldTable(true);
      } else if (settings.coachMode === 'feedback' || options.pauseAfterAction) {
        setCoach({ decisionIndex: index, awaitingWhy: false, feedback: evaluateDecision(heroContext, logged.type, logged.to), replies: [] });
        if (options.pauseAfterAction && !next.finished) setHoldTable(true);
      }
    },
    [game, heroContext, decisions.length, settings.coachMode, options.pauseAfterAction],
  );

  const answerWhy = useCallback(
    (tags: ReasonTag[], note: string) => {
      if (!coach) return;
      const d = decisions[coach.decisionIndex];
      if (!d) return;
      const allTags = [...new Set([...tags, ...inferReasons(note)])];
      const updated: Decision = { ...d, reasons: tags, note };
      setDecisions((list) => list.map((x, i) => (i === coach.decisionIndex ? updated : x)));
      setCoach({
        ...coach,
        awaitingWhy: false,
        feedback: evaluateDecision(d.ctx, d.action, d.amountTo),
        replies: allTags.length || note.trim() ? respondToReason(d.ctx, d.action, allTags, d.amountTo) : [],
      });
    },
    [coach, decisions],
  );

  const resume = useCallback(() => setHoldTable(false), []);

  // Bots act on a timer so the player can follow the action.
  useEffect(() => {
    if (!game || game.finished || holdTable) return;
    const actor = game.players[game.toAct];
    if (!actor || actor.isHero) return;
    const delay = heroIn ? BOT_DELAY_MS[settings.speed] : Math.min(250, BOT_DELAY_MS[settings.speed]);
    const timer = setTimeout(() => {
      setGame((g) => (g && !g.finished && g.toAct === game.toAct && g.handNumber === game.handNumber ? applyAction(g, decideBotAction(g)) : g));
    }, delay);
    return () => clearTimeout(timer);
  }, [game, holdTable, heroIn, settings.speed]);

  // End-of-hand review: grade decisions and compute hindsight equity.
  const review: HandReview | null = useMemo(() => {
    if (!game?.finished || !hero) return null;
    const showdown =
      game.showdown && game.results[hero.id]
        ? resolveShowdown(
            hero.hole,
            game.board,
            activePlayers(game)
              .filter((p) => !p.isHero)
              .map((p) => p.hole),
          )
        : null;
    return reviewHand(decisions, showdown);
  }, [game?.finished, game?.handNumber, decisions]);

  const hindsightTimeline = useMemo(() => {
    if (!game?.finished || !hero) return [];
    return timeline.map((t) => {
      const boardAt = game.board.slice(0, t.street === 'preflop' ? 0 : t.street === 'flop' ? 3 : t.street === 'turn' ? 4 : 5);
      const known = t.opponentIds.map((id) => game.players[id].hole);
      return {
        street: t.street,
        equity: calculateEquity({ hero: hero.hole, board: boardAt, opponents: known.length, knownOpponents: known, iterations: 4000 }).equity,
      };
    });
  }, [game?.finished, game?.handNumber, timeline]);

  // Session stats, recorded once per finished hand.
  useEffect(() => {
    if (!game?.finished || !hero || !review || recorded.current === game.handNumber) return;
    recorded.current = game.handNumber;
    setSession((s) => {
      const verdicts = { ...s.verdicts };
      for (const r of review.decisions) verdicts[r.feedback.verdict]++;
      return { hands: s.hands + 1, net: s.net + netResult(game, hero.id), verdicts };
    });
  }, [game, hero, review]);

  const reveals = useMemo(() => (game?.finished && hero ? readChecks(game, hero.id) : []), [game?.finished, game?.handNumber]);

  return {
    game,
    hero,
    reveals,
    analysis,
    heroContext,
    heroToAct,
    timeline,
    hindsightTimeline,
    decisions,
    coach,
    holdTable,
    review,
    session,
    dealNext,
    heroAct,
    answerWhy,
    resume,
  };
}
