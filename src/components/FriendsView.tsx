import { useState } from 'react';
import { explainComparison } from '../engine/explain';
import type { GameState, PlayerAction } from '../engine/game';
import { CODE_LENGTH, type RoomView } from '../friends/protocol';
import { useAuth } from '../hooks/useAuth';
import { useFriends } from '../hooks/useFriends';
import { useOnline } from '../hooks/useOnline';
import { ActionBar } from './ActionBar';
import { AuthPanel } from './AuthPanel';
import { PokerTable } from './PokerTable';
import { TermText } from './Term';
import { useAutoTour } from './Tour';

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());
const fmtWins = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Play the same Texas Hold'em hand with friends: one person creates a table
 * and shares the code. Online only, and needs an account so results are saved.
 */
export function FriendsView({ active }: { active: boolean }) {
  const online = useOnline();
  const { user, token, status, expire } = useAuth();
  const f = useFriends(active && online, user ? token : null, expire);
  useAutoTour('friends', active && online && !!user && !f.room);

  if (!online) {
    return (
      <div className="panel welcome">
        <h1>Play with friends</h1>
        <p>This is the one part of Hindsight Hold'em that needs the internet. You're offline right now — all the training tabs still work.</p>
      </div>
    );
  }
  if (status === 'checking') return <p className="muted">Checking your login…</p>;
  if (status === 'unreachable') {
    return (
      <div className="panel welcome">
        <h1>Play with friends</h1>
        <p>
          Can't reach the Hindsight Hold'em server. If you're running the app yourself, start it with <code>npm run server</code>.
        </p>
      </div>
    );
  }
  if (!user) return <AuthPanel reason="Log in or create a free account to play with friends. Your chips, wins and buy-ins are saved to your profile." />;

  const statusBar = (
    <div className="friends-status" role="status">
      <span className={`status-pill ${f.connection === 'connected' ? '' : 'offline'}`}>
        <span className="dot" />
        {f.connection === 'connected' ? `Connected as ${user.username}` : f.connection === 'unreachable' ? "Can't reach the game server" : 'Connecting…'}
      </span>
      {f.error && (
        <span className="error-banner" role="alert">
          {f.error}
          <button className="link-btn" onClick={f.clearError}>
            Dismiss
          </button>
        </span>
      )}
    </div>
  );

  return f.room ? (
    <FriendsTable active={active} room={f.room} status={statusBar} onDeal={f.deal} onAct={f.act} onRebuy={f.rebuy} onLeave={f.leave} />
  ) : (
    <>
      {statusBar}
      <Lobby username={user.username} disabled={f.connection !== 'connected'} onCreate={f.create} onJoin={f.join} />
    </>
  );
}

/** Keeps only code characters, so pasted codes like "dayhfk", "DAY-HFK" or " DAY HFK " work. */
const normaliseCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

function Lobby({ username, disabled, onCreate, onJoin }: { username: string; disabled: boolean; onCreate: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  const codeOk = code.length === CODE_LENGTH;
  const joinHint = disabled ? 'Waiting for the game server…' : !codeOk ? `The code has 6 letters and numbers (${code.length}/6 so far).` : '';
  return (
    <div className="friends-lobby">
      <section className="panel" data-tour="friends-lobby">
        <h2>Play with friends</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Playing as <b style={{ color: 'var(--ink)' }}>{username}</b>. Everyone buys in for 1,000 chips and plays the same hands — chips carry over from hand to
          hand, and your results are saved to your profile.
        </p>
        <div className="friends-choices">
          <div className="calc">
            <h3>Start a table</h3>
            <p className="small muted">You'll be the host: you get a code to send to friends, and you deal the first hand.</p>
            <button className="btn primary" disabled={disabled} onClick={onCreate}>
              Create table
            </button>
          </div>
          <div className="calc">
            <h3>Join a table</h3>
            <label className="field">
              Code from your friend
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(normaliseCode(e.target.value))}
                placeholder="ABC123"
                className="code-input"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button className="btn primary" style={{ marginTop: 8 }} disabled={disabled || !codeOk} onClick={() => onJoin(code)}>
              Join table
            </button>
            {joinHint && <p className="small hint">{joinHint}</p>}
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Testing on your own? Each player needs their own account, and tabs in the same browser share one login — use a private window or another browser for
          the second player.
        </p>
      </section>
    </div>
  );
}

function resultText(game: GameState): string[] {
  if (!game.finished) return [];
  const lines: string[] = [];
  if (!game.showdown) {
    const w = game.winners[0];
    lines.push(`${game.players[w.playerId].name} wins ${w.amount} — everyone else folded.`);
    return lines;
  }
  const best = Math.max(...Object.values(game.results).map((r) => r.score));
  const top = game.players.filter((p) => game.results[p.id]?.score === best);
  lines.push(`${top.map((p) => p.name).join(' and ')} ${top.length > 1 ? 'split' : 'wins'} with ${game.results[top[0].id].name}.`);
  const runnerUp = game.players
    .filter((p) => !p.folded && game.results[p.id] && game.results[p.id].score < best)
    .sort((a, b) => game.results[b.id].score - game.results[a.id].score)[0];
  if (runnerUp) lines.push(explainComparison({ label: top[0].name, hand: game.results[top[0].id] }, { label: runnerUp.name, hand: game.results[runnerUp.id] }));
  for (const w of game.winners) lines.push(`${game.players[w.playerId].name} collects ${w.amount}.`);
  return lines;
}

function FriendsTable({
  active,
  room,
  status,
  onDeal,
  onAct,
  onRebuy,
  onLeave,
}: {
  active: boolean;
  room: RoomView;
  status: React.ReactNode;
  onDeal: () => void;
  onAct: (hand: number, action: PlayerAction) => void;
  onRebuy: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const game = room.game as GameState | null;
  const me = room.members.find((m) => m.id === room.youId);
  const isHost = room.youId === room.hostId;
  const mySeat = room.seats.indexOf(room.youId);
  const handRunning = !!game && !game.finished;
  const myTurn = handRunning && game!.toAct === mySeat;
  const ready = room.members.filter((m) => !m.left && m.connected && m.chips > 0).length;
  const busted = !!me && me.chips === 0 && !(handRunning && mySeat >= 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the code is on screen to copy by hand.
    }
  };

  let actionArea: React.ReactNode;
  if (myTurn) actionArea = <ActionBar game={game!} onAction={(a) => onAct(game!.handNumber, a)} shortcuts={active} />;
  else if (handRunning)
    actionArea = (
      <div className="waiting">
        {mySeat < 0 ? "You'll be dealt in from the next hand. " : ''}
        Waiting for {game!.players[game!.toAct]?.name}
        {room.turnSeconds !== null ? ` · ${room.turnSeconds}s` : ''}…
      </div>
    );
  else if (busted)
    actionArea = (
      <div className="bust-bar" role="alert">
        <span>
          <b>You're out of chips.</b> Buy back in for {room.buyIn.toLocaleString()} (it counts against your net result), or leave the table.
        </span>
        <div className="row-btns" style={{ marginTop: 0 }}>
          <button className="btn primary" onClick={onRebuy}>
            Buy back in
          </button>
          <button className="btn ghost" onClick={onLeave}>
            Leave table
          </button>
        </div>
      </div>
    );
  else if (room.handsDealt === 0 && !isHost) actionArea = <div className="waiting">Waiting for {room.hostName} (the host) to deal the first hand…</div>;
  else
    actionArea = (
      <button className="btn primary deal-btn" onClick={onDeal} disabled={ready < 2} data-tour="friends-deal">
        {ready < 2 ? 'Waiting for another player with chips…' : room.handsDealt === 0 ? 'Deal the first hand' : 'Deal next hand'}
      </button>
    );

  return (
    <div className="play-layout fit">
      <div className="play-main">
        {status}
        <div className="table-area">
          {game ? (
            <PokerTable game={game} showStyles={false} />
          ) : (
            <div className="panel welcome">
              <h1>Waiting for players</h1>
              <p>
                Send your friends the code <b className="code-big">{room.code}</b>.{' '}
                {isHost ? 'When at least one friend has joined, deal the first hand.' : `${room.hostName} will deal the first hand.`}
              </p>
            </div>
          )}
        </div>
        <div className="action-area">{actionArea}</div>
      </div>

      <div className="side">
        {game?.finished && (
          <section className="panel summary">
            <h2>Last hand</h2>
            {resultText(game).map((l) => (
              <p key={l} className="small" style={{ margin: '0 0 6px' }}>
                <TermText text={l} />
              </p>
            ))}
          </section>
        )}
        <section className="panel" data-tour="friends-score">
          <h2>
            Scoreboard <span className="small muted">buy-in {room.buyIn.toLocaleString()}</span>
          </h2>
          <div className="table-scroll">
            <table className="history scoreboard">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">Chips</th>
                  <th className="num">Net</th>
                  <th className="num">Won</th>
                  <th className="num">Buy-ins</th>
                </tr>
              </thead>
              <tbody>
                {[...room.members]
                  .sort((a, b) => Number(a.left) - Number(b.left) || b.net - a.net)
                  .map((m) => (
                    <tr key={m.id} className={m.left ? 'left' : ''}>
                      <td>
                        <span className={`dot ${m.connected ? 'on' : ''}`} title={m.connected ? 'Connected' : 'Not connected'} /> {m.name}
                        {m.id === room.youId && <span className="muted"> (you)</span>}
                        {m.id === room.hostId && <span className="muted"> · host</span>}
                        {m.left && <span className="muted"> · left</span>}
                      </td>
                      <td className="num">{m.chips.toLocaleString()}</td>
                      <td className={`num ${m.net > 0 ? 'pos' : m.net < 0 ? 'neg' : ''}`}>
                        <b>{signed(m.net)}</b>
                      </td>
                      <td className="num">
                        {fmtWins(m.handsWon)}/{m.handsPlayed}
                      </td>
                      <td className="num">{m.buyIns}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Net = chips now − everything bought in, so going all-in and rebuying shows up as a loss.
          </p>
        </section>
        {room.events.length > 0 && (
          <section className="panel">
            <h2>Table log</h2>
            <ul className="event-log">
              {room.events
                .slice(-6)
                .reverse()
                .map((e) => (
                  <li key={`${e.at}-${e.text}`} className="small">
                    {e.text}
                  </li>
                ))}
            </ul>
          </section>
        )}
        <section className="panel" data-tour="friends-code">
          <h2>Table code</h2>
          <div className="code-row">
            <span className="code-big">{room.code}</span>
            <button className="chip-btn" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <p className="small muted">Friends log in, open the Friends tab and enter this code. Up to 6 players.</p>
          <button className="btn ghost" onClick={onLeave}>
            Leave table
          </button>
        </section>
      </div>
    </div>
  );
}
