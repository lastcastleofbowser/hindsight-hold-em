import { useCallback, useEffect, useState } from 'react';
import { pct } from '../engine/analysis';
import { cardsLabel } from '../engine/cards';
import { CATEGORY_NAMES, Category } from '../engine/evaluator';
import { CATEGORY_HELP, orderBest5 } from '../engine/explain';
import {
  PLAYER_LABELS,
  QUIZ_FOCUS_LABELS,
  type QuizDeal,
  type QuizFocus,
  type QuizGrade,
  generateQuiz,
  gradeQuiz,
} from '../engine/quiz';
import { MiniCards, PlayingCard } from './PlayingCard';
import { G, TermText } from './Term';
import { useAutoTour } from './Tour';

type Stage = 'flop' | 'river' | 'result';

interface Score {
  played: number;
  correct: number;
  streak: number;
  best: number;
}

const SCORE_KEY = 'hindsight-holdem.quiz-score.v1';
const MIN_REASON = 10;
const CATEGORIES_HIGH_TO_LOW = (Object.values(Category).filter((v) => typeof v === 'number') as Category[]).sort((a, b) => b - a);

function loadScore(): Score {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Storage unavailable — start fresh.
  }
  return { played: 0, correct: 0, streak: 0, best: 0 };
}

export function QuizView({ active }: { active: boolean }) {
  const [players, setPlayers] = useState(2);
  const [focus, setFocus] = useState<QuizFocus>('mixed');
  const [teachEquity, setTeachEquity] = useState(true);
  const [deal, setDeal] = useState<QuizDeal>(() => generateQuiz(2, 'mixed'));
  const [stage, setStage] = useState<Stage>(teachEquity ? 'flop' : 'river');
  const [flopGuess, setFlopGuess] = useState<number | 'tie' | null>(null);
  const [winner, setWinner] = useState<number | 'split' | null>(null);
  const [category, setCategory] = useState<Category | ''>('');
  const [reason, setReason] = useState('');
  const [grade, setGrade] = useState<QuizGrade | null>(null);
  const [score, setScore] = useState<Score>(loadScore);
  const [showRankings, setShowRankings] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SCORE_KEY, JSON.stringify(score));
    } catch {
      // Non-fatal.
    }
  }, [score]);

  const newDeal = useCallback(
    (p = players, f = focus, teach = teachEquity) => {
      setDeal(generateQuiz(p, f));
      setStage(teach ? 'flop' : 'river');
      setFlopGuess(null);
      setWinner(null);
      setCategory('');
      setReason('');
      setGrade(null);
    },
    [players, focus, teachEquity],
  );

  const submit = () => {
    if (winner === null || category === '' || reason.trim().length < MIN_REASON) return;
    const g = gradeQuiz(deal, { winner, category, reason });
    setGrade(g);
    setStage('result');
    const right = g.winnerCorrect && g.categoryCorrect;
    setScore((s) => {
      const streak = right ? s.streak + 1 : 0;
      return { played: s.played + 1, correct: s.correct + (right ? 1 : 0), streak, best: Math.max(s.best, streak) };
    });
  };

  useAutoTour('quiz', active);
  useAutoTour('quiz-flop', active && stage === 'flop' && flopGuess !== null);

  const visibleBoard = stage === 'flop' ? deal.board.slice(0, 3) : deal.board;
  const winningCards = new Set(stage === 'result' ? deal.winners.flatMap((w) => deal.results[w].best5) : []);
  const reasonOk = reason.trim().length >= MIN_REASON;

  return (
    <div className="quiz-layout">
      <section className="panel quiz-controls" aria-label="Quiz settings" data-tour="quiz-controls">
        <h2>
          Which hand wins?
          <span className="small muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
            Score {score.correct}/{score.played} · streak {score.streak} · best {score.best}
          </span>
        </h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Read every hand like a dealer would: find each player's best five cards from their two <TermText text="hole cards" /> plus the five on the{' '}
          <TermText text="board" />, then decide who wins — and say why.
        </p>
        <div className="quiz-options">
          <div className="setting">
            <span className="small">Players</span>
            <div className="seg" role="group" aria-label="Players">
              {[2, 3, 4].map((n) => (
                <button key={n} aria-pressed={players === n} onClick={() => { setPlayers(n); newDeal(n); }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span className="small">Practise</span>
            <div className="seg" role="group" aria-label="Focus">
              {(Object.keys(QUIZ_FOCUS_LABELS) as QuizFocus[]).map((f) => (
                <button key={f} aria-pressed={focus === f} onClick={() => { setFocus(f); newDeal(players, f); }}>
                  {QUIZ_FOCUS_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <label className="toggle small">
            <input
              type="checkbox"
              checked={teachEquity}
              onChange={(e) => {
                setTeachEquity(e.target.checked);
                newDeal(players, focus, e.target.checked);
              }}
            />
            Start on the flop and learn <G term="Equity">equity</G>
          </label>
          <button className="btn ghost" style={{ flex: '0 0 auto' }} onClick={() => newDeal()}>
            New deal
          </button>
        </div>
      </section>

      <section className="panel quiz-table" aria-label="Cards" data-tour="quiz-cards">
        <div className="quiz-board">
          <span className="label">Board</span>
          <div className="board-cards">
            {Array.from({ length: 5 }, (_, i) =>
              visibleBoard[i] === undefined ? (
                <div key={`s${i}`} className="card-slot" />
              ) : (
                <PlayingCard
                  key={`${deal.board.join()}-${i}`}
                  card={visibleBoard[i]}
                  dealDelay={i < 3 ? i * 0.1 : (i - 3) * 0.2}
                  highlight={winningCards.has(visibleBoard[i])}
                  dim={stage === 'result' && !winningCards.has(visibleBoard[i])}
                />
              ),
            )}
          </div>
        </div>
        <div className="quiz-hands">
          {deal.hands.map((h, i) => {
            const isWinner = stage === 'result' && deal.winners.includes(i);
            return (
              <div key={i} className={`quiz-hand${isWinner ? ' winner' : ''}`}>
                <div className="quiz-hand-head">
                  <b>{PLAYER_LABELS[i]}</b>
                  {isWinner && <span className="verdict great">Winner</span>}
                </div>
                <div className="board-cards">
                  {h.map((c) => (
                    <PlayingCard key={`${deal.board.join()}-${c}`} card={c} highlight={isWinner && deal.results[i].best5.includes(c)} />
                  ))}
                </div>
                {stage === 'result' && (
                  <div className="small">
                    <b>{deal.results[i].name}</b>
                    <div>
                      <MiniCards cards={orderBest5(deal.results[i])} />
                    </div>
                  </div>
                )}
                {stage !== 'flop' && stage !== 'result' && flopGuess !== null && (
                  <div className="small muted">Flop: {deal.flop.current[i].name}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel quiz-question" aria-live="polite" data-tour="quiz-question">
        {stage === 'flop' && <FlopStep deal={deal} guess={flopGuess} onGuess={setFlopGuess} onContinue={() => setStage('river')} />}

        {stage === 'river' && (
          <>
            <h2>Which hand wins at showdown?</h2>
            <div className="choice-row" role="group" aria-label="Winner">
              {deal.hands.map((_, i) => (
                <button key={i} className="reason-chip" aria-pressed={winner === i} onClick={() => setWinner(i)}>
                  {PLAYER_LABELS[i]}
                </button>
              ))}
              <button className="reason-chip" aria-pressed={winner === 'split'} onClick={() => setWinner('split')}>
                Split pot (tie)
              </button>
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              What is the winning hand?
              <select value={category} onChange={(e) => setCategory(e.target.value === '' ? '' : (Number(e.target.value) as Category))}>
                <option value="">Choose a hand type…</option>
                {CATEGORIES_HIGH_TO_LOW.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_NAMES[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              Why? Explain your thinking (required)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Player B has five hearts — a flush — which beats Player A's straight."
              />
            </label>
            {!reasonOk && reason.length > 0 && <div className="small muted">A few more words, please — say which hand type wins and why.</div>}
            <div className="row-btns">
              <button className="btn primary" disabled={winner === null || category === '' || !reasonOk} onClick={submit}>
                Check my answer
              </button>
              <button className="btn ghost" onClick={() => setShowRankings((v) => !v)}>
                {showRankings ? 'Hide' : 'Show'} hand rankings
              </button>
            </div>
            {showRankings && <RankingsList />}
          </>
        )}

        {stage === 'result' && grade && (
          <>
            <h2>Result</h2>
            <div className="coach-card">
              {grade.lines.map((l) => (
                <p key={l} style={{ margin: '0 0 8px' }}>
                  <TermText text={l} />
                </p>
              ))}
              <div className="small muted">
                Your reasoning: “{reason.trim()}”
              </div>
            </div>
            <div className="row-btns">
              <button className="btn primary" onClick={() => newDeal()} autoFocus>
                Next deal
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FlopStep({
  deal,
  guess,
  onGuess,
  onContinue,
}: {
  deal: QuizDeal;
  guess: number | 'tie' | null;
  onGuess: (g: number | 'tie') => void;
  onContinue: () => void;
}) {
  const { flop } = deal;
  const tied = flop.leaders.length > 1;
  const correct = guess !== null && (tied ? guess === 'tie' : guess === flop.leaders[0]);
  return (
    <>
      <h2>Step 1 — on the flop, who is ahead right now?</h2>
      {guess === null ? (
        <div className="choice-row" role="group" aria-label="Who is ahead">
          {deal.hands.map((_, i) => (
            <button key={i} className="reason-chip" onClick={() => onGuess(i)}>
              {PLAYER_LABELS[i]}
            </button>
          ))}
          <button className="reason-chip" onClick={() => onGuess('tie')}>
            They're tied
          </button>
        </div>
      ) : (
        <div className="coach-card">
          <p style={{ marginTop: 0 }}>
            {correct ? '✅ Right' : '❌ Not quite'} — {tied ? 'it is tied' : `${PLAYER_LABELS[flop.leaders[0]]} is ahead`} on the flop.
          </p>
          <ul className="points">
            {deal.hands.map((_, i) => (
              <li key={i}>
                {PLAYER_LABELS[i]}: {flop.current[i].name}
              </li>
            ))}
          </ul>
          <h3 className="small" style={{ margin: '14px 0 6px' }}>
            But being ahead now isn't the same as winning. Each player's <G term="Equity">equity</G> (chance to win by the river):
          </h3>
          <div className="bars" data-tour="quiz-equity">
            {flop.equity.map((e, i) => (
              <div className="bar-row" key={i}>
                <span>{PLAYER_LABELS[i]}</span>
                <span className="track">
                  <span className="fill" style={{ width: pct(e, 1), display: 'block' }} />
                </span>
                <span className="v">{pct(e)}</span>
              </div>
            ))}
          </div>
          {flop.outs.map(({ player, cards }) => {
            const exact = flop.equity[player];
            return (
              <p key={player} className="small" style={{ marginBottom: 0 }}>
                <b>{PLAYER_LABELS[player]}</b> is behind but has <TermText text={`${cards.length} outs`} />
                {cards.length > 0 && (
                  <>
                    {' '}
                    ({cardsLabel(cards)})
                  </>
                )}
                . <G term="Rule of 4 and 2">Rule of 4</G>: {cards.length} × 4 ≈ {Math.min(100, cards.length * 4)}%. Exact chance: {pct(exact)}.
                {Math.abs(exact - cards.length * 0.04) > 0.05 &&
                  ' The exact figure differs because it also counts ties (half a win each) and hands that need both the turn and the river ("runner-runner"), which the quick rule ignores.'}
              </p>
            );
          })}
          <p className="small muted" style={{ marginBottom: 0 }}>
            How equity is calculated: we dealt every possible turn-and-river combination ({flop.runouts.toLocaleString()} of them) and counted how often each hand ends up
            best. The rule of 4 is the quick mental version: on the flop, outs × 4 ≈ your % to hit by the river.
          </p>
          <div className="row-btns">
            <button className="btn primary" onClick={onContinue} autoFocus>
              Deal the turn and river →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function RankingsList() {
  return (
    <ol className="rankings-mini">
      {CATEGORIES_HIGH_TO_LOW.map((c) => (
        <li key={c}>
          <b>{CATEGORY_NAMES[c]}</b> — {CATEGORY_HELP[c]}
        </li>
      ))}
    </ol>
  );
}
