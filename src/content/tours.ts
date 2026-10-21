/**
 * Tutorial-mode tours. Each step spotlights the element marked with a
 * matching `data-tour="…"` attribute. Steps whose element isn't on screen
 * are shown as a centred card instead, so a tour never gets stuck.
 */

export interface TourStep {
  target?: string;
  title: string;
  body: string;
}

export type TourId =
  | 'play-intro'
  | 'play-decision'
  | 'play-postflop'
  | 'play-why'
  | 'play-feedback'
  | 'play-summary'
  | 'beginner'
  | 'review'
  | 'review-chat'
  | 'quiz'
  | 'quiz-flop'
  | 'learn'
  | 'ranges'
  | 'friends'
  | 'settings';

export const TOURS: Record<TourId, TourStep[]> = {
  'play-intro': [
    { title: "Welcome to Hindsight Hold'em", body: "This quick tour shows you around. You can turn tutorial mode off any time in Settings, or skip a tour with the Skip button." },
    { target: 'tabs', title: 'The sections', body: 'Play & Train is the full table with live odds. Beginner is a calmer table where a coach talks you through every hand. Hand Review rebuilds a hand you played. Which Hand Wins? trains hand reading. Ranges shows which hands to play from each seat. Friends lets you play the same hand with friends online. Learn has the rules, rankings and glossary.' },
    { target: 'deal-button', title: 'Start a hand', body: 'Press this to sit down at the table. The tour continues when it is your turn to act.' },
    { target: 'tour-button', title: 'Replay a tour', body: 'While tutorial mode is on, this button replays the tour for whatever you are looking at.' },
    { target: 'settings-button', title: 'Settings', body: 'Change the number of opponents, the coach style, tutorial mode and more. Remember to press Save.' },
  ],
  'play-decision': [
    { target: 'session-stats', title: 'Your session', body: 'Hand number, chips won or lost this session, and how many of your decisions the coach rated as good.' },
    { target: 'table', title: 'The table', body: 'Every player gets two private cards. Up to five shared cards are dealt in the middle. Each seat shows the player\'s name, position, chips and last action.' },
    { target: 'position', title: 'Your position', body: 'This badge shows your seat: Dealer (BTN), Small blind (SB), Big blind (BB), Under the gun (UTG), Middle position (MP) or Cutoff (CO). It moves one seat each hand. Hover it for an explanation — acting later is an advantage.' },
    { target: 'hero-seat', title: 'Your cards', body: 'Your two hole cards. The green label underneath names the best hand you currently have.' },
    { target: 'pot', title: 'Betting round and pot', body: 'Which betting round it is (pre-flop, flop, turn, river) and how many chips are in the pot.' },
    { target: 'action-bar', title: 'Your actions', body: 'Fold gives up the hand. Check passes for free (when nobody has bet). Call matches a bet. Bet/Raise puts in more — choose the size with the quick buttons or the slider. Keyboard: F, C, B/R.' },
    { target: 'coach-panel', title: 'The coach', body: 'Press Hint before you act to see what the coach would do. After you act, the coach asks why — then grades your decision.' },
    { target: 'equity', title: 'Your chance to win', body: 'This big percentage is your "equity": how often you would win the pot if the hand were played out many times against random hands. 40% means about 4 times in 10.' },
    { target: 'meter', title: 'The meter and its marks', body: 'The bar fills to your win chance. The white mark is an "even share" (50% against one player, 33% against two…). When someone has bet, an orange mark shows the win chance you need to make calling worthwhile.' },
    { target: 'odds-rows', title: 'Win, split and pot odds', body: '"Win outright / split" separates clean wins from ties. "Needed to call" is the pot odds: call ÷ (pot + call). If your win chance is above it, calling makes money in the long run.' },
    { target: 'starting-hand', title: 'Starting hand', body: 'Before the flop, your two cards are rated from Premium to Weak. The Ranges tab shows exactly which hands to raise from each seat.' },
    { target: 'final-hand', title: 'Your final hand by the river', body: 'How likely you are to finish with each hand type once all five shared cards are out.' },
    { target: 'chart', title: 'Win chance by round', body: 'This graph tracks your win chance at each betting round: pre-flop, flop, turn, river. After the hand a dashed gold line appears showing your real chance against the cards opponents actually held — that is the "hindsight".' },
  ],
  'play-postflop': [
    { target: 'board', title: 'The flop is out', body: 'Three shared cards. Everyone combines them with their own two cards — the odds panel has updated to match.' },
    { target: 'right-now', title: 'Right now', body: 'Your current hand, the chance someone already beats you, and which hand types (and how many card combinations) do. "Best possible hand" is the nuts on this board.' },
    { target: 'outs', title: 'Outs', body: 'Unseen cards that would improve your hand, with the chance of hitting one on the next card and by the river.' },
    { target: 'reads', title: 'Reading the table', body: 'What each opponent\'s actions suggest they hold — a big bet usually means very strong or a bluff; checking usually means weak. Your win chance here is measured against those likely hands, not random cards.' },
    { target: 'chart', title: 'The graph moves', body: 'A new point shows your win chance on the flop. Watch how it rises and falls as the turn and river arrive.' },
  ],
  'play-why': [
    { target: 'why-prompt', title: 'Why did you do that?', body: 'Pick one or more reasons, or type your own in plain words. The coach compares your reasoning with the numbers. Press Skip if you just want the grade.' },
  ],
  'play-feedback': [
    { target: 'verdict', title: 'The grade', body: 'Great decision, Reasonable, Questionable or Mistake — judged only on what you could know at the time, not on how the cards fell.' },
    { target: 'plain-english', title: 'Plain English', body: 'The same advice in everyday words, e.g. "you win about 3 times in 10, and calling only needs 2 in 10". Turn this off in Settings if you prefer just the numbers.' },
    { target: 'feedback-points', title: 'The numbers behind it', body: 'Equity (your win chance) and the "even share" it is compared with; pot odds (what you needed to call); the chance someone is already ahead; and your outs. Hover any underlined word for a definition.' },
    { target: 'reason-reply', title: 'Your reasoning', body: 'The coach answers what you said — for example, whether your "bluff" was really a value bet, or whether you were right to be worried.' },
    { target: 'continue', title: 'Carry on', body: 'The table waits while you read. Press Continue to let the other players act.' },
  ],
  'play-summary': [
    { target: 'summary-result', title: 'Hand result', body: 'Chips won or lost this hand and who took the pot. Stacks reset each hand, so every hand is a fresh lesson.' },
    { target: 'showdown-check', title: 'Why this result?', body: 'When cards are shown, each player\'s best five cards are listed with the reason one hand beats the other.' },
    { target: 'read-check', title: 'Read check', body: 'Were their bets honest? For every opponent who bet, see whether the bet meant a real hand, a draw (semi-bluff) or nothing at all (bluff).' },
    { target: 'hindsight-cards', title: 'Hindsight', body: 'Everyone\'s cards are revealed after the hand — including players who folded — so you can see what you were really up against.' },
    { target: 'decision-list', title: 'Your decisions', body: 'Each decision with its grade, your win chance at the time, and your hindsight win chance against their real cards.' },
    { target: 'chart', title: 'What you knew vs. hindsight', body: 'Solid blue: your win chance against random hands (what you could know). Dashed gold: against the cards they really held. Big gaps between the two are luck — judge yourself on the blue line.' },
    { target: 'discuss', title: 'Discuss with coach', body: 'Opens this hand in the Hand Review chat so you can ask follow-up questions.' },
    { target: 'next-hand', title: 'Next hand', body: 'Deal the next hand. The dealer button moves one seat, so your position changes.' },
  ],
  beginner: [
    { title: 'Beginner table', body: 'A calmer table against two opponents. The coach talks you through each decision in everyday words and suggests a move — you are always free to choose something else.' },
    { target: 'beginner-coach', title: 'Your coach', body: 'Before each decision the coach explains what your cards mean, what your seat means, and what to watch out for on the board.' },
    { target: 'beginner-strength', title: 'Hand strength', body: 'A simple meter from Very weak to Very strong, based on how often your hand wins against these players.' },
    { target: 'beginner-actions', title: 'Choose your move', body: 'The coach\'s suggestion is marked. After you choose, you get one or two sentences of feedback and the table waits until you press Continue.' },
  ],
  review: [
    { target: 'review-examples', title: 'Try an example', body: 'Load a ready-made hand to see how a review works: "bluff" walks through a missed draw, "who won?" checks a disputed showdown.' },
    { target: 'review-slots', title: 'Set up the cards', body: 'Click a slot, then pick a card from the grid below. Add your two cards, the board (flop, turn, river) and — if you saw them — your opponent\'s cards.' },
    { target: 'review-result-field', title: 'What happened?', body: 'Tell the coach whether you won or lost. If that contradicts the rules, the coach will say so and explain who should have won.' },
    { target: 'review-rounds', title: 'Each betting round', body: 'For every round you played: your action, the pot, the bet you faced, and why you did it. Amounts are in big blinds.' },
    { target: 'review-analyse', title: 'Analyse', body: 'The coach walks through every decision, checks the showdown and opens the chat for questions.' },
  ],
  'review-chat': [
    { target: 'review-chat', title: 'Coach chat', body: 'Your hand, round by round: a grade, the numbers, a reply to your reasoning and the hindsight view. Scroll down for the showdown check and summary.' },
    { target: 'review-suggestions', title: 'Ask questions', body: 'Tap a suggestion or type your own, e.g. "how many outs did I have on the flop?" or "who should have won?".' },
  ],
  quiz: [
    { target: 'quiz-controls', title: 'Which hand wins?', body: 'Choose how many players, what to practise, and whether to start on the flop to learn about win chances. Your score and streak are saved.' },
    { target: 'quiz-cards', title: 'Read every hand', body: 'All hands are face up. Each player uses their two cards plus the five shared cards to make their best five-card hand.' },
    { target: 'quiz-question', title: 'Answer and justify', body: 'Pick the winner, name the winning hand type and explain why in a sentence. The coach checks your reasoning too — for example if you spot a flush that isn\'t there.' },
  ],
  'quiz-flop': [
    { target: 'quiz-equity', title: 'Ahead now vs. winning later', body: 'These bars are each player\'s exact chance to win by the river, counted over every possible turn and river. The player behind can still win with their "outs" — compare the quick rule of 4 with the exact number.' },
  ],
  ranges: [
    { target: 'range-chart', title: 'Pre-flop ranges', body: 'Pick a seat to see which starting hands to raise when everyone has folded to you. Green = raise, grey = fold (and blue = call for the big blind). Pairs run down the diagonal, suited hands above it, offsuit below.' },
    { target: 'range-drill', title: 'Range drill', body: 'Get a seat and a hand, decide raise or fold, and see the chart. Your score and streak are saved.' },
  ],
  friends: [
    { title: 'Play with friends', body: 'The only online part of the app. One person creates a table and sends the 6-character code; friends join with it. Everyone plays the same hand with the same flop, turn and river.' },
    { target: 'friends-lobby', title: 'Create or join', body: 'Enter your name, then create a table or type the code a friend sent you.' },
  ],
  learn: [
    { target: 'learn-nav', title: 'Learn', body: 'Jump to the rules, the hand rankings, the equity and pot odds lesson with calculators, or the searchable glossary.' },
  ],
  settings: [
    { target: 'settings-save', title: 'Saving settings', body: 'Changes are not applied until you press Save changes. "✓ Settings saved" confirms they were stored in this browser; "● Unsaved changes" means they haven\'t been yet.' },
  ],
};
