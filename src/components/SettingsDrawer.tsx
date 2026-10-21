import { useEffect, useState } from 'react';
import { BOT_STYLE_LABELS } from '../engine/bots';
import { DEFAULT_SETTINGS, type SaveResult, type Settings } from '../hooks/useSettings';

interface Props {
  settings: Settings;
  save: (next: Settings) => SaveResult;
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

type Status = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string } | { kind: 'confirm-discard' };

/**
 * Settings edit a draft; nothing changes until Save, which writes to the
 * browser and confirms the write by reading it back.
 */
export function SettingsDrawer({ settings, save, onClose }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const update = (patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus({ kind: 'idle' });
  };

  const requestClose = () => (dirty ? setStatus({ kind: 'confirm-discard' }) : onClose());
  const doSave = () => {
    const result = save(draft);
    setStatus(result.ok ? { kind: 'saved' } : { kind: 'error', message: result.message });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="drawer-backdrop" onClick={requestClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Settings">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Settings</h2>
          <button className="icon-btn" onClick={requestClose} autoFocus>
            Close
          </button>
        </div>

        <div className="setting">
          <span>Opponents</span>
          <Seg label="Opponents" value={draft.opponents} onChange={(v) => update({ opponents: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
          <small>Applies from the next hand in Play &amp; Train.</small>
        </div>

        <div className="setting">
          <span>Opponent style</span>
          <select value={draft.botStyle} onChange={(e) => update({ botStyle: e.target.value as Settings['botStyle'] })}>
            <option value="mixed">Mixed table</option>
            {Object.entries(BOT_STYLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="setting">
          <span>Coach (Play &amp; Train)</span>
          <Seg
            label="Coach mode"
            value={draft.coachMode}
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
          <input type="checkbox" checked={draft.tutorial} onChange={(e) => update({ tutorial: e.target.checked })} />
          Tutorial mode
        </label>
        <small className="muted" style={{ marginTop: -10 }}>
          Walks you through each screen, highlighting every button and panel the first time it appears. Turning it back on replays the tours.
        </small>

        <label className="toggle">
          <input type="checkbox" checked={draft.showOdds} onChange={(e) => update({ showOdds: e.target.checked })} />
          Show live probabilities during the hand
        </label>
        <small className="muted" style={{ marginTop: -10 }}>
          Turn off to test your instincts — odds are still revealed in the hindsight review.
        </small>

        <label className="toggle">
          <input type="checkbox" checked={draft.beginnerMode} onChange={(e) => update({ beginnerMode: e.target.checked })} />
          Beginner explanations
        </label>
        <small className="muted" style={{ marginTop: -10 }}>
          Adds a plain-English version of every piece of coach feedback. Poker terms always show a definition on hover or tap.
        </small>

        <div className="setting">
          <span>Simulation accuracy</span>
          <Seg
            label="Accuracy"
            value={draft.accuracy}
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
            value={draft.speed}
            onChange={(v) => update({ speed: v })}
            options={[
              { value: 'slow', label: 'Slow' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
          />
        </div>

        <div className="save-bar" data-tour="settings-save">
          <div className="save-status" role="status" aria-live="polite">
            {status.kind === 'saved' && <span className="saved">✓ Settings saved</span>}
            {status.kind === 'error' && <span className="save-error">{status.message}</span>}
            {status.kind === 'idle' && dirty && <span className="unsaved">● Unsaved changes</span>}
            {status.kind === 'idle' && !dirty && <span className="muted">All changes saved</span>}
            {status.kind === 'confirm-discard' && <span className="unsaved">You have unsaved changes.</span>}
          </div>
          {status.kind === 'confirm-discard' ? (
            <div className="row-btns" style={{ marginTop: 0 }}>
              <button className="btn primary" onClick={() => { doSave(); onClose(); }}>
                Save and close
              </button>
              <button className="btn ghost" onClick={onClose}>
                Discard
              </button>
            </div>
          ) : (
            <div className="row-btns" style={{ marginTop: 0 }}>
              <button className="btn primary" onClick={doSave} disabled={!dirty}>
                Save changes
              </button>
              <button className="btn ghost" onClick={() => update(DEFAULT_SETTINGS)} title="Back to the default settings (press Save to keep)">
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
