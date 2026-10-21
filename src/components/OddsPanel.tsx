import { callValue, oneIn, pct, requiredEquity, type EquityResult, type NutsInfo, type OutsReport, type StartingHandInfo, type ThreatReport } from '../engine/analysis';
import { CATEGORY_NAMES } from '../engine/evaluator';
import { fairShare } from '../engine/coach';
import type { Street } from '../engine/game';
import { EquityChart } from './EquityChart';
import { MiniCards } from './PlayingCard';
import { G, HoverTip, TermText } from './Term';
import type { OpponentRead } from '../engine/reads';

export interface HandAnalysis {
  equity: EquityResult;
  threats: ThreatReport | null;
  outs: OutsReport | null;
  nuts: NutsInfo | null;
  start: StartingHandInfo;
  opponents: number;
}

interface Props {
  analysis: HandAnalysis | null;
  /** Win chance against the hands opponents' actions suggest (live table only). */
  readsEquity?: number;
  reads?: OpponentRead[];
  toCall: number;
  pot: number;
  timeline: { street: Street; equity: number }[];
  hindsight: { street: Street; equity: number }[];
  heroFolded: boolean;
  /** Include the win-chance chart (off when the chart has its own tab). */
  chart?: boolean;
  /** Pre-flop with no raise: calling would be a limp, which the coach advises against whatever the price. */
  limpSpot?: boolean;
}

export function OddsPanel({ analysis, readsEquity, reads, toCall, pot, timeline, hindsight, heroFolded, chart = true, limpSpot }: Props) {
  return (
    <section className="panel" aria-label="Probabilities">
      <h2>
        Your odds {analysis && <span className="muted small">vs {analysis.opponents} opponent{analysis.opponents > 1 ? 's' : ''}</span>}
      </h2>
      {!analysis ? (
        <p className="muted small">{heroFolded ? 'You folded this hand. The chart below still shows how your odds moved.' : 'Deal a hand to see live probabilities.'}</p>
      ) : (
        <AnalysisBody analysis={analysis} toCall={toCall} pot={pot} readsEquity={readsEquity} limpSpot={limpSpot} />
      )}
      {analysis && reads && reads.some((r) => r.steps.length > 0) && (
        <div className="section" data-tour="reads">
          <h3>Reading the table</h3>
          {readsEquity !== undefined && (
            <p className="small" style={{ marginTop: 0 }}>
              Against the hands their actions suggest, you win about <b>{pct(readsEquity)}</b>.
            </p>
          )}
          <ul className="points">
            {reads
              .filter((r) => r.steps.length > 0)
              .map((r) => (
                <li key={r.playerId}>
                  <TermText text={r.summary} />
                </li>
              ))}
          </ul>
        </div>
      )}
      {chart && (timeline.length > 0 || hindsight.length > 0) && (
        <div className="section" data-tour="chart">
          <h3>Win chance by round</h3>
          <EquityChart points={timeline} hindsight={hindsight} />
        </div>
      )}
    </section>
  );
}

/**
 * Pot odds as a worked example with this hand's numbers: what the call costs,
 * how often it has to win, how often it does, and what that's worth in chips.
 */
function PotOdds({
  toCall,
  pot,
  need,
  randomEquity,
  realistic,
  hasReads,
  limpSpot,
}: {
  toCall: number;
  pot: number;
  need: number;
  randomEquity: number;
  realistic: number;
  hasReads: boolean;
  limpSpot?: boolean;
}) {
  const total = pot + toCall;
  const ok = realistic >= need;
  const value = Math.round(callValue(realistic, toCall, pot));
  const showRandom = hasReads && Math.abs(randomEquity - realistic) >= 0.03;
  return (
    <div className={`section pot-odds ${ok ? 'ok' : 'bad'}`} data-tour="pot-odds">
      <h3>Should you call? Pot odds, step by step</h3>
      <ol className="steps">
        <li>
          <b>The price.</b> You pay <b>{toCall}</b> to win a pot of <b>{total}</b> ({pot} already in, plus your {toCall}).
        </li>
        <li>
          <b>The break-even point.</b> {toCall} ÷ {total} = <b>{pct(need)}</b>. Calling pays off if you win more than {pct(need)} of the time — about{' '}
          {oneIn(need)}.
        </li>
        <li>
          <b>Your chance.</b> You win about <b>{pct(realistic)}</b>
          {hasReads ? ' against the hands their betting suggests' : ''}
          {showRandom ? ` (${pct(randomEquity)} against random cards — but people who bet usually have something)` : ''}.
        </li>
      </ol>
      <p className="pot-odds-verdict">
        {ok ? (
          <>
            ✓ <b>{pct(realistic)}</b> is more than <b>{pct(need)}</b>, so calling makes money over time — about <b>+{Math.max(0, value)} chips</b> per call
            on average.
          </>
        ) : (
          <>
            ✗ <b>{pct(realistic)}</b> is less than <b>{pct(need)}</b>, so calling loses about <b>{Math.abs(Math.min(0, value))} chips</b> per call on average.
            Fold — unless a strong draw means you'll win extra chips later when you hit.
          </>
        )}
      </p>
      {limpSpot && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Before the flop with no raise yet, the price is only the start: just calling (limping) gives up your chance to win the pot right away, so the coach
          prefers raise or fold here.
        </p>
      )}
      <details className="real-table">
        <summary>How to work this out at a real table</summary>
        <ol className="steps">
          <li>Add up the pot, including the bet you're facing.</li>
          <li>
            Compare it with the call. Here the pot is {pot} and the call is {toCall}: about <b>{(pot / toCall).toFixed(1)} to 1</b>, so you need to win at least{' '}
            {oneIn(need)} hands like this.
          </li>
          <li>
            Estimate your chance: count your <G term="Outs">outs</G>, then use the <G term="Rule of 4 and 2">rule of 4 and 2</G> (outs × 4 on the flop, × 2 on the turn).
          </li>
          <li>Bigger than the break-even point? Call (or raise). Smaller? Fold.</li>
        </ol>
        <p className="small muted" style={{ margin: 0 }}>
          A quick guide: a half-pot bet needs 25%, a pot-sized bet needs 33%, and a small third-pot bet needs only 20%.
        </p>
      </details>
    </div>
  );
}

/** The win-chance chart on its own, for a tab of its own. */
export function ChartPanel({ timeline, hindsight }: { timeline: { street: Street; equity: number }[]; hindsight: { street: Street; equity: number }[] }) {
  return (
    <section className="panel" aria-label="Win chance by round">
      <h2>Win chance by round</h2>
      {timeline.length > 0 || hindsight.length > 0 ? (
        <div data-tour="chart">
          <EquityChart points={timeline} hindsight={hindsight} />
        </div>
      ) : (
        <p className="muted small">The chart fills in as the hand is played.</p>
      )}
    </section>
  );
}

function AnalysisBody({
  analysis,
  toCall,
  pot,
  readsEquity,
  limpSpot,
}: {
  analysis: HandAnalysis;
  toCall: number;
  pot: number;
  readsEquity?: number;
  limpSpot?: boolean;
}) {
  const { equity, threats, outs, nuts, start, opponents } = analysis;
  const need = requiredEquity(toCall, pot);
  // What a call should be judged on: the win chance against the hands their bets suggest, when we have one.
  const realistic = readsEquity ?? equity.equity;
  const fs = fairShare(opponents);
  const heroHasNuts = !!threats && !!nuts && threats.hero.score >= nuts.score;
  const finals = equity.finalCategoryOdds
    .map((p, cat) => ({ cat, p }))
    .filter((x) => x.p >= 0.005)
    .reverse();
  const maxThreat = Math.max(1, ...(threats?.byCategory.map((g) => g.combos) ?? [1]));

  return (
    <>
      <div className="equity-hero" data-tour="equity">
        <span className="big">{pct(equity.equity)}</span>
        <span className="muted small">
          chance to win the pot (<G term="Equity">equity</G>){equity.exact ? '' : ` · ${equity.iterations.toLocaleString()} simulated deals`}
        </span>
      </div>
      <HoverTip
        title="Reading the meter"
        className="meter-tip"
        tip={
          <ul className="tip-legend">
            <li>
              <i className="swatch fill" /> <span>
                <b>Filled bar</b> — your chance to win: {pct(equity.equity)}.
              </span>
            </li>
            <li>
              <i className="swatch even" /> <span>
                <b>White mark</b> — an even share ({pct(fs)} with {opponents + 1} players). Past it, you're doing better than an average hand.
              </span>
            </li>
            {toCall > 0 && (
              <li>
                <i className="swatch need" /> <span>
                  <b>Orange mark</b> — the win chance you need to call {toCall} ({pct(need)}). Bar past it: calling pays. Short of it: folding saves chips.
                </span>
              </li>
            )}
          </ul>
        }
      >
        <div className="meter" data-tour="meter">
          <span style={{ width: pct(equity.equity, 1) }} />
          <i className="tick even" style={{ left: pct(fs, 1) }} />
          {toCall > 0 && <i className="tick need" style={{ left: pct(need, 1) }} />}
        </div>
      </HoverTip>
      <dl className="kv" data-tour="odds-rows">
        <dt>Win outright / split</dt>
        <dd>
          {pct(equity.win)} / {pct(equity.tie)}
        </dd>
        <dt>
          <G term="Even share">Even share</G> with {opponents + 1} players
        </dt>
        <dd>{pct(fs)}</dd>
        {toCall > 0 && (
          <>
            <dt>
              Win chance needed to call {toCall} (<G term="Pot odds">pot odds</G>)
            </dt>
            <dd style={{ color: realistic >= need ? 'var(--great)' : 'var(--mistake)' }}>
              {pct(need)} {realistic >= need ? '✓' : '✗'}
            </dd>
          </>
        )}
      </dl>

      {toCall > 0 && (
        <PotOdds toCall={toCall} pot={pot} need={need} randomEquity={equity.equity} realistic={realistic} hasReads={readsEquity !== undefined} limpSpot={limpSpot} />
      )}

      {!threats && (
        <div className="section" data-tour="starting-hand">
          <h3>Starting hand</h3>
          <div>
            <b>{start.notation}</b> <span className={`tier ${start.tier}`}>{start.tier}</span>{' '}
            <span className="muted small">
              <G term="Chen score">Chen score</G> {start.chen}
            </span>
          </div>
        </div>
      )}

      {threats && (
        <div className="section" data-tour="right-now">
          <h3>Right now</h3>
          <div>
            You have <b>{threats.hero.name}</b>
            {heroHasNuts && (
              <span className="verdict great" style={{ marginLeft: 8 }}>
                <G term="The nuts">The nuts!</G>
              </span>
            )}
          </div>
          <dl className="kv">
            <dt>Chance someone has you beat</dt>
            <dd style={{ color: threats.pBeatAny > 0.5 ? 'var(--mistake)' : threats.pBeatAny > 0.25 ? 'var(--questionable)' : 'var(--great)' }}>
              {pct(threats.pBeatAny)}
            </dd>
            <dt>
              Hands that beat you (of {threats.totalCombos} <G term="Combos">combos</G>)
            </dt>
            <dd>{threats.beatCombos} combos</dd>
          </dl>
          {threats.byCategory.length > 0 && (
            <div className="bars" style={{ marginTop: 8 }}>
              {threats.byCategory.slice(0, 5).map((g) => (
                <div className="bar-row" key={g.category}>
                  <span>{g.name}</span>
                  <span className="track">
                    <span className="fill threat" style={{ width: `${(g.combos / maxThreat) * 100}%`, display: 'block' }} />
                  </span>
                  <span className="v">{g.combos}</span>
                </div>
              ))}
            </div>
          )}
          {nuts && !heroHasNuts && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              Best possible hand (<G term="The nuts">the nuts</G>): <b style={{ color: 'var(--ink)' }}>{nuts.name}</b> (e.g. <MiniCards cards={nuts.example} />)
            </p>
          )}
        </div>
      )}

      {outs && outs.total > 0 && (
        <div className="section" data-tour="outs">
          <h3>
            <G term="Outs">Outs</G>: {outs.total} · {pct(outs.hitNextCard)} next card{outs.hitByRiver !== outs.hitNextCard ? ` · ${pct(outs.hitByRiver)} by river` : ''}
          </h3>
          {outs.groups.map((g) => (
            <div key={g.category} className="small" style={{ marginBottom: 4 }}>
              {g.name}: <MiniCards cards={g.cards} />
            </div>
          ))}
        </div>
      )}

      {finals.length > 0 && (
        <div className="section" data-tour="final-hand">
          <h3>Your final hand by the river</h3>
          <div className="bars">
            {finals.map(({ cat, p }) => (
              <div className="bar-row" key={cat}>
                <span>{CATEGORY_NAMES[cat]}</span>
                <span className="track">
                  <span className="fill" style={{ width: pct(p, 1), display: 'block' }} />
                </span>
                <span className="v">{pct(p)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
