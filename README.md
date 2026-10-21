# Hindsight Hold'em

Texas Hold'em hand analytics and probability app — an offline-first No-Limit **Texas Hold'em** trainer that shows live win probabilities, teaches beginners how to read hands, and has an AI coach that asks *"why did you do that?"* and explains where your logic held up or broke down.

> The app covers **Texas Hold'em only**: two private hole cards per player, five shared community cards (flop, turn, river), four betting rounds, and the best five-card hand from those seven wins.

> **Current version:** Iteration 2 (v0.2.0). See the [iteration log](#iteration-log) for what changed in each iteration.

---

## Features

The app has four tabs: **Play & Train**, **Hand Review**, **Which Hand Wins?** and **Learn**.

### 1. Play & Train (gamified table)
- A clean poker-table UI (felt, rail, dealer button, chips) with cards dealt at random and animated onto the table.
- Play against 1–5 bot opponents with different styles: Tight, Balanced, Loose, Aggressive, or a mixed table.
- **Live probabilities in every betting round (pre-flop, flop, turn, river):**
  - Win chance (equity), split into win and tie, with an "even share" marker.
  - Pot odds: the win chance you need to call, compared with what you have.
  - Your current made hand, highlighted on the table.
  - **Chance someone already has you beat**, with the hands that beat you grouped by type (e.g. Flush: 42 combos).
  - **The nuts:** the best possible hand on the board, with an example holding.
  - **Outs**, plus the odds of hitting on the next card and by the river.
  - Odds of finishing with each hand type by the river.
  - **Win-chance-by-round chart** showing how your percentage moved pre-flop → flop → turn → river.
- **Hindsight review after every hand:**
  - Everyone's hole cards are revealed.
  - A **showdown explanation** lists each player's best five cards and says why the winning hand won.
  - Each decision is graded.
  - A second chart line shows your *true* equity against the cards opponents actually held.
- Session stats: hands played, net chips, and the share of good decisions.
- Keyboard shortcuts: `F` fold, `C` check/call, `B`/`R` bet/raise.

### 2. AI Coach
- **Live "why?" coaching** (Settings → Coach → *Ask why*). After each action the table pauses and the coach asks why you did it. Pick one or more reasons (or type your own) and the coach:
  - grades the decision (Great / Reasonable / Questionable / Mistake);
  - shows the numbers behind it;
  - responds to *your stated reasoning*, e.g. telling you when a "bluff" was really a value bet, or how often a bluff needs to work to break even.
- **Hint** button: ask what the coach would do before acting.
- **Hand Review chat:** recreate a past hand by picking your cards, the board, and optionally your opponent's cards. Record your action, the pot, the bet you faced and your reasoning for each betting round, plus **what happened at the table** (won / lost / split). The coach then:
  - walks through each round, judging the decision on what you could know at the time;
  - runs a **showdown check** (see below);
  - uses hindsight to show your real equity against the opponent's actual cards;
  - names your biggest leak and points out results-oriented thinking;
  - answers follow-up questions in the chat: who should have won, outs, pot odds, what you should have done in a round, the nuts, equity.
- **Showdown check — "who should have won?"** With the full board and the opponent's cards, the coach:
  - shows both players' best five cards;
  - explains in plain English why one hand beats the other (hand type, then pair rank, then kickers), or why it's a split;
  - lists what would have beaten your hand on that board (or tells you that you had the nuts) and whether the opponent's hand was one of those;
  - **warns you if the result you reported contradicts the rules**, e.g. "You said you lost, but by the rules of Texas Hold'em you should have won".
- Any table hand can be sent to the chat with **Discuss with coach**.
- Two built-in examples: **Example: bluff** (a missed draw turned into a river bluff) and **Example: who won?** (A-K makes a straight against Q-3, reported as a loss).

### 3. Which Hand Wins? (hand-reading trainer)
- Several hands (2–4 players) are dealt face up with a full board. Pick the winner (or a split pot), **name the winning hand type**, and **write a short justification** (required).
- **Optional flop step that teaches equity:**
  - Guess who is ahead on the flop.
  - See each player's exact win chance, counted over every possible turn and river.
  - See the outs for each player who is behind, and the **rule of 4** estimate next to the exact figure, with an explanation when they differ.
- Feedback explains the result in plain English, highlights the winning five cards, and checks your reasoning. For example: "You mentioned a flush, but Player A has at most 3 hearts — a flush needs five cards of one suit."
- Practice modes:
  - **Mixed**
  - **Straights & flushes**: deals are weighted so someone makes a straight or a flush.
  - **Kickers & ties**: the top two hands are the same type.
- Score, current streak and best streak are saved in the browser.

### 4. Learn (beginner support)
- **Texas Hold'em in two minutes:** the rules, betting rounds and how the showdown works.
- **Hand rankings chart** from Royal Flush to High Card, with example cards and plain-English descriptions.
- **Equity & pot odds lesson** with a worked example, an **outs calculator** (exact chance vs rule of 4/2) and a **pot odds calculator**.
- **Searchable glossary** of about 60 Texas Hold'em terms.

### Beginner-friendly everywhere
- **Hover or tap any dotted-underlined term** (equity, outs, kicker, the nuts, pot odds, flush draw…) for a definition. Terms are auto-linked in coach feedback, chat messages, summaries and the odds panel.
- **Beginner explanations** (Settings, on by default): every piece of coach feedback also has a plain-English version, e.g. "you'd win about 4 times out of 10; calling pays off if you win more than 3 times out of 10".
- Jargon has been replaced where possible. The app says "betting round" or "round" instead of the insider term "street"; the glossary explains that players call a round a street.

### Offline-first
- All poker maths (hand evaluation, equity simulation, outs, nuts, coaching logic, quiz grading) runs in the browser. **No server is required.**
- A service worker precaches the whole app after the first visit, so it works with no connection. It can be installed as an app (PWA).
- **Optional online coach:** add an Anthropic API key in Settings and enable Claude. Open-ended chat questions then go to Claude (`claude-opus-5-5`), grounded in the engine's computed numbers. Without a key, or when offline, the built-in coach answers.

---

## How AI is used

There are two layers, and only the second one is a large language model:

1. **The built-in coach (always on, fully offline).** This is an expert system written in TypeScript, not a trained model. It combines:
   - exact hand evaluation;
   - Monte Carlo simulation (thousands of random deals) to estimate equity;
   - a modelled betting range for spots where you face a bet;
   - poker rules of thumb (pot odds, value thresholds, starting-hand tiers).

   Its "why did you do that?" replies come from matching your chosen reasons and keywords in your text against those numbers. The bots also use this engine plus personality settings. Everything runs on the user's device, needs no internet, and gives the same answer for the same spot.
2. **Claude (optional, online only).** If a user enables it and enters their own Anthropic API key, follow-up questions in the Hand Review chat are sent to Claude together with the engine's computed facts. Claude writes free-form coaching answers but is told to treat those numbers as ground truth, so it explains the maths rather than inventing it.

### Will it work on other computers?
- **Yes.** It's a static website that runs in any modern browser (Chrome, Edge, Safari, Firefox) on Windows, macOS, Linux, iOS or Android.
- To share it, deploy `dist/` to a web host (see below) and send the link; nothing needs installing. Alternatively, another developer can clone the repo and run `npm install && npm run dev` (Node.js 18+).
- After the first visit the service worker caches the app, so it keeps working offline on that device, and it can be installed like an app.
- **Per-device data:** settings, saved review drafts and quiz scores live in that browser's local storage. They don't sync between computers.
- **Claude is per user:** each person who wants it needs their own API key and an internet connection. Everything else works for everyone without a key.

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
  engine/               Pure TypeScript Texas Hold'em engine (no React, fully unit-tested)
    cards.ts            Card encoding (0–51 ints), parsing, shuffling, seeded RNG
    evaluator.ts        Fast 7-card hand evaluator (10 categories incl. Royal Flush), hand naming, best-five finder
    analysis.ts         Equity (Monte Carlo / exact), betting-range model, threats, nuts, outs, starting-hand tiers, pot odds
    explain.ts          Plain-English hand comparisons (why A beats B, kickers, splits), ranking descriptions
    game.ts             Betting engine: blinds, betting rounds, legal actions, raises, all-ins, showdown
    bots.ts             Bot opponents (equity + personality profiles)
    coach.ts            Recommendation, decision grading, plain-English explanations, "why?" responses
    review.ts           Hindsight review + showdown check (who should have won, reported-result mismatch)
    chat.ts             Offline chat coach + compact "hand facts" for the LLM
    quiz.ts             "Which Hand Wins?" deal generator, flop equity lesson, grading of answers and reasoning
    tests/              Unit tests (Vitest) for all of the above
  content/glossary.ts   Glossary entries used for hover definitions and the Learn tab
  claude.ts             Optional Claude client (lazy SDK import, streaming, typed errors)
  hooks/                useGame (table state machine + bot timing), useSettings, useOnline
  components/           Table, cards, action bar, odds panel, chart, coach panel, hand summary,
                        review builder, chat, quiz, learn, glossary terms (Term.tsx), settings
  styles/app.css        Card-room theme
vite.config.ts          Build config + offline service-worker generator
```

### How the numbers are computed
- **Hand evaluation:** a bit-mask/count evaluator scores the best 5 of up to 7 cards as a single comparable integer. Royal Flush is its own (top) category.
- **Equity:** Monte Carlo simulation over unknown opponent hands and the remaining board (2,500–15,000 trials, set by *Simulation accuracy*). If every opponent's cards are known and at most two board cards are missing, every runout is enumerated exactly. The quiz's flop lesson always enumerates exactly.
- **Betting-range equity:** when you face a bet after the flop, the coach also measures your equity against a modelled *betting range*: top pair or an overpair, two pair or better, or a flush or straight draw.
- **Chance someone is ahead:** enumerates every two-card holding an opponent could have and counts those beating your current hand. For N opponents it uses 1 − (1 − p)^N.
- **Outs:** unseen cards that improve you to a better hand category using your hole cards. Board-pairing cards and pairs below the top board card are excluded.
- **Hand comparisons:** different hand types are ordered by the ranking list. For the same type, the explanation walks through the tie-breaks in order: pair or three-of-a-kind rank, second pair, then kickers.
- **Starting hands:** Chen formula → Premium / Strong / Playable / Marginal / Weak.

### How the coach decides
- Pre-flop: starting-hand tier, and whether you are facing a raise.
- Facing a bet: compares realistic equity against pot odds. Raise when well ahead; call strong draws with implied odds when slightly short.
- No bet to you: bet for value above a threshold that scales with the number of opponents; semi-bluff strong draws; otherwise check. Folding when checking is free is always a mistake.
- Bet sizing: flags oversized bets and all-ins with non-premium hands, and gives the break-even fold frequency for bluffs (bet ÷ (pot + bet)).

### Tests
Tests live in `src/engine/tests/` and run with `npm test`. They are TypeScript (`*.test.ts`) to match the rest of the codebase. There are 54 tests covering:
- evaluator: all 10 categories, the Royal Flush, kickers, the wheel;
- equity, outs and the betting-range model;
- the betting engine: chip conservation over 1,500 simulated hands;
- the coach;
- the showdown check, including a regression test for A-K making a straight against Q-3;
- hand-comparison explanations;
- quiz generation and grading;
- glossary integrity.

---

## Known limitations
- Stacks reset to 100 big blinds every hand. Equal stacks mean there is never a side pot, so side pots are not implemented yet.
- The coach doesn't yet consider table position, stack-to-pot ratio, or opponents' betting history across rounds.
- Bots are simple equity-plus-personality players, not game-theory-optimal opponents.
- Hand Review records one decision per betting round (enter the most important one) and one known opponent hand.
- The quiz grades written reasoning with keyword checks (hand names, kickers), not full language understanding.
- The optional Claude API key is stored in the browser's localStorage and sent directly to Anthropic. This is fine for a personal trainer. A shared or hosted multi-user deployment should proxy requests through a backend instead.
- At phone width, the side seats sit close to the community cards.

---

## Iteration log

### Iteration 2 — beginner support, showdown check, hand-reading quiz (v0.2.0)
- **Royal Flush** is now a separate hand category (`Category.RoyalFlush`, listed in `CATEGORY_NAMES`), ranked above Straight Flush everywhere: odds panel, explanations, quiz.
- **Texas Hold'em only:** branding, copy, rules lesson and the Claude prompt state that the app covers Texas Hold'em, and explain its specific rules (two hole cards, five community cards, best five of seven, the board can play).
- **Tests moved** to `src/engine/tests/` (kept as TypeScript to match the codebase). Tests grew from 34 to 54.
- **Showdown check:** fixes the hand-review feedback gap reported in testing. The engine already scored A-K's straight correctly against Q-3, but the result was easy to miss and the chat assumed a loss. The coach now:
  - shows both best-five hands;
  - explains why one beats the other;
  - lists what would have beaten you and whether the opponent's hand did;
  - flags a reported result that contradicts the rules.

  New "Result at the table" field in Hand Review. The table's end-of-hand summary also explains the showdown. The chat now routes "who should have won?" questions to the showdown check instead of treating them as "what should I have done?".
- **Beginner support:**
  - hover/tap definitions on poker terms across the app;
  - a searchable glossary;
  - plain-English explanations in coach feedback (Settings → *Beginner explanations*, on by default);
  - "street" replaced by "betting round"/"round" in the UI;
  - plainer labels for the "why?" reasons;
  - Claude is told to avoid jargon in beginner mode.
- **Learn tab:** Texas Hold'em rules, hand rankings with examples, an equity and pot odds lesson with a worked example, and outs and pot-odds calculators.
- **Which Hand Wins? tab:**
  - pick the winner from 2–4 hands, name the hand type and justify it;
  - optional flop step teaching equity, outs and the rule of 4;
  - practice modes for straights & flushes and for kickers & ties;
  - feedback on your written reasoning;
  - saved score and streaks.
- Header no longer sticks to the top on phones, so it doesn't cover the content.

### Iteration 1 — initial release (v0.1.0)
- Project set up: React + TypeScript + Vite, Vitest, offline service worker, PWA manifest and icon.
- Poker engine: 7-card evaluator, Monte Carlo/exact equity, betting-range model, threats, nuts, outs, starting-hand tiers, full No-Limit betting engine with blinds, raises, all-ins and showdowns, and bot opponents with four personalities.
- Play & Train table: animated dealing, live odds panel, equity-by-street chart, hindsight reveal and per-decision grading, session stats, keyboard shortcuts.
- Live AI coach: "why did you do that?" prompt with reason chips and free text, graded feedback with numbers, hint button.
- Hand Review: card-picker hand builder (your cards, board, the hand that beat you, per-street actions, pot sizes and reasoning), street-by-street coach walkthrough, hindsight equity, offline chat follow-ups, example hand, draft saved locally.
- Optional Claude coach for open-ended chat (streaming, grounded in engine numbers, falls back to the offline coach).
- Settings: opponents, opponent style, coach mode, odds visibility, simulation accuracy, table speed, Claude key.
- 34 unit tests covering the evaluator, equity, outs, the betting engine (chip conservation over 1,500 simulated hands), the coach and the review chat.
