/**
 * Cards are plain integers 0..51 so the evaluator and simulations stay fast.
 *   rank = card >> 2   (0 = deuce … 12 = ace)
 *   suit = card & 3    (0 = ♠, 1 = ♥, 2 = ♦, 3 = ♣)
 */
export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'shdc';
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
export const RANK_PLURALS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

export const FULL_DECK: readonly Card[] = Array.from({ length: 52 }, (_, i) => i);

/** "As", "Td", "9c" … */
export function cardToString(c: Card): string {
  return RANK_CHARS[rankOf(c)] + SUIT_CHARS[suitOf(c)];
}

/** "A♠", "10♦" — for prose and chat. */
export function cardLabel(c: Card): string {
  const r = RANK_CHARS[rankOf(c)];
  return (r === 'T' ? '10' : r) + SUIT_SYMBOLS[suitOf(c)];
}

export function cardsLabel(cards: readonly Card[]): string {
  return cards.map(cardLabel).join(' ');
}

export function parseCard(text: string): Card {
  const t = text.trim();
  const rankText = t.length === 3 && t.startsWith('10') ? 'T' : t[0]?.toUpperCase();
  const suitText = t[t.length - 1]?.toLowerCase();
  const rank = RANK_CHARS.indexOf(rankText ?? '');
  const suit = SUIT_CHARS.indexOf(suitText ?? '');
  if (rank < 0 || suit < 0) throw new Error(`Invalid card: "${text}"`);
  return makeCard(rank, suit);
}

/** Parse "As Kd 7h" or "AsKd7h". */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/[\s,]+/g, '');
  const out: Card[] = [];
  for (let i = 0; i < compact.length; ) {
    const len = compact.startsWith('10', i) ? 3 : 2;
    out.push(parseCard(compact.slice(i, i + len)));
    i += len;
  }
  return out;
}

export function isRed(c: Card): boolean {
  const s = suitOf(c);
  return s === 1 || s === 2;
}

/** Fisher–Yates using an injectable RNG so tests can be deterministic. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

export function remainingDeck(exclude: readonly Card[]): Card[] {
  const used = new Set(exclude);
  return FULL_DECK.filter((c) => !used.has(c));
}

/** Small seeded PRNG (mulberry32) for reproducible deals and tests. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
