import { type ReactNode, useEffect, useRef } from 'react';
import { TOUR_REVEAL_EVENT } from './Tour';

export interface SideTab {
  id: string;
  label: string;
  /** Something new the player hasn't looked at yet. */
  dot?: boolean;
  content: ReactNode;
}

interface Props {
  tabs: SideTab[];
  active: string;
  onSelect: (id: string) => void;
  /** Always-visible headline numbers above the tabs. */
  header?: ReactNode;
}

/**
 * The side column as one card: a headline strip, then one tab at a time,
 * scrolling inside itself so the page never grows taller than the screen.
 * Closed tabs stay mounted (hidden), so their state survives and tutorial
 * steps can find — and open — the tab that holds their target.
 */
export function SideTabs({ tabs, active, onSelect, header }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;

  useEffect(() => {
    const reveal = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      const el = root.current?.querySelector<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`);
      const pane = el?.closest<HTMLElement>('[data-side-tab]');
      if (pane && pane.dataset.sideTab !== current) onSelect(pane.dataset.sideTab!);
    };
    document.addEventListener(TOUR_REVEAL_EVENT, reveal);
    return () => document.removeEventListener(TOUR_REVEAL_EVENT, reveal);
  }, [current, onSelect]);

  if (tabs.length === 0) return null;
  return (
    <div className="side-tabs panel" ref={root}>
      {header}
      <div className="side-tablist" role="tablist" aria-label="Details">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`side-tab-${t.id}`}
            aria-selected={t.id === current}
            aria-controls={`side-pane-${t.id}`}
            className="side-tab"
            onClick={() => onSelect(t.id)}
          >
            {t.label}
            {t.dot && t.id !== current && <span className="side-dot" aria-label="(new)" />}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`side-pane-${t.id}`}
          role="tabpanel"
          aria-labelledby={`side-tab-${t.id}`}
          className="side-pane"
          data-side-tab={t.id}
          hidden={t.id !== current}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
