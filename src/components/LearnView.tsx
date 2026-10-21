import { useMemo, useState } from 'react';
import { GLOSSARY, type GlossaryGroup } from '../content/glossary';
import { pct } from '../engine/analysis';
import { parseCards } from '../engine/cards';
import { CATEGORY_NAMES, Category } from '../engine/evaluator';
import { CATEGORY_EXAMPLES, CATEGORY_HELP } from '../engine/explain';
import { PlayingCard } from './PlayingCard';
import { G } from './Term';

const RANKED = (Object.values(Category).filter((v) => typeof v === 'number') as Category[]).sort((a, b) => b - a);
const GROUPS: GlossaryGroup[] = ['The game', 'Actions', 'Hands', 'Odds & maths', 'Strategy'];

/** Exact chance of hitting at least one of `outs` with `cardsToCome` cards from `unseen`. */
function hitChance(outs: number, cardsToCome: 1 | 2, unseen: number): number {
  if (cardsToCome === 1) return outs / unseen;
  return 1 - ((unseen - outs) * (unseen - outs - 1)) / (unseen * (unseen - 1));
}

export function LearnView() {
  return (
    <div className="learn-layout">
      <nav className="panel learn-nav" aria-label="Learn sections">
        <a href="#rules">Texas Hold'em rules</a>
        <a href="#rankings">Hand rankings</a>
        <a href="#equity">Equity &amp; pot odds</a>
        <a href="#glossary">Glossary</a>
      </nav>
      <div className="learn-main">
        <Rules />
        <Rankings />
        <EquityLesson />
        <Glossary />
      </div>
    </div>
  );
}

function Rules() {
  return (
    <section className="panel" id="rules">
      <h2>Texas Hold'em in two minutes</h2>
      <ol className="learn-steps">
        <li>
          Each player gets two private <G term="Hole cards">hole cards</G>. Two players post forced bets — the <G term="Blinds">blinds</G> — so there's something to
          win.
        </li>
        <li>
          <b>
            <G term="Pre-flop" />:
          </b>{' '}
          first <G term="Betting round">betting round</G>. Each player can <G term="Fold">fold</G>, <G term="Call">call</G> or <G term="Raise">raise</G>.
        </li>
        <li>
          <b>
            <G term="Flop" />:
          </b>{' '}
          three shared cards are dealt face up on the <G term="Board">board</G>, then another round of betting. With no bet in front of you, you can{' '}
          <G term="Check">check</G> or <G term="Bet">bet</G>.
        </li>
        <li>
          <b>
            <G term="Turn" />:
          </b>{' '}
          a fourth shared card, then betting.
        </li>
        <li>
          <b>
            <G term="River" />:
          </b>{' '}
          the fifth and final shared card, then the last round of betting.
        </li>
        <li>
          <b>
            <G term="Showdown" />:
          </b>{' '}
          everyone left shows their cards. Each player makes the <b>best five-card hand from their two hole cards plus the five board cards</b> — using both, one, or
          even none of their hole cards. The best hand wins the <G term="Pot">pot</G>; identical hands <G term="Split pot">split it</G>.
        </li>
      </ol>
      <p className="small muted" style={{ marginBottom: 0 }}>
        You can also win without a showdown: if everyone else folds, the last player in takes the pot without showing their cards.
      </p>
    </section>
  );
}

function Rankings() {
  return (
    <section className="panel" id="rankings">
      <h2>Hand rankings — best to worst</h2>
      <ol className="rankings">
        {RANKED.map((c, i) => (
          <li key={c}>
            <span className="rank-no">{i + 1}</span>
            <div>
              <b>{CATEGORY_NAMES[c]}</b>
              <div className="small muted">{CATEGORY_HELP[c]}</div>
            </div>
            <div className="rank-cards">
              {parseCards(CATEGORY_EXAMPLES[c]).map((card) => (
                <PlayingCard key={card} card={card} />
              ))}
            </div>
          </li>
        ))}
      </ol>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Suits never rank above each other. When two hands are the same type, compare the cards that make the hand, then the <G term="Kicker">kickers</G>. If all five
        cards match in rank, the pot is split.
      </p>
    </section>
  );
}

function EquityLesson() {
  const [outs, setOuts] = useState(9);
  const [street, setStreet] = useState<'flop' | 'turn'>('flop');
  const [pot, setPot] = useState(30);
  const [bet, setBet] = useState(10);
  const exact = street === 'flop' ? hitChance(outs, 2, 47) : hitChance(outs, 1, 46);
  const rule = Math.min(100, outs * (street === 'flop' ? 4 : 2));
  const needed = bet / (pot + bet);

  return (
    <section className="panel" id="equity">
      <h2>Equity &amp; pot odds — how to think about a call</h2>
      <p>
        <b>
          <G term="Equity" />
        </b>{' '}
        is your share of the pot over the long run — your chance of winning if the hand were played out many times. With 40% equity you win about 4 times in 10.
      </p>
      <p>
        <b>Worked example.</b> You hold A♥ 5♥ and the flop is K♥ 9♥ 2♣. You have four hearts, so any of the 9 remaining hearts gives you a{' '}
        <G term="Flush">flush</G> — 9 <G term="Outs">outs</G>. You can see 5 cards, so 47 are unseen. The chance of hitting by the river is{' '}
        <b>1 − (38/47 × 37/46) ≈ 35%</b>. The quick <G term="Rule of 4 and 2">rule of 4</G> says 9 × 4 = 36% — close enough at the table.
      </p>
      <p>
        <b>
          <G term="Pot odds" />
        </b>{' '}
        tell you whether a call is worth it. If the pot is 30 and your opponent bets 10, you must call 10 to win 40 (the pot, their bet and your call). You need to
        win more than 10 ÷ 40 = <b>25%</b> of the time. With 35% equity, calling makes money over time.
      </p>

      <div className="calc-grid">
        <div className="calc">
          <h3>Outs calculator</h3>
          <label className="field">
            Outs
            <input type="number" min={0} max={20} value={outs} onChange={(e) => setOuts(Math.max(0, Math.min(20, Number(e.target.value))))} />
          </label>
          <div className="seg" role="group" aria-label="Cards to come" style={{ marginTop: 8 }}>
            <button aria-pressed={street === 'flop'} onClick={() => setStreet('flop')}>
              On the flop (2 cards to come)
            </button>
            <button aria-pressed={street === 'turn'} onClick={() => setStreet('turn')}>
              On the turn (1 card)
            </button>
          </div>
          <p className="small">
            Exact: <b>{pct(exact)}</b> · Rule of {street === 'flop' ? 4 : 2}: <b>{rule}%</b>
          </p>
        </div>
        <div className="calc">
          <h3>Pot odds calculator</h3>
          <label className="field">
            Pot before the bet
            <input type="number" min={0} value={pot} onChange={(e) => setPot(Math.max(0, Number(e.target.value)))} />
          </label>
          <label className="field" style={{ marginTop: 8 }}>
            Bet you have to call
            <input type="number" min={0} value={bet} onChange={(e) => setBet(Math.max(0, Number(e.target.value)))} />
          </label>
          <p className="small">
            Call {bet} to win {pot + bet}: you need to win more than <b>{bet > 0 ? pct(needed) : '0%'}</b> of the time.
          </p>
        </div>
      </div>
    </section>
  );
}

function Glossary() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY.filter((e) => !q || e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q));
  }, [query]);

  return (
    <section className="panel" id="glossary">
      <h2>Glossary</h2>
      <input type="text" placeholder="Search terms, e.g. kicker, outs, flush…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search glossary" />
      {GROUPS.map((g) => {
        const entries = results.filter((e) => e.group === g);
        if (!entries.length) return null;
        return (
          <div key={g} className="section">
            <h3>{g}</h3>
            <dl className="glossary">
              {entries.map((e) => (
                <div key={e.term}>
                  <dt>{e.term}</dt>
                  <dd>{e.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
      {results.length === 0 && <p className="muted small">No terms match “{query}”.</p>}
    </section>
  );
}
