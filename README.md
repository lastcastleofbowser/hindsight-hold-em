# Hindsight Hold'em

An offline-first No-Limit Texas Hold'em trainer. Play against bots with live odds, get every decision graded by a coach that asks *"why did you do that?"*, then see the hand again in hindsight with everyone's cards face up.

## Features

- **Play & Train** — play 1–5 bots with different styles. A glance strip shows your win chance, pot odds and outs; tabs hold the coach, full odds, a win-chance chart and the hand summary.
- **Coach** — grades each decision and replies to your reasoning. Considers position, opponent reads, chip stacks and stack-to-pot ratio; flags leaks like limping; works pot odds out step by step in chips.
- **Hindsight review** — after each hand: everyone's cards, your real equity against them, whether bets were bluffs, and your biggest leak.
- **Beginner** — a calmer table where the coach talks you through every hand in plain English.
- **Hand Review** — recreate a hand you played elsewhere and discuss it with the coach.
- **Which Hand Wins?** — hand-reading quiz.
- **Ranges** — pre-flop charts for each seat.
- **Friends** — play the same table online with a room code.
- **Profile** — accounts, saved games and progress. Chips persist between hands and visits.
- **Learn** — rules, hand rankings and a glossary; poker terms show definitions on hover throughout.
- **Tutorial mode** — guided tours of each screen.
- **Offline** — installable; everything except Friends and accounts works without internet.

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev      # app at http://localhost:5173
npm run server   # accounts + Friends at http://localhost:8787 (run alongside dev)
npm test         # unit tests
npm run build    # type-check + production build into dist/
```

The server stores accounts and history in SQLite at `data/hindsight.sqlite` (git-ignored; change with `DATA_DIR`).

**Deploying:** `dist/` is a static site for training only. For accounts and Friends, run `npm run build && npm run server` on a Node host with WebSockets and HTTPS, and give `DATA_DIR` a persistent disk. Behind a reverse proxy, set `TRUST_PROXY=1`.

## Iteration 7: Account setup and deployment

- The account form can show or hide passwords while logging in or creating an account, including the confirmation field.
- Registration and account-server failures provide actionable messages. In development, run `npm run server` in a second terminal alongside `npm run dev`; backend validation messages, such as the minimum password length or a taken username, are shown directly.
- Browser-first deployment is recommended. The existing web app can be installed as a PWA without maintaining a separate desktop app. Accounts and Friends still require the Node server, WebSocket support, HTTPS, and persistent storage described above.

## How the coach works

No AI model or internet: the coach is rule-based TypeScript. It combines exact hand evaluation, Monte Carlo equity, opponent reads built from their betting, pre-flop range charts and standard rules (pot odds, value thresholds, stack depth). Same spot, same answer.

The coach logic is in `src/engine/coach.ts`; the numbers come from `src/engine/analysis.ts`.

## Project layout

```
src/engine/      Poker engine, odds, coach, reads, ranges, review (pure TS, unit-tested)
src/components/  React UI
src/hooks/       Game state, settings, accounts, Friends connection
src/content/     Glossary and tutorial tours
server/          Node server: API, accounts, SQLite, Friends tables
```

Built with TypeScript, React 18, Vite 5, Vitest, plain CSS, `ws` and `sql.js`.

## Known limitations

- Bots are simple equity-plus-personality players, not game-theory-optimal opponents.
- Range charts cover the first pre-flop decision only (raise first in, big blind defence).
- The Hand Review chat answers a fixed set of question types.
- Friends tables live in server memory; a restart ends hands in progress (finished hands are saved).
- No password reset yet.
