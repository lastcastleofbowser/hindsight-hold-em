import { useEffect, useMemo, useState } from 'react';
import { type Card, FULL_DECK, RANK_CHARS, SUIT_SYMBOLS, isRed, parseCards, rankOf, suitOf } from '../engine/cards';
import { buildContext } from '../engine/coach';
import { type ActionType, STREETS, STREET_LABELS, type Street } from '../engine/game';
import { type Decision, type HandReview, type ReportedResult, resolveShowdown, reviewHand } from '../engine/review';
import { PlayingCard } from './PlayingCard';

interface StreetDraft {
  action: '' | ActionType;
  pot: number;
  toCall: number;
  amount: number;
  note: string;
}

interface Draft {
  hole: (Card | null)[];
  villain: (Card | null)[];
  board: (Card | null)[];
  opponents: number;
  stack: number;
  /** What happened at the real table, so the coach can check it. */
  reported: ReportedResult;
  streets: Record<Street, StreetDraft>;
}

const emptyStreet = (pot = 0, toCall = 0): StreetDraft => ({ action: '', pot, toCall, amount: 0, note: '' });

const EMPTY: Draft = {
  hole: [null, null],
  villain: [null, null],
  board: [null, null, null, null, null],
  opponents: 1,
  stack: 100,
  reported: 'unknown',
  streets: { preflop: emptyStreet(1.5, 1), flop: emptyStreet(), turn: emptyStreet(), river: emptyStreet() },
};

/** A teaching hand: a decent flop call, a loose turn call, and a hopeless river bluff. */
function exampleDraft(): Draft {
  const c = (s: string) => parseCards(s);
  return {
    hole: c('Jh Th'),
    villain: c('Ac Qd'),
    board: c('Qh 8c 3h 2s Kc'),
    opponents: 1,
    stack: 100,
    reported: 'lost',
    streets: {
      preflop: { action: 'call', pot: 4.5, toCall: 2, amount: 0, note: 'Suited connectors, and it was cheap to see a flop.' },
      flop: { action: 'call', pot: 10.5, toCall: 4, amount: 0, note: 'I had a flush draw and a gutshot.' },
      turn: { action: 'call', pot: 24.5, toCall: 10, amount: 0, note: "Still drawing — I didn't want to give up on my flush." },
      river: { action: 'bet', pot: 34.5, toCall: 0, amount: 30, note: 'I missed, so I bluffed to make them fold their queen.' },
    },
  };
}

/** Who should have won? A straight vs a pair, reported as a loss, to show the showdown check. */
function showdownExample(): Draft {
  const c = (s: string) => parseCards(s);
  return {
    hole: c('Ah Kd'),
    villain: c('Qc 3c'),
    board: c('9d 6d Jc Ts Qs'),
    opponents: 1,
    stack: 100,
    reported: 'lost',
    streets: {
      preflop: { action: 'raise', pot: 1.5, toCall: 1, amount: 3, note: 'Ace-King is one of the best starting hands.' },
      flop: { action: 'call', pot: 10.5, toCall: 4, amount: 0, note: 'Two big cards and a backdoor straight chance.' },
      turn: { action: 'check', pot: 14.5, toCall: 0, amount: 0, note: 'I had nothing yet, so I checked.' },
      river: { action: 'call', pot: 24.5, toCall: 10, amount: 0, note: 'I made a straight with the Queen.' },
    },
  };
}

const STORAGE_KEY = 'hindsight-holdem.review-draft.v1';
const BOARD_NEEDED: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

type SlotId = `hole-${number}` | `villain-${number}` | `board-${number}`;

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    // Unavailable storage just means no saved draft.
  }
  return EMPTY;
}

interface Props {
  onAnalyse: (review: HandReview) => void;
  iterations: number;
}

export function ReviewBuilder({ onAnalyse, iterations }: Props) {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [active, setActive] = useState<SlotId | null>('hole-0');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Non-fatal.
    }
  }, [draft]);

  const used = useMemo(() => new Set([...draft.hole, ...draft.villain, ...draft.board].filter((c): c is Card => c !== null)), [draft]);
  const order: SlotId[] = ['hole-0', 'hole-1', 'board-0', 'board-1', 'board-2', 'board-3', 'board-4', 'villain-0', 'villain-1'];

  const getSlot = (id: SlotId): Card | null => {
    const [group, idx] = id.split('-') as [keyof Draft, string];
    return (draft[group] as (Card | null)[])[Number(idx)];
  };
  const setSlot = (id: SlotId, card: Card | null) => {
    const [group, idx] = id.split('-') as ['hole' | 'villain' | 'board', string];
    setDraft((d) => ({ ...d, [group]: d[group].map((c, i) => (i === Number(idx) ? card : c)) }));
  };

  const pick = (card: Card) => {
    if (!active) return;
    setSlot(active, card);
    const after = order.slice(order.indexOf(active) + 1).find((id) => getSlot(id) === null);
    setActive(after ?? null);
  };

  const updateStreet = (s: Street, patch: Partial<StreetDraft>) =>
    setDraft((d) => ({ ...d, streets: { ...d.streets, [s]: { ...d.streets[s], ...patch } } }));

  const boardCount = draft.board.findIndex((c) => c === null) === -1 ? 5 : draft.board.findIndex((c) => c === null);

  const analyse = () => {
    setError('');
    const hole = draft.hole.filter((c): c is Card => c !== null);
    if (hole.length !== 2) return setError('Pick both of your hole cards first.');
    const villainCards = draft.villain.filter((c): c is Card => c !== null);
    if (villainCards.length === 1) return setError("Add both of the opponent's cards, or clear them if you don't know.");
    const board = draft.board.slice(0, boardCount) as Card[];
    if (boardCount > 0 && boardCount < 3) return setError('The flop needs all three cards.');

    const decisions: Decision[] = [];
    for (const s of STREETS) {
      const st = draft.streets[s];
      if (!st.action) continue;
      if (boardCount < BOARD_NEEDED[s]) return setError(`Add the ${STREET_LABELS[s].toLowerCase()} card(s) to the board before recording a ${STREET_LABELS[s].toLowerCase()} action.`);
      if (st.action === 'check' && st.toCall > 0) return setError(`${STREET_LABELS[s]}: you can't check when facing a bet — did you mean call?`);
      if (st.action === 'call' && st.toCall <= 0) return setError(`${STREET_LABELS[s]}: set "To call" to the bet you faced.`);
      if ((st.action === 'bet' || st.action === 'raise') && st.amount <= 0) return setError(`${STREET_LABELS[s]}: enter how much you bet or raised to.`);
      const ctx = buildContext({
        street: s,
        hole,
        board: board.slice(0, BOARD_NEEDED[s]),
        opponents: draft.opponents,
        pot: st.pot,
        toCall: st.toCall,
        bigBlind: 1,
        heroStack: draft.stack,
        iterations,
      });
      decisions.push({
        ctx,
        action: st.action,
        amountTo: st.action === 'bet' || st.action === 'raise' ? st.amount : undefined,
        reasons: [],
        note: st.note,
        villainHoles: villainCards.length === 2 ? [villainCards] : [],
      });
    }
    if (decisions.length === 0) return setError('Record at least one action (e.g. what you did pre-flop).');
    onAnalyse(reviewHand(decisions, resolveShowdown(hole, board, villainCards.length === 2 ? [villainCards] : [], draft.reported)));
  };

  const slot = (id: SlotId) => {
    const card = getSlot(id);
    return (
      <button
        key={id}
        className={`slot-btn${active === id ? ' active' : ''}`}
        onClick={() => setActive(id)}
        aria-label={card === null ? `Empty slot ${id}` : `Change card in ${id}`}
      >
        {card === null ? <div className="slot-empty">+</div> : <PlayingCard card={card} />}
      </button>
    );
  };

  return (
    <section className="panel" aria-label="Recreate a hand">
      <h2>
        Recreate a hand
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-tour="review-examples">
          <button className="chip-btn" onClick={() => { setDraft(exampleDraft()); setActive(null); }}>
            Example: bluff
          </button>
          <button className="chip-btn" onClick={() => { setDraft(showdownExample()); setActive(null); }}>
            Example: who won?
          </button>
          <button className="chip-btn" onClick={() => { setDraft(EMPTY); setActive('hole-0'); setError(''); }}>
            Clear
          </button>
        </span>
      </h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Pick a slot, then a card. Record what you did in each betting round and why — the coach will walk through your logic and show what beat you.
      </p>

      <div className="slot-groups" data-tour="review-slots">
        <div className="slot-group">
          <span className="label">Your hand</span>
          <div className="slots">{(['hole-0', 'hole-1'] as SlotId[]).map(slot)}</div>
        </div>
        <div className="slot-group">
          <span className="label">Board (flop · turn · river)</span>
          <div className="slots">{(['board-0', 'board-1', 'board-2', 'board-3', 'board-4'] as SlotId[]).map(slot)}</div>
        </div>
        <div className="slot-group">
          <span className="label">Opponent's cards (optional)</span>
          <div className="slots">{(['villain-0', 'villain-1'] as SlotId[]).map(slot)}</div>
        </div>
      </div>

      {active && (
        <>
          <div className="picker" role="grid" aria-label="Card picker">
            {[0, 1, 2, 3].flatMap((suit) =>
              Array.from({ length: 13 }, (_, i) => 12 - i).map((rank) => {
                const c = FULL_DECK[(rank << 2) | suit];
                const isCurrent = getSlot(active) === c;
                return (
                  <button
                    key={c}
                    className={isRed(c) ? 'red' : ''}
                    disabled={used.has(c) && !isCurrent}
                    onClick={() => pick(c)}
                    aria-label={`${RANK_CHARS[rankOf(c)]} of ${['spades', 'hearts', 'diamonds', 'clubs'][suitOf(c)]}`}
                  >
                    {RANK_CHARS[rankOf(c)] === 'T' ? '10' : RANK_CHARS[rankOf(c)]}
                    <br />
                    {SUIT_SYMBOLS[suitOf(c)]}
                  </button>
                );
              }),
            )}
          </div>
          <div className="row-btns">
            <button className="btn ghost" onClick={() => setSlot(active, null)} disabled={getSlot(active) === null}>
              Clear this slot
            </button>
            <button className="btn ghost" onClick={() => setActive(null)}>
              Done picking
            </button>
          </div>
        </>
      )}

      <div className="form-grid">
        <label className="field">
          Opponents in the hand
          <select value={draft.opponents} onChange={(e) => setDraft((d) => ({ ...d, opponents: Number(e.target.value) }))}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Your stack (big blinds)
          <input type="number" min={1} step={1} value={draft.stack} onChange={(e) => setDraft((d) => ({ ...d, stack: Number(e.target.value) }))} />
        </label>
        <label className="field" data-tour="review-result-field">
          Result at the table
          <select value={draft.reported} onChange={(e) => setDraft((d) => ({ ...d, reported: e.target.value as ReportedResult }))}>
            <option value="unknown">Not sure / didn't see</option>
            <option value="won">I won</option>
            <option value="lost">I lost</option>
            <option value="split">We split the pot</option>
          </select>
        </label>
      </div>
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        All chip amounts are in big blinds. With the full board and the opponent's cards, the coach checks who <i>should</i> have won.
      </p>

      <div className="street-rows" data-tour="review-rounds">
        {STREETS.map((s) => {
          const st = draft.streets[s];
          const ready = boardCount >= BOARD_NEEDED[s];
          return (
            <div key={s} className={`street-row${ready ? '' : ' disabled'}`}>
              <div className="head">
                <span>{STREET_LABELS[s]}</span>
                {!ready && <span className="small muted">add board cards first</span>}
              </div>
              <div className="fields">
                <label>
                  Your action
                  <select value={st.action} disabled={!ready} onChange={(e) => updateStreet(s, { action: e.target.value as StreetDraft['action'] })}>
                    <option value="">— none —</option>
                    <option value="fold">Fold</option>
                    <option value="check">Check</option>
                    <option value="call">Call</option>
                    <option value="bet">Bet</option>
                    <option value="raise">Raise</option>
                  </select>
                </label>
                <label>
                  Pot before you acted
                  <input type="number" min={0} step={0.5} value={st.pot} disabled={!ready} onChange={(e) => updateStreet(s, { pot: Number(e.target.value) })} />
                </label>
                <label>
                  Bet you faced (to call)
                  <input type="number" min={0} step={0.5} value={st.toCall} disabled={!ready} onChange={(e) => updateStreet(s, { toCall: Number(e.target.value) })} />
                </label>
                <label>
                  Bet / raise to
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={st.amount}
                    disabled={!ready || (st.action !== 'bet' && st.action !== 'raise')}
                    onChange={(e) => updateStreet(s, { amount: Number(e.target.value) })}
                  />
                </label>
              </div>
              <textarea
                placeholder={`Why did you ${st.action || 'act'} here?`}
                value={st.note}
                disabled={!ready}
                onChange={(e) => updateStreet(s, { note: e.target.value })}
                aria-label={`${STREET_LABELS[s]} reasoning`}
              />
            </div>
          );
        })}
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      <div className="row-btns">
        <button className="btn primary" onClick={analyse} data-tour="review-analyse">
          Analyse with coach
        </button>
      </div>
    </section>
  );
}
