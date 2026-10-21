import { useEffect, useState } from 'react';
import { type GameState, type PlayerAction, legalActions, potSize } from '../engine/game';

interface Props {
  game: GameState;
  onAction: (a: PlayerAction) => void;
}

export function ActionBar({ game, onAction }: Props) {
  const legal = legalActions(game);
  const pot = potSize(game);
  const aggressive = legal.canBet || legal.canRaise;
  const [to, setTo] = useState(legal.minTo);

  // Reset the slider whenever the spot changes.
  useEffect(() => setTo(legal.minTo), [legal.minTo, game.street, game.log.length]);

  const presets: { label: string; to: number }[] = [];
  if (aggressive) {
    const base = game.currentBet;
    const callAndPot = pot + legal.callAmount;
    for (const [label, f] of [['½ pot', 0.5], ['¾ pot', 0.75], ['Pot', 1]] as const) {
      const target = Math.round(base + callAndPot * f);
      if (target > legal.minTo && target < legal.maxTo) presets.push({ label, to: target });
    }
    presets.push({ label: 'All-in', to: legal.maxTo });
  }

  // Keyboard shortcuts: F fold, C check/call, B/R bet or raise.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 'f') onAction({ type: 'fold' });
      else if (k === 'c') onAction({ type: legal.canCheck ? 'check' : 'call' });
      else if ((k === 'b' || k === 'r') && aggressive) onAction({ type: legal.canBet ? 'bet' : 'raise', to });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAction, legal.canCheck, legal.canBet, aggressive, to]);

  const allIn = to >= legal.maxTo;
  return (
    <div className="action-bar">
      {aggressive && (
        <div className="sizing">
          {presets.map((p) => (
            <button key={p.label} className="chip-btn" onClick={() => setTo(p.to)}>
              {p.label}
            </button>
          ))}
          <input
            type="range"
            min={legal.minTo}
            max={legal.maxTo}
            step={game.bigBlind / 2}
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
            aria-label="Bet size"
          />
          <span className="amount">{to}</span>
        </div>
      )}
      <div className="action-row">
        <button className="btn fold" onClick={() => onAction({ type: 'fold' })} title="Shortcut: F">
          Fold
        </button>
        {legal.canCheck ? (
          <button className="btn passive" onClick={() => onAction({ type: 'check' })} title="Shortcut: C">
            Check
          </button>
        ) : (
          <button className="btn passive" onClick={() => onAction({ type: 'call' })} title="Shortcut: C">
            Call {legal.callAmount}
          </button>
        )}
        {aggressive && (
          <button
            className="btn aggressive"
            onClick={() => onAction({ type: legal.canBet ? 'bet' : 'raise', to })}
            title="Shortcut: B / R"
          >
            {allIn ? `All-in ${to}` : legal.canBet ? `Bet ${to}` : `Raise to ${to}`}
          </button>
        )}
      </div>
    </div>
  );
}
