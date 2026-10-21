/**
 * Texas Hold'em glossary. Entries power the hover/tap definitions on terms
 * in coach text and the searchable glossary in the Learn tab.
 *
 * `match` lists the phrases that get auto-linked in text (lowercase). Common
 * verbs like "call" and "bet" are left unlinked to avoid clutter; they still
 * appear in the glossary.
 */

export type GlossaryGroup = 'The game' | 'Actions' | 'Hands' | 'Odds & maths' | 'Strategy';

export interface GlossaryEntry {
  term: string;
  group: GlossaryGroup;
  definition: string;
  match: string[];
}

export const GLOSSARY: GlossaryEntry[] = [
  // The game
  { term: "Texas Hold'em", group: 'The game', match: ["texas hold'em", 'hold’em', "hold'em"], definition: 'The most popular poker game. Each player gets 2 private cards and shares 5 community cards; the best five-card hand from those seven wins.' },
  { term: 'Hole cards', group: 'The game', match: ['hole cards', 'hole card'], definition: 'Your two private cards, dealt face down. Only you can see them.' },
  { term: 'Board', group: 'The game', match: ['board', 'community cards', 'community card'], definition: 'The five shared cards in the middle of the table (the flop, turn and river). Everyone can use them.' },
  { term: 'Betting round', group: 'The game', match: ['betting round', 'round', 'rounds', 'street', 'streets'], definition: 'One of the four chances to bet: pre-flop, flop, turn and river. Experienced players often call a betting round a "street".' },
  { term: 'Pre-flop', group: 'The game', match: ['pre-flop', 'preflop'], definition: 'The first betting round, after everyone gets their two hole cards but before any community cards are dealt.' },
  { term: 'Flop', group: 'The game', match: ['flop'], definition: 'The first three community cards, dealt together, followed by the second betting round.' },
  { term: 'Turn', group: 'The game', match: ['turn'], definition: 'The fourth community card, followed by the third betting round.' },
  { term: 'River', group: 'The game', match: ['river'], definition: 'The fifth and last community card, followed by the final betting round.' },
  { term: 'Showdown', group: 'The game', match: ['showdown'], definition: 'After the last bet, the remaining players reveal their cards and the best five-card hand wins the pot.' },
  { term: 'Pot', group: 'The game', match: [], definition: 'All the chips bet so far in the current hand. The winner takes the pot.' },
  { term: 'Blinds', group: 'The game', match: ['big blind', 'small blind', 'blinds'], definition: 'Forced bets posted before the cards are dealt so there is always something to play for. The big blind is usually twice the small blind.' },
  { term: 'Button', group: 'The game', match: ['dealer button'], definition: 'The "D" disc marking the dealer position. It moves one seat left each hand; the button acts last after the flop.' },
  { term: 'Under the gun', group: 'The game', match: ['under the gun', 'utg'], definition: 'The seat to the left of the big blind (UTG). It acts first before the flop, with everyone else still to act behind — so play only strong hands there.' },
  { term: 'Middle position', group: 'The game', match: ['middle position'], definition: 'Seats between under the gun and the cutoff (MP). Some players act after you, so be fairly selective.' },
  { term: 'Cutoff', group: 'The game', match: ['cutoff'], definition: 'The seat just to the right of the dealer button (CO). Only the button and blinds act after it, so you can play more hands here.' },
  { term: 'Heads-up', group: 'The game', match: ['heads-up', 'heads up'], definition: 'Only two players left in the hand.' },
  { term: 'Split pot', group: 'The game', match: ['split pot', 'split the pot', 'pot is split', 'chop'], definition: 'When two or more players have exactly the same best five cards, they share the pot equally.' },
  { term: 'Suited / offsuit', group: 'The game', match: ['suited', 'offsuit'], definition: 'Hole cards of the same suit are "suited" (written AKs); different suits are "offsuit" (AKo).' },

  // Actions
  { term: 'Check', group: 'Actions', match: [], definition: 'Pass without betting. Only allowed when nobody has bet in this round.' },
  { term: 'Bet', group: 'Actions', match: [], definition: 'Put chips in when nobody else has bet yet in this round.' },
  { term: 'Call', group: 'Actions', match: [], definition: 'Match the current bet to stay in the hand.' },
  { term: 'Raise', group: 'Actions', match: [], definition: 'Increase the current bet. Other players must call the new amount, raise again, or fold.' },
  { term: 'Fold', group: 'Actions', match: [], definition: 'Give up your hand and any chips you already put in. You cannot win the pot after folding.' },
  { term: 'All-in', group: 'Actions', match: ['all-in', 'all in'], definition: 'Betting every chip you have left.' },

  // Hands
  { term: 'High card', group: 'Hands', match: ['high card'], definition: 'No pair or better: your highest card plays, then the next highest, and so on.' },
  { term: 'Pair', group: 'Hands', match: [], definition: 'Two cards of the same rank.' },
  { term: 'Top pair', group: 'Hands', match: ['top pair'], definition: 'A pair made with the highest card on the board, e.g. holding a King on a K-9-4 board.' },
  { term: 'Overpair', group: 'Hands', match: ['overpair'], definition: 'A pocket pair higher than every card on the board, e.g. Queens on a J-7-3 board.' },
  { term: 'Two pair', group: 'Hands', match: ['two pair'], definition: 'Two different pairs, e.g. Kings and Sevens.' },
  { term: 'Three of a kind', group: 'Hands', match: ['three of a kind', 'trips'], definition: 'Three cards of the same rank. A "set" uses a pocket pair plus one board card; "trips" uses one hole card plus a pair on the board.' },
  { term: 'Straight', group: 'Hands', match: ['straight'], definition: 'Five cards in a row of any suits, e.g. 8-9-10-J-Q. An Ace can be high (10-J-Q-K-A) or low (A-2-3-4-5).' },
  { term: 'Flush', group: 'Hands', match: ['flush'], definition: 'Any five cards of the same suit. A flush beats a straight.' },
  { term: 'Full house', group: 'Hands', match: ['full house'], definition: 'Three of a kind plus a pair. Compare the three-of-a-kind part first.' },
  { term: 'Four of a kind', group: 'Hands', match: ['four of a kind', 'quads'], definition: 'All four cards of one rank.' },
  { term: 'Straight flush', group: 'Hands', match: ['straight flush'], definition: 'Five cards in a row, all of the same suit.' },
  { term: 'Royal flush', group: 'Hands', match: ['royal flush'], definition: "A-K-Q-J-10 all of the same suit — the best possible hand in Texas Hold'em." },
  { term: 'Kicker', group: 'Hands', match: ['kicker', 'kickers'], definition: 'A side card that breaks ties between hands of the same type. With A-K vs A-Q on an A-7-2 board, both have a pair of Aces, and the King kicker wins.' },
  { term: 'The nuts', group: 'Hands', match: ['the nuts', 'nuts'], definition: 'The best possible hand given the community cards. If you have the nuts, nobody can beat you.' },
  { term: 'Board plays', group: 'Hands', match: ['the board plays'], definition: 'When the best five cards are all on the board, so nobody’s hole cards improve on it and everyone left splits the pot.' },

  // Odds & maths
  { term: 'Equity', group: 'Odds & maths', match: ['equity', 'win chance'], definition: 'Your share of the pot if the hand were played out many times — basically your chance of winning. 40% equity means you win about 4 times in 10.' },
  { term: 'Even share', group: 'Odds & maths', match: ['even share', 'fair share'], definition: 'The equity you would have if every hand were equally strong: 50% against one opponent, 33% against two, 25% against three.' },
  { term: 'Pot odds', group: 'Odds & maths', match: ['pot odds'], definition: 'The price of a call compared with what you can win. To break even you need equity of at least: call ÷ (pot + call). Calling 10 into a pot of 30 needs 10 ÷ 40 = 25%.' },
  { term: 'Outs', group: 'Odds & maths', match: ['outs'], definition: 'Unseen cards that would improve your hand to (probably) the best hand. Nine hearts left when you hold four hearts = 9 outs to a flush.' },
  { term: 'Rule of 4 and 2', group: 'Odds & maths', match: ['rule of 4', 'rule of thumb'], definition: 'Quick odds: on the flop, outs × 4 ≈ your % to hit by the river; on the turn, outs × 2 ≈ your % to hit on the river. 9 outs on the flop ≈ 36% (exact: 35%).' },
  { term: 'Combos', group: 'Odds & maths', match: ['combos', 'combinations', 'possible holdings'], definition: 'The number of distinct two-card hands that make something. A specific pair like Aces has 6 combos; a specific non-pair like A-K has 16.' },
  { term: 'Implied odds', group: 'Odds & maths', match: ['implied odds'], definition: 'Extra chips you expect to win later if you hit your draw. They can justify a call that pot odds alone do not.' },
  { term: 'Hindsight equity', group: 'Odds & maths', match: ['hindsight'], definition: "Your real chance of winning against the cards your opponents actually held — only knowable after the hand. Good decisions are judged on what you knew at the time, not on hindsight." },
  { term: 'Chen score', group: 'Odds & maths', match: ['chen score'], definition: 'A quick formula for rating two-card starting hands. Higher is better: 12+ is premium, under 5 is weak.' },

  // Strategy
  { term: 'Draw', group: 'Strategy', match: ['draw', 'drawing', 'draws'], definition: 'A hand that is not made yet but could become strong with the right card, e.g. four cards to a flush.' },
  { term: 'Flush draw', group: 'Strategy', match: ['flush draw'], definition: 'Four cards of one suit, needing one more for a flush. Usually 9 outs.' },
  { term: 'Straight draw', group: 'Strategy', match: ['straight draw', 'open-ended'], definition: 'Four cards towards a straight. Open-ended (e.g. 8-9-10-J, either end completes it) has 8 outs.' },
  { term: 'Gutshot', group: 'Strategy', match: ['gutshot'], definition: 'A straight draw needing one specific rank in the middle (e.g. 8-9-J-Q needs a 10). 4 outs.' },
  { term: 'Value bet', group: 'Strategy', match: ['for value', 'value bet', 'value'], definition: 'A bet made with a strong hand so that worse hands call and pay you.' },
  { term: 'Bluff', group: 'Strategy', match: ['bluff', 'bluffs', 'bluffing'], definition: 'A bet with a weak hand to make better hands fold.' },
  { term: 'Semi-bluff', group: 'Strategy', match: ['semi-bluff'], definition: 'A bluff with a draw: you might win immediately if they fold, and can still win by hitting your outs if called.' },
  { term: 'Range', group: 'Strategy', match: ['range'], definition: 'All the hands a player could have, given how they have played. Thinking in ranges beats guessing one exact hand.' },
  { term: 'Fold equity', group: 'Strategy', match: ['fold equity'], definition: 'The extra value a bet gets from the chance that opponents fold.' },
  { term: 'Position', group: 'Strategy', match: ['position'], definition: 'Where you act in the betting order. Acting last ("in position") is an advantage: you see what others do first.' },
  { term: 'Cooler', group: 'Strategy', match: ['cooler'], definition: 'A strong hand losing to an even stronger one where the money goes in no matter how well you play.' },
  { term: 'Results-oriented thinking', group: 'Strategy', match: ['results-oriented'], definition: 'Judging a decision by whether you won the hand instead of whether it was right with the information you had. A good call can still lose.' },
];

/** Lowercase phrase → entry, for auto-linking. */
export const GLOSSARY_INDEX: Map<string, GlossaryEntry> = new Map(GLOSSARY.flatMap((e) => e.match.map((m) => [m, e] as const)));
