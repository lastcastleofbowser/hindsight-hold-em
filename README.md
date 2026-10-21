# Hindsight Hold'em

Poker hand analytics and probability app — an offline-first No-Limit Texas Hold'em trainer that shows live win probabilities and has an AI coach that asks *"why did you do that?"* and explains where your logic held up or broke down.

> **Current version:** Iteration 1 (v0.1.0). See the [iteration log](#iteration-log) for what changed in each iteration.

---

## Features

### 1. Play & Train (gamified table)
- A clean poker-table UI (felt, rail, dealer button, chips) with cards dealt at random and animated onto the table.
- Play against 1–5 bot opponents with different styles: Tight, Balanced, Loose, Aggressive, or a mixed table.
- **Live probabilities on every street (pre-flop, flop, turn, river):**
  - Equity (your chance to win the pot), split into win and tie, with an "even share" marker.
  - Pot odds: the equity you need to call, compared with what you have.
  - Your current made hand, highlighted on the table.
  - **Chance someone already has you beat**, with the hands that beat you grouped by type (e.g. Flush: 42 combos).
  - **The nuts:** the best possible hand on the board, with an example holding.
  - **Outs**, plus the odds of hitting on the next card and by the river.
  - Odds of finishing with each hand type by the river.
  - **Equity-by-street chart** showing how your percentage moved pre-flop → flop → turn → river.
- **Hindsight review after every hand:** everyone's hole cards are revealed. Each decision is graded, and a second chart line shows your *true* equity against the cards opponents actually held.
- Session stats: hands played, net chips, and the share of good decisions.
- Keyboard shortcuts: `F` fold, `C` check/call, `B`/`R` bet/raise.

### 2. AI Coach
- **Live "why?" coaching** (Settings → Coach → *Ask why*). After each action the table pauses and the coach asks why you did it. Pick one or more reasons (value, bluff, drawing, pot odds, scared, cheap, gut) and/or type your own explanation. The coach grades the decision (Great / Reasonable / Questionable / Mistake), shows the numbers behind it, and responds to *your stated reasoning*. For example, it tells you when a "bluff" was really a value bet, or how often a bluff needs to work to break even.
- **Hint** button: ask what the coach would do before acting.
- **Hand Review chat:** recreate a past hand by picking your cards, the board, and optionally the cards that beat you. Record your action, the pot, the bet you faced and your reasoning for each street. The coach then:
  - walks through each street, judging the decision on what you could know at the time;
  - uses hindsight to show your real equity against the opponent's actual cards and what beat you;
  - names your biggest leak and points out results-oriented thinking ("you played it right and got unlucky" vs "you won, but…");
  - answers follow-up questions in the chat (outs, pot odds, what you should have done on a street, the nuts, equity, why you lost).
- Any table hand can be sent to the chat with **Discuss with coach**.
- **Load example** fills in a teaching hand so you can try the review flow straight away.

### Offline-first
- All poker maths (hand evaluation, equity simulation, outs, nuts, coaching logic) runs in the browser. **No server is required.**
- A service worker precaches the whole app after the first visit, so it works with no connection. It can be installed as an app (PWA).
- **Optional online coach:** add an Anthropic API key in Settings and enable Claude. Open-ended chat questions then go to Claude (`claude-opus-5-5`), grounded in the engine's computed numbers. Without a key, or when offline, the built-in coach answers.

---

## Getting started

Requires Node.js 18+ (developed on Node 19).

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker active) at http://localhost:4173
```

The offline service worker is only registered in production builds (`npm run build` + `npm run preview`, or any static host serving `dist/`).

### Deploying to a website domain
`dist/` is a fully static site with relative asset paths. Upload it to any static host (Netlify, Vercel, GitHub Pages, S3/CloudFront, nginx). Serve over HTTPS so the service worker can register.

---

## Technology choices

| Choice | Why |
|---|---|
| **TypeScript** | The poker engine is precise, logic-heavy code. Static types catch whole classes of bugs (card encodings, game state) at compile time. |
| **React 18** | A component model suits a table of seats, cards and panels that re-render as game state changes. |
| **Vite 5** | Fast dev server and a simple static production build, ideal for a website domain. |
| **No UI framework / plain CSS** | Full control over the poker-table look; zero runtime styling dependencies. |
| **Hand-written service worker** | Generated at build time from the bundle's file list (see `vite.config.ts`); small and dependency-free. |
| **Vitest** | Same config and module system as Vite. |
| **`@anthropic-ai/sdk` (lazy-loaded)** | Official SDK for the optional online coach. It is loaded only when Claude is used, so the offline app never depends on it. |

---

## Architecture

```
src/
  engine/               Pure TypeScript poker engine (no React, fully unit-tested)
    cards.ts            Card encoding (0–51 ints), parsing, shuffling, seeded RNG
    evaluator.ts        Fast 7-card hand evaluator + hand naming + best-five finder
    analysis.ts         Equity (Monte Carlo / exact), betting-range model, threats, nuts, outs, starting-hand tiers, pot odds
    game.ts             Betting engine: blinds, streets, legal actions, raises, all-ins, showdown
    bots.ts             Bot opponents (equity + personality profiles)
    coach.ts            Recommendation, decision grading, "why?" reasoning responses
    review.ts           Hindsight review: grades a hand's decisions, hindsight equity, showdown, summary
    chat.ts             Offline chat coach + compact "hand facts" for the LLM
  claude.ts             Optional Claude client (lazy SDK import, streaming, typed errors)
  hooks/                useGame (table state machine + bot timing), useSettings, useOnline
  components/           Table, cards, action bar, odds panel, equity chart, coach panel, hand summary, review builder, chat, settings
  styles/app.css        Card-room theme
vite.config.ts          Build config + offline service-worker generator
```

### How the numbers are computed
- **Hand evaluation:** a bit-mask/count evaluator scores the best 5 of up to 7 cards as a single comparable integer.
- **Equity:** Monte Carlo simulation over unknown opponent hands and the remaining board (2,500–15,000 trials, set by *Simulation accuracy*). If every opponent's cards are known and at most two board cards are missing, every runout is enumerated exactly.
- **Betting-range equity:** when you face a bet after the flop, the coach also measures your equity against a modelled *betting range*: top pair or an overpair, two pair or better, or a flush or straight draw. This stops "equity vs random hands" from overrating weak holdings.
- **Chance someone is ahead:** enumerates every two-card holding an opponent could have and counts those beating your current hand. For N opponents it uses 1 − (1 − p)^N, which ignores card removal between opponents.
- **Outs:** unseen cards that improve you to a better hand category using your hole cards. Board-pairing cards and pairs below the top board card are excluded.
- **Starting hands:** Chen formula → Premium / Strong / Playable / Marginal / Weak.

### How the coach decides
- Pre-flop: starting-hand tier, and whether you are facing a raise.
- Facing a bet: compares realistic equity against pot odds. Raise when well ahead; call strong draws with implied odds when slightly short.
- No bet to you: bet for value above a threshold that scales with the number of opponents; semi-bluff strong draws; otherwise check. Folding when checking is free is always a mistake.
- Bet sizing: flags oversized bets and all-ins with non-premium hands, and gives the break-even fold frequency for bluffs (bet ÷ (pot + bet)).

---

## Known limitations (iteration 1)
- Stacks reset to 100 big blinds every hand. Equal stacks mean there is never a side pot, so side pots are not implemented yet.
- The coach doesn't yet consider table position, stack-to-pot ratio, or opponents' betting history across streets.
- Bots are simple equity-plus-personality players, not game-theory-optimal opponents.
- Hand Review records one decision per street (enter the most important one) and one known opponent hand.
- The optional Claude API key is stored in the browser's localStorage and sent directly to Anthropic. This is fine for a personal trainer. A shared or hosted multi-user deployment should proxy requests through a backend instead.
- At phone width, the side seats sit close to the community cards.

---

## Iteration log

### Iteration 1 — initial release (v0.1.0)
- Project set up: React + TypeScript + Vite, Vitest, offline service worker, PWA manifest and icon.
- Poker engine: 7-card evaluator, Monte Carlo/exact equity, betting-range model, threats, nuts, outs, starting-hand tiers, full No-Limit betting engine with blinds, raises, all-ins and showdowns, and bot opponents with four personalities.
- Play & Train table: animated dealing, live odds panel, equity-by-street chart, hindsight reveal and per-decision grading, session stats, keyboard shortcuts.
- Live AI coach: "why did you do that?" prompt with reason chips and free text, graded feedback with numbers, hint button.
- Hand Review: card-picker hand builder (your cards, board, the hand that beat you, per-street actions, pot sizes and reasoning), street-by-street coach walkthrough, hindsight equity, offline chat follow-ups, example hand, draft saved locally.
- Optional Claude coach for open-ended chat (streaming, grounded in engine numbers, falls back to the offline coach).
- Settings: opponents, opponent style, coach mode, odds visibility, simulation accuracy, table speed, Claude key.
- 34 unit tests covering the evaluator, equity, outs, the betting engine (chip conservation over 1,500 simulated hands), the coach and the review chat.
