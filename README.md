# Hindsight Hold'em

Texas Hold'em hand analytics and probability app — an offline-first No-Limit **Texas Hold'em** trainer that shows live win probabilities, teaches beginners how to read hands, and has an AI coach that asks *"why did you do that?"* and explains where your logic held up or broke down.

> The app covers **Texas Hold'em only**: two private hole cards per player, five shared community cards (flop, turn, river), four betting rounds, and the best five-card hand from those seven wins.

> **Current version:** Iteration 3 (v0.3.0). See the [iteration log](#iteration-log) for what changed in each iteration.

---

## Features

The app has five tabs: **Play & Train**, **Beginner**, **Hand Review**, **Which Hand Wins?** and **Learn**. Everything runs in the browser and works offline.

### 1. Play & Train (gamified table)
- A clean poker-table UI (felt, rail, dealer button, chips) with cards dealt at random and animated onto the table.
- Play against 1–5 bot opponents with different styles: Tight, Balanced, Loose, Aggressive, or a mixed table.
- **Table positions** on every seat: Dealer (BTN), Small blind (SB), Big blind (BB), Under the gun (UTG), Middle position (MP) and Cutoff (CO). Hover a badge for what it means. Each seat's bet and last action sit inside the seat, so they never cover the position or dealer button.
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

### 2. The coach
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

### 3. Beginner (a simpler table with a talking coach)
- The same Texas Hold'em game, simplified: two balanced opponents, a slower pace, and no odds panel or charts.
- **Before every decision the coach talks you through it** in everyday words:
  - what your two cards mean, e.g. *"You have a Six and a Four of different suits — 'offsuit' (written 64o). Both are low cards… This is a weak starting hand."*;
  - what your seat means (dealer, blinds, under the gun);
  - what you have on the board and what to watch out for (e.g. three hearts on the board);
  - the price of a call in "times out of 10".

  It ends with a clear suggestion: *"I'd fold here."*
- The suggested button is marked **★ Coach's pick**, and every button says what it does ("Check — free, pass to the next player"). You can always choose something else.
- A simple **hand-strength meter** (Very weak → Very strong) replaces the percentages.
- After each move you get **one or two sentences** of feedback, and the table waits until you press Continue. At the end of the hand the coach says who won and why.
- It uses the same recommendation engine as Play & Train, so both tabs always agree on the right move.

### 4. Which Hand Wins? (hand-reading trainer)
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

### 5. Learn (beginner support)
- **Texas Hold'em in two minutes:** the rules, betting rounds and how the showdown works.
- **Hand rankings chart** from Royal Flush to High Card, with example cards and plain-English descriptions.
- **Equity & pot odds lesson** with a worked example, an **outs calculator** (exact chance vs rule of 4/2) and a **pot odds calculator**.
- **Searchable glossary** of about 60 Texas Hold'em terms.

### Beginner-friendly everywhere
- **Hover or tap any dotted-underlined term** (equity, outs, kicker, the nuts, pot odds, flush draw…) for a definition. Terms are auto-linked in coach feedback, chat messages, summaries and the odds panel.
- **Beginner explanations** (Settings, on by default): every piece of coach feedback also has a plain-English version, e.g. "you'd win about 4 times out of 10; calling pays off if you win more than 3 times out of 10".
- **Tutorial mode** (Settings, on by default): guided spotlight tours highlight each button and panel the first time it appears and explain what it does. That includes:
  - the action buttons and bet sizing;
  - the position badges;
  - every part of the odds panel (the win-chance %, the meter's even-share and pot-odds marks, win/split, pot odds, threats, outs);
  - the coach's grade, plain-English line and numbers;
  - the win-chance-by-round graph and its hindsight line.

  Tours run on every tab and in Settings. Use **Back/Next** (or the arrow keys) to move through a tour, **Skip** to leave it, **Turn off tutorial mode** to stop all tours, or the header's **Tour** button to replay the current screen's tour. Switching tutorial mode back on replays all tours.
- Jargon has been replaced where possible. The app says "betting round" or "round" instead of the insider term "street"; the glossary explains that players call a round a street.

### Settings that save
- Settings are edited as a draft. Nothing changes until you press **Save changes**.
- The save is confirmed by reading the stored value back, and the drawer shows **✓ Settings saved**, **● Unsaved changes**, or an error if the browser blocks storage.
- Closing with unsaved changes asks whether to save or discard them. **Reset to defaults** is available too.

### Offline-first
- All poker maths (hand evaluation, equity simulation, outs, nuts, coaching logic, quiz grading) runs in the browser. **No server is required.**
- A service worker precaches the whole app after the first visit, so it works with no connection. It can be installed as an app (PWA).
- There is no online component and no API key. The app makes no network requests after it loads.

---

## How AI is used

The coach is **not a large language model**. Since iteration 3 the app has no online AI at all; the optional Claude chat from iterations 1–2 was removed.

The built-in coach is an expert system written in TypeScript, not a trained model. It combines:
- exact hand evaluation;
- Monte Carlo simulation (thousands of random deals) to estimate equity;
- a modelled betting range for spots where you face a bet;
- poker rules of thumb (pot odds, value thresholds, starting-hand tiers).

The coach's sentences are templates written in the code and filled in with these numbers. Its "why did you do that?" replies come from matching your chosen reasons and keywords in your text. The bots use the same engine plus personality settings. Everything runs on the user's device, needs no internet, and gives the same answer for the same spot.

### Will it work on other computers?
- **Yes.** It's a static website that runs in any modern browser (Chrome, Edge, Safari, Firefox) on Windows, macOS, Linux, iOS or Android.
- To share it, deploy `dist/` to a web host (see below) and send the link; nothing needs installing. Alternatively, another developer can clone the repo and run `npm install && npm run dev` (Node.js 18+).
- After the first visit the service worker caches the app, so it keeps working offline on that device, and it can be installed like an app.
- **Per-device data:** settings, saved review drafts and quiz scores live in that browser's local storage. They don't sync between computers.

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
    beginnerCoach.ts    Beginner tab's conversational advice (cards, position, board, price) and one-line feedback
    review.ts           Hindsight review + showdown check (who should have won, reported-result mismatch)
    chat.ts             Offline chat coach + compact "hand facts" for the LLM
    quiz.ts             "Which Hand Wins?" deal generator, flop equity lesson, grading of answers and reasoning
    tests/              Unit tests (Vitest) for all of the above
  content/glossary.ts   Glossary entries used for hover definitions and the Learn tab
  content/tours.ts      Tutorial-mode tour steps (each targets a data-tour="…" element)
  hooks/                useGame (table state machine + bot timing), useSettings (draft/save/verify), useOnline
  components/           Table, cards, action bar, odds panel, chart, coach panel, hand summary,
                        review builder, chat, quiz, learn, beginner table, glossary terms (Term.tsx),
                        tutorial tours (Tour.tsx), settings
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
Tests live in `src/engine/tests/` and run with `npm test`. They are TypeScript (`*.test.ts`) to match the rest of the codebase. There are 62 tests covering:
- evaluator: all 10 categories, the Royal Flush, kickers, the wheel;
- equity, outs and the betting-range model;
- the betting engine: chip conservation over 1,500 simulated hands;
- the coach;
- the showdown check, including a regression test for A-K making a straight against Q-3;
- hand-comparison explanations;
- quiz generation and grading;
- glossary integrity;
- table positions (checked against who actually posts the blinds);
- the beginner coach, including the 4-6 offsuit example;
- settings clean-up, including removal of old API keys.

---

## Known limitations
- Stacks reset to 100 big blinds every hand. Equal stacks mean there is never a side pot, so side pots are not implemented yet.
- The coach doesn't yet consider table position, stack-to-pot ratio, or opponents' betting history across rounds.
- Bots are simple equity-plus-personality players, not game-theory-optimal opponents.
- Hand Review records one decision per betting round (enter the most important one) and one known opponent hand.
- The quiz grades written reasoning with keyword checks (hand names, kickers), not full language understanding.
- The chat coach only understands the question types it was written for (outs, pot odds, who won, what to do in a round, the nuts, equity). Free-form questions get a list of what it can answer.
- Position badges are informational: the coach's advice mentions your seat in the Beginner tab, but recommendations don't yet change by position.
- At phone width, the side seats sit close to the community cards.

---

## Iteration log

### Iteration 3 — positions, Beginner tab, tutorial mode, saved settings (v0.3.0)
- **Positions shown on every seat:** Dealer, SB, BB, UTG, MP and CO badges with hover definitions, plus new glossary entries. Bets and last actions moved inside each seat so they no longer cover positions or the dealer button.
- **New Beginner tab:** a simplified table (2 opponents, slower, no odds panel) where the coach talks the player through each decision in plain words. It covers what the hole cards mean, the seat, the board and the price of a call, then ends with a clear suggestion. The suggested move is marked on the buttons, there's a simple strength meter, and feedback is one line after each move. Play & Train is unchanged.
- **Removed the optional Claude / personal API key feature:**
  - the SDK dependency, settings fields, online chat path and prompts are gone;
  - any key left in a browser's storage from iteration 2 is wiped on load;
  - the app is now fully offline with no network calls.
- **Settings save:** settings are edited as a draft with an explicit **Save changes** button. The save is verified by reading it back, with "✓ Settings saved" / "● Unsaved changes" status, a save-or-discard prompt on close, and Reset to defaults.
- **Tutorial mode** (toggle in Settings): spotlight tours that highlight each button and panel and explain it. They cover the percentages, meter marks, pot odds, coach feedback and the win-chance graph, across every tab and Settings. Tours can be replayed, skipped or turned off from inside a tour. On phones the tour card is a bottom sheet and the page scrolls so the highlighted part stays visible.
- Tests grew from 54 to 62.

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
