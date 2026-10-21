import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TOURS, type TourId } from '../content/tours';
import { TermText } from './Term';

/**
 * Tutorial mode: spotlight tours that explain each part of the app the first
 * time it appears. Components call `useAutoTour(id, ready)`; the provider runs
 * one tour at a time and remembers which tours have been seen.
 */

const SEEN_KEY = 'hindsight-holdem.tours-seen.v1';

interface TourApi {
  enabled: boolean;
  /** Start a tour if tutorial mode is on and it hasn't been seen. */
  request: (id: TourId) => void;
  /** Replay the most recently requested tour, even if seen. */
  replay: () => void;
}

const TourContext = createContext<TourApi>({ enabled: false, request: () => {}, replay: () => {} });

function loadSeen(): Set<TourId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function storeSeen(seen: Set<TourId>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Non-fatal: tours may repeat next visit.
  }
}

export function TourProvider({ enabled, onTurnOff, children }: { enabled: boolean; onTurnOff: () => void; children: ReactNode }) {
  const seen = useRef<Set<TourId>>(loadSeen());
  const queue = useRef<TourId[]>([]);
  const last = useRef<TourId | null>(null);
  const [active, setActiveState] = useState<{ id: TourId; step: number } | null>(null);
  // Mirror of `active` so callbacks can read it without side effects inside state updaters.
  const activeRef = useRef(active);
  const setActive = useCallback((next: { id: TourId; step: number } | null) => {
    activeRef.current = next;
    setActiveState(next);
  }, []);
  const wasEnabled = useRef(enabled);

  // Turning tutorial mode back on replays every tour; turning it off stops the current one.
  useEffect(() => {
    if (enabled && !wasEnabled.current) {
      seen.current = new Set();
      storeSeen(seen.current);
    }
    if (!enabled) {
      queue.current = [];
      setActive(null);
    }
    wasEnabled.current = enabled;
  }, [enabled, setActive]);

  const request = useCallback(
    (id: TourId) => {
      last.current = id;
      if (!enabled || seen.current.has(id)) return;
      const cur = activeRef.current;
      if (!cur) setActive({ id, step: 0 });
      else if (cur.id !== id && !queue.current.includes(id)) queue.current.push(id);
    },
    [enabled, setActive],
  );

  const replay = useCallback(() => {
    if (last.current) setActive({ id: last.current, step: 0 });
  }, [setActive]);

  const finish = useCallback(() => {
    const cur = activeRef.current;
    if (cur) {
      seen.current.add(cur.id);
      storeSeen(seen.current);
    }
    let next = queue.current.shift();
    while (next && seen.current.has(next)) next = queue.current.shift();
    setActive(next ? { id: next, step: 0 } : null);
  }, [setActive]);

  return (
    <TourContext.Provider value={{ enabled, request, replay }}>
      {children}
      {active && (
        <TourOverlay
          key={`${active.id}-${active.step}`}
          id={active.id}
          step={active.step}
          onStep={(step) => setActive({ id: active.id, step })}
          onFinish={finish}
          onTurnOff={() => {
            finish();
            onTurnOff();
          }}
        />
      )}
    </TourContext.Provider>
  );
}

export const useTour = () => useContext(TourContext);

/** Requests a tour once `ready` becomes true (e.g. the panel it explains is on screen). */
export function useAutoTour(id: TourId, ready: boolean) {
  const { request, enabled } = useTour();
  useEffect(() => {
    if (ready && enabled) {
      // Wait a beat so the elements being explained have rendered and animated in.
      const t = setTimeout(() => request(id), 450);
      return () => clearTimeout(t);
    }
  }, [id, ready, enabled, request]);
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function TourOverlay({
  id,
  step,
  onStep,
  onFinish,
  onTurnOff,
}: {
  id: TourId;
  step: number;
  onStep: (n: number) => void;
  onFinish: () => void;
  onTurnOff: () => void;
}) {
  const steps = TOURS[id];
  const current = steps[step];
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Extra room at the bottom (phones) so targets near the end of the page can scroll above the card.
  useLayoutEffect(() => {
    document.body.classList.add('tour-open');
    return () => document.body.classList.remove('tour-open');
  }, []);

  useLayoutEffect(() => {
    const el = findTarget(current.target);
    if (!el) {
      setRect(null);
      return;
    }
    // On phones the card is a bottom sheet, so bring the target to the top of the screen.
    el.scrollIntoView({ block: window.innerWidth <= 560 ? 'start' : 'center', behavior: 'auto' });
    if (window.innerWidth <= 560) window.scrollBy(0, -12);
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const t = setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [current.target]);

  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish();
      else if (e.key === 'ArrowRight') step < steps.length - 1 ? onStep(step + 1) : onFinish();
      else if (e.key === 'ArrowLeft' && step > 0) onStep(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, steps.length, onStep, onFinish]);

  // Place the card below the target if there's room, otherwise above; centred when there's no target.
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(360, vw - 24);
  let cardStyle: React.CSSProperties;
  if (rect && vw > 560) {
    const below = rect.top + rect.height + pad + 12;
    const roomBelow = vh - below;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - cardW / 2, 12), vw - cardW - 12);
    cardStyle = roomBelow > 220 ? { top: below, left, width: cardW } : { bottom: Math.max(12, vh - rect.top + pad + 12), left, width: cardW };
  } else if (rect) {
    cardStyle = { left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' };
  } else {
    cardStyle = { top: '50%', left: '50%', width: cardW, transform: 'translate(-50%, -50%)' };
  }

  const last = step === steps.length - 1;
  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={`Tutorial: ${current.title}`}>
      {/* Blocks clicks on the app while the tour is open. */}
      <div className={`tour-blocker${rect ? '' : ' dim'}`} />
      {rect && (
        <div
          className="tour-spotlight"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      <div className="tour-card" style={cardStyle} ref={cardRef} tabIndex={-1}>
        <div className="tour-progress">
          Tutorial · {step + 1} of {steps.length}
        </div>
        <h3>{current.title}</h3>
        <p>
          <TermText text={current.body} />
        </p>
        <div className="tour-actions">
          <button className="btn ghost" onClick={() => onStep(step - 1)} disabled={step === 0}>
            Back
          </button>
          <button className="btn primary" onClick={() => (last ? onFinish() : onStep(step + 1))} autoFocus>
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
        <div className="tour-links">
          {!last && (
            <button className="link-btn" onClick={onFinish}>
              Skip this tour
            </button>
          )}
          <button className="link-btn" onClick={onTurnOff}>
            Turn off tutorial mode
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
