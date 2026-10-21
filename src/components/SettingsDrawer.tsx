import { useEffect } from 'react';
import { BOT_STYLE_LABELS } from '../engine/bots';
import { CLAUDE_MODEL } from '../claude';
import type { Settings } from '../hooks/useSettings';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsDrawer({ settings, update, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Settings">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} autoFocus>
            Close
          </button>
        </div>

        <div className="setting">
          <span>Opponents</span>
          <Seg label="Opponents" value={settings.opponents} onChange={(v) => update({ opponents: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
          <small>Applies from the next hand.</small>
        </div>

        <div className="setting">
          <span>Opponent style</span>
          <select value={settings.botStyle} onChange={(e) => update({ botStyle: e.target.value as Settings['botStyle'] })}>
            <option value="mixed">Mixed table</option>
            {Object.entries(BOT_STYLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="setting">
          <span>Coach</span>
          <Seg
            label="Coach mode"
            value={settings.coachMode}
            onChange={(v) => update({ coachMode: v })}
            options={[
              { value: 'ask', label: 'Ask why' },
              { value: 'feedback', label: 'Feedback only' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <small>"Ask why" pauses after each of your actions to hear your reasoning and critique it.</small>
        </div>

        <label className="toggle">
          <input type="checkbox" checked={settings.showOdds} onChange={(e) => update({ showOdds: e.target.checked })} />
          Show live probabilities during the hand
        </label>
        <small className="muted" style={{ marginTop: -10 }}>
          Turn off to test your instincts — odds are still revealed in the hindsight review.
        </small>

        <div className="setting">
          <span>Simulation accuracy</span>
          <Seg
            label="Accuracy"
            value={settings.accuracy}
            onChange={(v) => update({ accuracy: v })}
            options={[
              { value: 'fast', label: 'Fast' },
              { value: 'standard', label: 'Standard' },
              { value: 'precise', label: 'Precise' },
            ]}
          />
        </div>

        <div className="setting">
          <span>Table speed</span>
          <Seg
            label="Speed"
            value={settings.speed}
            onChange={(v) => update({ speed: v })}
            options={[
              { value: 'slow', label: 'Slow' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
          />
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />

        <div className="setting">
          <span>Online AI coach (optional)</span>
          <label className="toggle">
            <input type="checkbox" checked={settings.claudeEnabled} onChange={(e) => update({ claudeEnabled: e.target.checked })} />
            Use Claude for hand-review chat when online
          </label>
          <input
            type="password"
            placeholder="Anthropic API key (sk-ant-…)"
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value.trim() })}
            autoComplete="off"
            aria-label="Anthropic API key"
          />
          <div className="note">
            Everything works offline with the built-in coach. With a key, open-ended questions go to <b>{CLAUDE_MODEL}</b>, grounded in the engine's numbers.
            Your key is stored only in this browser and sent only to Anthropic's API — use a personal key with a spend limit, and don't enable this on a shared computer.
          </div>
        </div>
      </aside>
    </>
  );
}
