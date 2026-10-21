import { useEffect, useMemo, useState } from 'react';
import { ALL_HANDS, CHARTS, type ChartAction, type ChartId, GRID, chartAction, combos, rangeShare } from '../engine/ranges';
import { G } from './Term';
import { useAutoTour } from './Tour';

const ORDER: ChartId[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB', 'HU'];
const SHORT: Record<ChartId, string> = { UTG: 'UTG', MP: 'MP', CO: 'CO', BTN: 'Button', SB: 'SB', BB: 'BB defend', HU: 'Heads-up' };
const SCORE_KEY = 'hindsight-holdem.range-drill.v1';

/** Picks a hand with probability proportional to its number of combinations. */
function randomHand(rng = Math.random): string {
  let r = rng() * 1326;
  for (const h of ALL_HANDS) {
    r -= combos(h);
    if (r <= 0) return h;
  }
  return ALL_HANDS[ALL_HANDS.length - 1];
}

function describeHand(h: string): string {
  if (h.length === 2) return `pocket ${h[0]}${h[1]}`;
  return `${h[0]}${h[1]} ${h[2] === 's' ? 'suited' : 'offsuit'}`;
}

export function RangesView({ active }: { active: boolean }) {
  const [chartId, setChartId] = useState<ChartId>('UTG');
  const [focus, setFocus] = useState<string | null>(null);
  useAutoTour('ranges', active);

  return (
    <div className="ranges-layout">
      <section className="panel" data-tour="range-chart">
        <h2>
          Pre-flop ranges
          <span className="small muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
            6-max · 100 big blinds
          </span>
        </h2>
        <div className="seg" role="group" aria-label="Position">
          {ORDER.map((id) => (
            <button key={id} aria-pressed={chartId === id} onClick={() => setChartId(id)}>
              {SHORT[id]}
            </button>
          ))}
        </div>
        <RangeGrid chartId={chartId} highlight={focus} onHover={setFocus} />
        <ChartInfo chartId={chartId} focus={focus} />
      </section>
      <Drill />
    </div>
  );
}

function RangeGrid({ chartId, highlight, onHover }: { chartId: ChartId; highlight: string | null; onHover?: (h: string | null) => void }) {
  return (
    <div className="range-grid" role="grid" aria-label={`${CHARTS[chartId].title} chart`}>
      {GRID.map((row, r) =>
        row.map((h, c) => {
          const act = chartAction(chartId, h);
          return (
            <div
              key={`${r}-${c}`}
              role="gridcell"
              className={`range-cell ${act}${highlight === h ? ' focus' : ''}`}
              onMouseEnter={() => onHover?.(h)}
              onMouseLeave={() => onHover?.(null)}
              onClick={() => onHover?.(h)}
              aria-label={`${h}: ${act}`}
            >
              {h}
            </div>
          );
        }),
      )}
    </div>
  );
}

function ChartInfo({ chartId, focus }: { chartId: ChartId; focus: string | null }) {
  const chart = CHARTS[chartId];
  const raisePct = Math.round(rangeShare(chart.raise) * 100);
  const callPct = Math.round(rangeShare(chart.call) * 100);
  const act = focus ? chartAction(chartId, focus) : null;
  return (
    <div className="chart-info">
      <h3>{chart.title}</h3>
      <p className="small" style={{ margin: '4px 0 8px' }}>
        {chart.description}
      </p>
      <div className="legend range-legend">
        <span>
          <i className="sw raise" /> {chartId === 'BB' ? 'Re-raise (3-bet)' : 'Raise'} · {raisePct}% of hands
        </span>
        {callPct > 0 && (
          <span>
            <i className="sw call" /> Call · {callPct}%
          </span>
        )}
        <span>
          <i className="sw fold" /> Fold
        </span>
      </div>
      <p className="small muted" style={{ minHeight: 20, marginBottom: 0 }}>
        {focus ? (
          <>
            <b style={{ color: 'var(--ink)' }}>{focus}</b> ({describeHand(focus)}, {combos(focus)} combos): <b>{act === 'raise' ? (chartId === 'BB' ? 're-raise' : 'raise') : act}</b>
          </>
        ) : (
          'Hover or tap a hand to see what to do with it. Pairs run down the diagonal; suited hands are above it, offsuit below.'
        )}
      </p>
      <p className="small muted" style={{ marginBottom: 0 }}>
        These charts are approximations of standard solver-style (<G term="GTO">GTO</G>) ranges, simplified to always-or-never decisions. Use them as a strong default, not as
        exact solver output.
      </p>
    </div>
  );
}

interface DrillScore {
  played: number;
  correct: number;
  streak: number;
}

function loadScore(): DrillScore {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Storage unavailable — start fresh.
  }
  return { played: 0, correct: 0, streak: 0 };
}

function Drill() {
  const [spot, setSpot] = useState(() => ({ chart: ORDER[Math.floor(Math.random() * 5)], hand: randomHand() }));
  const [answer, setAnswer] = useState<ChartAction | null>(null);
  const [score, setScore] = useState<DrillScore>(loadScore);
  const correctAction = useMemo(() => chartAction(spot.chart, spot.hand), [spot]);
  const options: ChartAction[] = spot.chart === 'BB' ? ['raise', 'call', 'fold'] : ['raise', 'fold'];

  useEffect(() => {
    try {
      localStorage.setItem(SCORE_KEY, JSON.stringify(score));
    } catch {
      // Non-fatal.
    }
  }, [score]);

  const choose = (a: ChartAction) => {
    if (answer) return;
    setAnswer(a);
    const right = a === correctAction;
    setScore((s) => ({ played: s.played + 1, correct: s.correct + (right ? 1 : 0), streak: right ? s.streak + 1 : 0 }));
  };
  const next = () => {
    setSpot({ chart: ORDER[Math.floor(Math.random() * ORDER.length)], hand: randomHand() });
    setAnswer(null);
  };
  const label = (a: ChartAction) => (a === 'raise' ? (spot.chart === 'BB' ? 'Re-raise' : 'Raise') : a === 'call' ? 'Call' : 'Fold');

  return (
    <section className="panel drill" data-tour="range-drill">
      <h2>
        Range drill
        <span className="small muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {score.correct}/{score.played} · streak {score.streak}
        </span>
      </h2>
      <p className="drill-q">
        {spot.chart === 'BB' ? 'The button raises. You are in the big blind with' : `Everyone folds to you in the ${CHARTS[spot.chart].title.split(' — ')[0].toLowerCase()} seat with`}{' '}
        <b className="drill-hand">{spot.hand}</b> <span className="muted">({describeHand(spot.hand)})</span>. What do you do?
      </p>
      <div className="choice-row">
        {options.map((a) => (
          <button
            key={a}
            className={`btn ${a === 'fold' ? 'fold' : a === 'call' ? 'passive' : 'aggressive'}${answer && a === correctAction ? ' suggested-outline' : ''}`}
            onClick={() => choose(a)}
            disabled={!!answer}
          >
            {label(a)}
          </button>
        ))}
      </div>
      {answer && (
        <div className="coach-card" style={{ marginTop: 12 }}>
          <p style={{ marginTop: 0 }}>
            {answer === correctAction ? '✅ Correct' : `❌ The chart says ${label(correctAction).toLowerCase()}`} — {spot.hand} from this seat is a{' '}
            <b>{label(correctAction).toLowerCase()}</b>.
          </p>
          <RangeGrid chartId={spot.chart} highlight={spot.hand} />
          <div className="row-btns">
            <button className="btn primary" onClick={next} autoFocus>
              Next hand
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
