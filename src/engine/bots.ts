import { bettingRange, calculateEquity, requiredEquity, startingHand } from './analysis';
import { type BotStyle, type GameState, type PlayerAction, activePlayers, legalActions, potSize } from './game';

interface StyleProfile {
  /** Extra equity a bot tolerates below pot odds before folding (looser = higher). */
  callSlack: number;
  /** Relative strength (equity ÷ fair share) needed to bet or raise for value. */
  valueStrength: number;
  /** Probability of bluffing when checked to. */
  bluff: number;
  /** Pre-flop Chen score needed to continue facing a raise. */
  preflopContinue: number;
  /** Pre-flop Chen score needed to open-raise. */
  preflopRaise: number;
}

const STYLES: Record<BotStyle, StyleProfile> = {
  tight: { callSlack: -0.03, valueStrength: 1.6, bluff: 0.04, preflopContinue: 9, preflopRaise: 9 },
  balanced: { callSlack: 0.02, valueStrength: 1.45, bluff: 0.1, preflopContinue: 7, preflopRaise: 8 },
  loose: { callSlack: 0.08, valueStrength: 1.4, bluff: 0.12, preflopContinue: 5, preflopRaise: 8 },
  aggressive: { callSlack: 0.04, valueStrength: 1.25, bluff: 0.22, preflopContinue: 6, preflopRaise: 6 },
};

export const BOT_STYLE_LABELS: Record<BotStyle, string> = {
  tight: 'Tight (Rock)',
  balanced: 'Balanced (TAG)',
  loose: 'Loose (Calling station)',
  aggressive: 'Aggressive (Maniac)',
};

const MAX_RAISES_PER_STREET = 4;

/**
 * Bots only see their own cards; they estimate equity against random hands
 * and then apply a personality. Good enough to give learners realistic spots
 * without being exploitable in obvious ways.
 */
export function decideBotAction(s: GameState, rng: () => number = Math.random): PlayerAction {
  const me = s.players[s.toAct];
  const style = STYLES[me.style];
  const legal = legalActions(s);
  const pot = potSize(s);
  const toCall = legal.callAmount;
  const opponents = activePlayers(s).length - 1;
  const raiseCapped = s.raisesThisStreet >= MAX_RAISES_PER_STREET;
  const passive = (): PlayerAction => ({ type: legal.canCheck ? 'check' : 'call' });
  const sized = (fraction: number): number => {
    const target = s.currentBet === 0 ? pot * fraction : s.currentBet + (pot + toCall) * fraction;
    return Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(target / s.bigBlind) * s.bigBlind));
  };
  const aggressive = (fraction: number): PlayerAction => {
    if (legal.canBet) return { type: 'bet', to: sized(fraction) };
    if (legal.canRaise && !raiseCapped) return { type: 'raise', to: sized(fraction) };
    return passive();
  };

  if (s.street === 'preflop') {
    const { chen } = startingHand(me.hole);
    const facingRaise = s.currentBet > s.bigBlind;
    const noise = (rng() - 0.5) * 2;
    if (chen + noise >= 12 && !raiseCapped) return aggressive(0.9);
    if (!facingRaise) {
      if (chen + noise >= style.preflopRaise) return aggressive(0.75);
      if (legal.canCheck) return { type: 'check' };
      if (chen + noise >= style.preflopContinue - 2) return { type: 'call' };
      return { type: 'fold' };
    }
    const priceOk = toCall <= me.stack * 0.15 || chen >= 10;
    if (chen + noise >= style.preflopContinue && priceOk) return { type: 'call' };
    return { type: 'fold' };
  }

  const { equity } = calculateEquity({ hero: me.hole, board: s.board, opponents, iterations: 500, rng });
  const fairShare = 1 / (opponents + 1);
  const strength = equity / fairShare;

  if (toCall === 0) {
    if (strength >= style.valueStrength) return aggressive(0.5 + rng() * 0.3);
    if (rng() < style.bluff / opponents) return aggressive(0.5);
    return { type: 'check' };
  }

  // Bettors hold better than random hands, so judge the call against a betting range.
  const realistic = calculateEquity({ hero: me.hole, board: s.board, opponents, iterations: 400, rng, opponentFilter: bettingRange(s.board) }).equity;
  const needed = requiredEquity(toCall, pot);
  if (strength >= style.valueStrength + 0.5 && rng() < 0.6) return aggressive(0.7);
  if (realistic + style.callSlack >= needed) return { type: 'call' };
  return { type: 'fold' };
}
