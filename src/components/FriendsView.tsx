import { useState } from 'react';
import { explainComparison } from '../engine/explain';
import type { GameState, PlayerAction } from '../engine/game';
import { CODE_LENGTH, MAX_NAME, type RoomView } from '../friends/protocol';
import { useFriends } from '../hooks/useFriends';
import { useOnline } from '../hooks/useOnline';
import { ActionBar } from './ActionBar';
import { PokerTable } from './PokerTable';
import { TermText } from './Term';
import { useAutoTour } from './Tour';

/**
 * Play the same Texas Hold'em hand with friends: one person creates a table
 * and shares the code. Online only — everything else in the app is offline.
 */
export function FriendsView({ active }: { active: boolean }) {
  const online = useOnline();
  const f = useFriends(active && online);
  useAutoTour('friends', active && online);

  if (!online) {
    return (
      <div className="panel welcome">
        <h1>Play with friends</h1>
        <p>This is the one part of Hindsight Hold'em that needs the internet. You're offline right now — all the training tabs still work.</p>
      </div>
    );
  }

  return (
    <div className="friends">
      <div className="friends-status" role="status">
        <span className={`status-pill ${f.connection === 'connected' ? '' : 'offline'}`}>
          <span className="dot" />
          {f.connection === 'connected' ? 'Connected' : f.connection === 'unreachable' ? "Can't reach the game server" : 'Connecting…'}
        </span>
        {f.connection === 'unreachable' && (
          <span className="small muted">The Friends tab needs the Hindsight Hold'em server. If you're running the app yourself, start it with <code>npm run server</code>.</span>
        )}
      </div>
      {f.error && (
        <div className="error-banner" role="alert">
          {f.error}
          <button className="link-btn" onClick={f.clearError}>
            Dismiss
          </button>
        </div>
      )}
      {f.room ? (
        <FriendsTable active={active} room={f.room} onDeal={f.deal} onAct={f.act} onLeave={f.leave} />
      ) : (
        <Lobby disabled={f.connection !== 'connected'} onCreate={f.create} onJoin={f.join} />
      )}
    </div>
  );
}

const NAME_KEY = 'hindsight-holdem.friends-name.v1';

function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Keeps only code characters, so pasted codes like "dayhfk", "DAY-HFK" or " DAY HFK " work. */
const normaliseCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

function Lobby({ disabled, onCreate, onJoin }: { disabled: boolean; onCreate: (name: string) => void; onJoin: (code: string, name: string) => void }) {
  const [name, setName] = useState(rememberedName);
  const [code, setCode] = useState('');
  const nameOk = name.trim().length > 0;
  const codeOk = code.length === CODE_LENGTH;

  const remember = () => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      // Non-fatal: the name just won't be pre-filled next time.
    }
  };

  // Say exactly what's missing instead of leaving a silently greyed-out button.
  const createHint = disabled ? 'Waiting for the game server…' : !nameOk ? 'Enter your name first.' : '';
  const joinHint = disabled
    ? 'Waiting for the game server…'
    : !nameOk && !codeOk
      ? 'Enter your name and the 6-character code.'
      : !nameOk
        ? 'Enter your name first.'
        : !codeOk
          ? `The code has 6 letters and numbers (${code.length}/6 so far).`
          : '';

  return (
    <div className="friends-lobby">
      <section className="panel" data-tour="friends-lobby">
        <h2>Play with friends</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Everyone at the table plays the same hand — same flop, turn and river — and the scoreboard keeps track of who wins the most hands.
        </p>
        <label className="field">
          Your name
          <input type="text" maxLength={MAX_NAME} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Liam" />
        </label>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Each player at a table needs a different name — to play yourself in two tabs, use e.g. "Liam" and "Liam 2".
        </p>
        <div className="friends-choices">
          <div className="calc">
            <h3>Start a table</h3>
            <p className="small muted">You'll get a code to send to your friends.</p>
            <button
              className="btn primary"
              disabled={disabled || !nameOk}
              onClick={() => {
                remember();
                onCreate(name.trim());
              }}
            >
              Create table
            </button>
            {createHint && <p className="small hint">{createHint}</p>}
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
            <button
              className="btn primary"
              style={{ marginTop: 8 }}
              disabled={disabled || !nameOk || !codeOk}
              onClick={() => {
                remember();
                onJoin(code, name.trim());
              }}
            >
              Join table
            </button>
            {joinHint && <p className="small hint">{joinHint}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function scoreLine(room: RoomView): string {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return room.members.map((m) => `${m.name} ${fmt(m.score)}`).join(' : ');
}

function resultText(game: GameState): string[] {
  if (!game.finished) return [];
  const names = game.winners.map((w) => game.players[w.playerId].name);
  const lines: string[] = [];
  if (!game.showdown) {
    lines.push(`${names[0]} wins ${game.winners[0].amount} — everyone else folded.`);
    return lines;
  }
  const best = game.winners[0];
  lines.push(`${names.join(' and ')} ${names.length > 1 ? 'split the pot' : 'wins'} with ${best.hand?.name ?? 'the best hand'}.`);
  const runnerUp = game.players
    .filter((p) => !p.folded && !game.winners.some((w) => w.playerId === p.id) && game.results[p.id])
    .sort((a, b) => game.results[b.id].score - game.results[a.id].score)[0];
  if (runnerUp && best.hand) {
    lines.push(explainComparison({ label: game.players[best.playerId].name, hand: best.hand }, { label: runnerUp.name, hand: game.results[runnerUp.id] }));
  }
  return lines;
}

function FriendsTable({
  active,
  room,
  onDeal,
  onAct,
  onLeave,
}: {
  room: RoomView;
  onDeal: () => void;
  onAct: (hand: number, action: PlayerAction) => void;
  onLeave: () => void;
  active: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const game = room.game as GameState | null;
  const mySeat = room.seats.indexOf(room.youId);
  const myTurn = !!game && !game.finished && game.toAct === mySeat;
  const handRunning = !!game && !game.finished;
  const connected = room.members.filter((m) => m.connected).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the code is on screen to copy by hand.
    }
  };

  return (
    <div className="play-layout">
      <div>
        {game ? (
          <PokerTable game={game} showStyles={false} />
        ) : (
          <div className="panel welcome">
            <h1>Waiting for players</h1>
            <p>
              Send your friends the code <b className="code-big">{room.code}</b>. When at least two of you are here, anyone can deal the first hand.
            </p>
          </div>
        )}
        {myTurn ? (
          <ActionBar game={game!} onAction={(a) => onAct(game!.handNumber, a)} shortcuts={active} />
        ) : (
          <div className="action-bar">
            {handRunning ? (
              <div className="waiting">
                {mySeat < 0 ? "You'll join from the next hand. " : ''}
                Waiting for {game!.players[game!.toAct]?.name}
                {room.turnSeconds !== null ? ` · ${room.turnSeconds}s` : ''}…
              </div>
            ) : (
              <button className="btn primary" onClick={onDeal} disabled={connected < 2} data-tour="friends-deal">
                {connected < 2 ? 'Waiting for a friend to join…' : game ? 'Deal next hand' : 'Deal the first hand'}
              </button>
            )}
          </div>
        )}
        {game?.finished && (
          <section className="panel summary">
            {resultText(game).map((l) => (
              <p key={l} style={{ margin: '0 0 6px' }}>
                <TermText text={l} />
              </p>
            ))}
            <p className="small muted" style={{ marginBottom: 0 }}>
              Everyone's cards are shown after the hand so you can all see who had what.
            </p>
          </section>
        )}
      </div>
      <div className="side">
        <section className="panel" data-tour="friends-code">
          <h2>Table code</h2>
          <div className="code-row">
            <span className="code-big">{room.code}</span>
            <button className="chip-btn" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Friends open the Friends tab, enter their name and this code. Up to 6 players.
          </p>
        </section>
        <section className="panel" data-tour="friends-score">
          <h2>Scoreboard</h2>
          <div className="score-line">{scoreLine(room)}</div>
          <ul className="members">
            {[...room.members]
              .sort((a, b) => b.score - a.score)
              .map((m) => (
                <li key={m.id}>
                  <span className={`dot ${m.connected ? 'on' : ''}`} title={m.connected ? 'Connected' : 'Disconnected'} />
                  {m.name}
                  {m.id === room.youId && <span className="muted"> (you)</span>}
                  {m.id === room.hostId && <span className="muted"> · host</span>}
                  <b className="member-score">{Number.isInteger(m.score) ? m.score : m.score.toFixed(1)}</b>
                </li>
              ))}
          </ul>
          <p className="small muted">One point per hand won; a split pot gives each winner half a point.</p>
          <button className="btn ghost" onClick={onLeave}>
            Leave table
          </button>
        </section>
      </div>
    </div>
  );
}
