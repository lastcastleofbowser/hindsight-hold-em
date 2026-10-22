import { useEffect, useState } from 'react';
import type { Profile } from '../friends/protocol';
import { ApiError, api, useAuth } from '../hooks/useAuth';
import { useOnline } from '../hooks/useOnline';
import { AuthPanel } from './AuthPanel';

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());
const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Your account: lifetime results with friends, progress over time, and recent games. */
export function ProfileView({ active }: { active: boolean }) {
  const online = useOnline();
  const { user, token, status, expire } = useAuth();
  const [resetFlow] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('reset') || params.has('verify');
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active || !token || !user) return;
    let cancelled = false;
    setError('');
    api<Profile>('/profile', { token })
      .then((p) => !cancelled && setProfile(p))
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.status === 401) expire();
        else setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [active, token, user, expire]);

  if (resetFlow) return <AuthPanel reason="Use the one-time link from your email to set a new password." />;
  if (!online || status === 'unreachable') {
    return (
      <div className="panel welcome">
        <h1>Profile</h1>
        <p>Your account and saved games live on the Hindsight Hold'em server, so this tab needs a connection. All the training tabs still work offline.</p>
      </div>
    );
  }
  if (status === 'checking') return <p className="muted">Checking your login…</p>;
  if (!user) return <AuthPanel reason="Create a free account to save your results with friends and track your progress over time." />;

  return (
    <div className="profile">
      <div className="profile-head">
        <div>
          <h1>{user.username}</h1>
          {profile && <p className="muted small">Member since {date(profile.memberSince)}</p>}
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!profile ? (
        !error && <p className="muted">Loading your results…</p>
      ) : profile.totals.games === 0 ? (
        <section className="panel">
          <h2>No games yet</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Play a game in the Friends tab — every hand, buy-in and result is saved here automatically.
          </p>
        </section>
      ) : (
        <>
          <div className="stat-tiles">
            <Tile label="Net chips" value={signed(profile.totals.net)} tone={profile.totals.net >= 0 ? 'pos' : 'neg'} />
            <Tile label="Games" value={String(profile.totals.games)} />
            <Tile label="Hands won" value={`${Math.round(profile.totals.handsWon * 10) / 10} / ${profile.totals.handsPlayed}`} sub={`${Math.round((profile.totals.handsWon / Math.max(1, profile.totals.handsPlayed)) * 100)}% of hands`} />
            <Tile label="Buy-ins" value={String(profile.totals.buyIns)} sub="including first buy-ins" />
            <Tile label="Best game" value={signed(profile.totals.bestGame ?? 0)} tone="pos" />
            <Tile label="Worst game" value={signed(profile.totals.worstGame ?? 0)} tone="neg" />
          </div>
          <section className="panel">
            <h2>Progress — total net chips after each game</h2>
            <ProgressChart points={profile.progression} />
          </section>
          <section className="panel">
            <h2>Recent games</h2>
            <div className="table-scroll">
              <table className="history">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Table</th>
                    <th>Players</th>
                    <th className="num">Hands won</th>
                    <th className="num">Buy-ins</th>
                    <th className="num">Your result</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.games.map((g) => (
                    <tr key={g.id}>
                      <td>{date(g.startedAt)}</td>
                      <td>
                        <code>{g.code}</code>
                        {g.endedAt === null && <span className="small muted"> · live</span>}
                      </td>
                      <td className="small">
                        {g.players.map((p) => (
                          <span key={p.username} className="player-result">
                            {p.username} <span className={p.net >= 0 ? 'pos' : 'neg'}>{signed(p.net)}</span>
                          </span>
                        ))}
                      </td>
                      <td className="num">
                        {Math.round(g.handsWon * 10) / 10} / {g.handsPlayed}
                      </td>
                      <td className="num">{g.buyIns}</td>
                      <td className={`num ${g.net >= 0 ? 'pos' : 'neg'}`}>
                        <b>{signed(g.net)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

const W = 640;
const H = 200;
const PAD = { l: 52, r: 16, t: 14, b: 26 };

/** Cumulative net chips across games: one line, a zero baseline, hover for details. */
function ProgressChart({ points }: { points: Profile['progression'] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;
  const values = points.map((p) => p.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v: number) => PAD.t + ((max - v) / span) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.cumulative)}`).join(' ');
  const last = points[points.length - 1];
  const hp = hover !== null ? points[hover] : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative net chips by game">
        <g className="axis">
          <text x={PAD.l - 8} y={y(max) + 4} textAnchor="end">
            {signed(max)}
          </text>
          {min < 0 && (
            <text x={PAD.l - 8} y={y(min) + 4} textAnchor="end">
              {signed(min)}
            </text>
          )}
          <text x={PAD.l} y={H - 6}>
            Game 1
          </text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end">
            Game {points.length}
          </text>
        </g>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
        <path d={path} className="series-now" fill="none" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.gameId} className="dot-now" cx={x(i)} cy={y(p.cumulative)} r={4} />
        ))}
        <text className="label" x={x(points.length - 1) - 6} y={y(last.cumulative) - 10} textAnchor="end">
          {signed(last.cumulative)}
        </text>
        {points.map((p, i) => (
          <rect
            key={`hit-${p.gameId}`}
            x={x(i) - (W - PAD.l - PAD.r) / Math.max(2, points.length * 2)}
            y={0}
            width={(W - PAD.l - PAD.r) / Math.max(1, points.length)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hp && hover !== null && (
        <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hp.cumulative) / H) * 100}%` }}>
          <b>
            Game {hover + 1} · {date(hp.at)}
          </b>
          <div>This game: {signed(hp.net)}</div>
          <div>Running total: {signed(hp.cumulative)}</div>
        </div>
      )}
    </div>
  );
}
