import { type ReactNode, useLayoutEffect, useRef } from 'react';

/**
 * The table is sized to the space left under it (see .table-area), so anything
 * below it that changes height — bet buttons, "Waiting for…", the result bar —
 * would make the table zoom in and out. This holds that space at the tallest
 * it has been, so the table keeps one size. It re-measures when the window is
 * resized, since the buttons wrap differently at another width.
 */
export function SteadyArea({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    let tallest = 0;
    const grow = () => {
      const h = content.offsetHeight;
      if (h > tallest) {
        tallest = h;
        box.style.minHeight = `${h}px`;
      }
    };
    grow();
    const ro = new ResizeObserver(grow);
    ro.observe(content);
    let width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      tallest = 0;
      grow();
    };
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className="steady-area" ref={outer}>
      <div className="steady-inner" ref={inner}>
        {children}
      </div>
    </div>
  );
}
