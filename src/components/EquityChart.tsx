import { useState } from 'react';
import { pct } from '../engine/analysis';
import { STREETS, STREET_LABELS, type Street } from '../engine/game';

interface Point {
  street: Street;
  equity: number;
}

interface Props {
  points: Point[];
  /** True equity against the cards opponents actually held (after the hand). */
  hindsight?: Point[];
}

const W = 340;
const H = 150;
const PAD = { l: 34, r: 16, t: 14, b: 24 };
const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (STREETS.length - 1);
const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);

function path(points: Point[]) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${x(STREETS.indexOf(p.street))},${y(p.equity)}`).join(' ');
}

/** How your chance of winning moved street by street. */
export function EquityChart({ points, hindsight }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const showHs = !!hindsight && hindsight.length > 0;
  const last = points[points.length - 1];
  const at = (list: Point[] | undefined, i: number) => list?.find((p) => p.street === STREETS[i]);

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Equity by street">
        <g className="grid">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <line key={v} x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
          ))}
        </g>
        <g className="axis">
          {[0, 0.5, 1].map((v) => (
            <text key={v} x={PAD.l - 6} y={y(v) + 4} textAnchor="end">
              {v * 100}%
            </text>
          ))}
          {STREETS.map((s, i) => (
            <text key={s} x={x(i)} y={H - 6} textAnchor="middle">
              {STREET_LABELS[s]}
            </text>
          ))}
        </g>
        {showHs && (
          <>
            <path className="series-hindsight" d={path(hindsight!)} fill="none" strokeWidth={2} strokeLinejoin="round" />
            {hindsight!.map((p) => (
              <circle key={`h-${p.street}`} className="dot-hindsight" cx={x(STREETS.indexOf(p.street))} cy={y(p.equity)} r={4.5} />
            ))}
          </>
        )}
        {points.length > 0 && (
          <>
            <path className="series-now" d={path(points)} fill="none" strokeWidth={2} strokeLinejoin="round" />
            {points.map((p) => (
              <circle key={p.street} className="dot-now" cx={x(STREETS.indexOf(p.street))} cy={y(p.equity)} r={4.5} />
            ))}
            <text className="label" x={x(STREETS.indexOf(last.street)) + (last.street === 'river' ? -8 : 8)} y={y(last.equity) - 8} textAnchor={last.street === 'river' ? 'end' : 'start'}>
              {pct(last.equity)}
            </text>
          </>
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.25)" />}
        {STREETS.map((s, i) => (
          <rect
            key={`hit-${s}`}
            x={x(i) - (W - PAD.l - PAD.r) / 6}
            y={0}
            width={(W - PAD.l - PAD.r) / 3}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && (at(points, hover) || at(hindsight, hover)) && (
        <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(PAD.t / H) * 100}%` }}>
          <b>{STREET_LABELS[STREETS[hover]]}</b>
          {at(points, hover) && <div>What you knew: {pct(at(points, hover)!.equity)}</div>}
          {at(hindsight, hover) && <div>With hindsight: {pct(at(hindsight, hover)!.equity)}</div>}
        </div>
      )}
      {showHs && (
        <div className="legend">
          <span>
            <i /> vs random hands (what you knew)
          </span>
          <span>
            <i className="hs" /> vs their real cards (hindsight)
          </span>
        </div>
      )}
    </div>
  );
}
