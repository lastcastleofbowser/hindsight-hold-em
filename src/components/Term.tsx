import { Fragment, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY, GLOSSARY_INDEX, type GlossaryEntry } from '../content/glossary';

/**
 * A poker term with a definition on hover, keyboard focus or tap. The
 * tooltip renders in a portal with fixed positioning so scrolling panels
 * (like the chat log) never clip it.
 */
export function Term({ entry, children }: { entry: GlossaryEntry; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const half = Math.min(150, window.innerWidth / 2 - 8);
    const left = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    const below = r.top < 140;
    setPos({ left, top: below ? r.bottom + 8 : r.top - 8, below });
  }, [open]);

  return (
    <>
      <span
        ref={ref}
        className="term"
        tabIndex={0}
        role="button"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {children}
      </span>
      {open &&
        pos &&
        createPortal(
          <div id={id} role="tooltip" className={`term-tip${pos.below ? ' below' : ''}`} style={{ left: pos.left, top: pos.top }}>
            <b>{entry.term}</b>
            <span>{entry.definition}</span>
          </div>,
          document.body,
        )}
    </>
  );
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASES = [...GLOSSARY_INDEX.keys()].sort((a, b) => b.length - a.length);
const TERM_RE = new RegExp(`(?<![\\w-])(${PHRASES.map(escape).join('|')})(?![\\w-])`, 'gi');

/**
 * Wraps glossary terms in plain text with <Term>. Only the first mention of
 * each term is linked so paragraphs don't become a sea of underlines.
 * Pass a shared `seen` set to de-duplicate across several text fragments.
 */
export function linkTerms(text: string, seen: Set<string> = new Set()): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TERM_RE)) {
    const entry = GLOSSARY_INDEX.get(m[0].toLowerCase());
    if (!entry || seen.has(entry.term)) continue;
    seen.add(entry.term);
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <Term key={`${m.index}-${entry.term}`} entry={entry}>
        {m[0]}
      </Term>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.map((n, i) => (typeof n === 'string' ? <Fragment key={`t${i}`}>{n}</Fragment> : n));
}

/** Plain text with glossary terms linked. */
export function TermText({ text }: { text: string }) {
  return <>{linkTerms(text)}</>;
}

/** Look up an entry by its display name, for explicit <Term> use. */
export function glossaryEntry(term: string): GlossaryEntry {
  const e = GLOSSARY.find((g) => g.term.toLowerCase() === term.toLowerCase());
  if (!e) throw new Error(`Unknown glossary term: ${term}`);
  return e;
}

/** <G term="Equity">equity</G> — shorthand for a known glossary term. */
export function G({ term, children }: { term: string; children?: ReactNode }) {
  const entry = glossaryEntry(term);
  return <Term entry={entry}>{children ?? entry.term}</Term>;
}
