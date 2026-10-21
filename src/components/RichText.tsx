import { Fragment, type ReactNode } from 'react';
import { linkTerms } from './Term';

/** Renders **bold** and *italic* spans (with glossary terms linked) without using innerHTML. */
function inline(text: string, seen: Set<string>, glossary: boolean): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  const words = (t: string) => (glossary ? linkTerms(t, seen) : t);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{words(part.slice(2, -2))}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{words(part.slice(1, -1))}</em>;
    return <Fragment key={i}>{words(part)}</Fragment>;
  });
}

/**
 * Minimal markdown: one paragraph per line, "- " bullets, "1. " numbered lists,
 * bold, italic. Poker terms get hover definitions unless `glossary` is false.
 */
export function RichText({ text, glossary = true }: { text: string; glossary?: boolean }) {
  const blocks: ReactNode[] = [];
  const seen = new Set<string>();
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, seen, glossary)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = !bullet;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item[1]);
    } else {
      flushList();
      if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''), seen, glossary)}</p>);
    }
  }
  flushList();
  return <>{blocks}</>;
}
