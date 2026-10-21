import { pct, requiredEquity, type EquityResult, type NutsInfo, type OutsReport, type StartingHandInfo, type ThreatReport } from '../engine/analysis';
import { CATEGORY_NAMES } from '../engine/evaluator';
import { fairShare } from '../engine/coach';
import type { Street } from '../engine/game';
import { EquityChart } from './EquityChart';
import { MiniCards } from './PlayingCard';
import { G } from './Term';

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
  toCall: number;
  pot: number;
  timeline: { street: Street; equity: number }[];
  hindsight: { street: Street; equity: number }[];
  heroFolded: boolean;
}

export function OddsPanel({ analysis, toCall, pot, timeline, hindsight, heroFolded }: Props) {
  return (
    <section className="panel" aria-label="Probabilities">
      <h2>
        Your odds {analysis && <span className="muted small">vs {analysis.opponents} opponent{analysis.opponents > 1 ? 's' : ''}</span>}
      </h2>
      {!analysis ? (
        <p className="muted small">{heroFolded ? 'You folded this hand. The chart below still shows how your odds moved.' : 'Deal a hand to see live probabilities.'}</p>
      ) : (
        <AnalysisBody analysis={analysis} toCall={toCall} pot={pot} />
      )}
      {(timeline.length > 0 || hindsight.length > 0) && (
        <div className="section" data-tour="chart">
          <h3>Win chance by round</h3>
          <EquityChart points={timeline} hindsight={hindsight} />
        </div>
      )}
    </section>
  );
}

function AnalysisBody({ analysis, toCall, pot }: { analysis: HandAnalysis; toCall: number; pot: number }) {
  const { equity, threats, outs, nuts, start, opponents } = analysis;
  const need = requiredEquity(toCall, pot);
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
      <div className="meter" aria-hidden data-tour="meter">
        <span style={{ width: pct(equity.equity, 1) }} />
        <i className="tick" style={{ left: pct(fs, 1) }} title="Even share" />
        {toCall > 0 && <i className="tick" style={{ left: pct(need, 1), background: 'var(--questionable)' }} title="Needed to call" />}
      </div>
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
              Needed to call {toCall} (<G term="Pot odds">pot odds</G>)
            </dt>
            <dd style={{ color: equity.equity >= need ? 'var(--great)' : 'var(--mistake)' }}>{pct(need)}</dd>
          </>
        )}
      </dl>

      {!threats && (
        <div className="section">
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
