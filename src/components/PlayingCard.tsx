import type { CSSProperties } from 'react';
import { type Card, RANK_CHARS, RANK_NAMES, SUIT_NAMES, SUIT_SYMBOLS, isRed, rankOf, suitOf } from '../engine/cards';

interface Props {
  card?: Card;
  faceDown?: boolean;
  highlight?: boolean;
  dim?: boolean;
  /** Seconds to wait before the deal animation starts. */
  dealDelay?: number;
}

const rankText = (c: Card) => (RANK_CHARS[rankOf(c)] === 'T' ? '10' : RANK_CHARS[rankOf(c)]);

export function PlayingCard({ card, faceDown, highlight, dim, dealDelay = 0 }: Props) {
  const style: CSSProperties = { animationDelay: `${dealDelay}s` };
  if (faceDown || card === undefined) {
    return <div className="card back" style={style} role="img" aria-label="Face-down card" />;
  }
  const classes = ['card', isRed(card) && 'red', highlight && 'highlight', dim && 'dim'].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style} role="img" aria-label={`${RANK_NAMES[rankOf(card)]} of ${SUIT_NAMES[suitOf(card)]}`}>
      <div className="corner" aria-hidden>
        <span>{rankText(card)}</span>
        <span className="s">{SUIT_SYMBOLS[suitOf(card)]}</span>
      </div>
      <div className="pip" aria-hidden>
        {SUIT_SYMBOLS[suitOf(card)]}
      </div>
    </div>
  );
}

/** Inline text-size card chips for prose: A♠ K♥. */
export function MiniCards({ cards }: { cards: Card[] }) {
  return (
    <span className="mini-cards">
      {cards.map((c) => (
        <span key={c} className={`mini-card${isRed(c) ? ' red' : ''}`}>
          {rankText(c)}
          {SUIT_SYMBOLS[suitOf(c)]}
        </span>
      ))}
    </span>
  );
}
