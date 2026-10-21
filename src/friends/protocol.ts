import type { GameState, PlayerAction } from '../engine/game';

/**
 * Messages between the Friends tab and the game server (server/index.ts),
 * plus the account/profile shapes returned by the HTTP API. Shared by both
 * sides so they can't drift apart.
 */

export type ClientMessage =
  /** First message on every connection: the session token from logging in. */
  | { t: 'auth'; token: string }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'deal' }
  | { t: 'act'; hand: number; action: PlayerAction }
  | { t: 'rebuy' }
  | { t: 'leave' };

export interface MemberView {
  id: string;
  name: string;
  connected: boolean;
  /** Left the table (cashed out). Still listed so the scoreboard stays complete. */
  left: boolean;
  chips: number;
  /** Total chips bought in, including the first buy-in and every rebuy. */
  boughtIn: number;
  buyIns: number;
  /** chips − boughtIn: overall winnings (positive) or losses (negative). */
  net: number;
  /** Hands won outright (a split counts as a share). */
  handsWon: number;
  handsPlayed: number;
}

export interface TableEvent {
  at: number;
  text: string;
}

/**
 * A game as one player may see it: the deck is never sent, and other
 * players' hole cards are hidden (as -1) until the hand is over.
 */
export type GameView = Omit<GameState, 'deck'> & { deck: [] };

export interface RoomView {
  code: string;
  hostId: string;
  hostName: string;
  youId: string;
  members: MemberView[];
  /** memberId for each seat in the current hand. */
  seats: string[];
  game: GameView | null;
  /** Seconds left for the player to act, if a hand is running. */
  turnSeconds: number | null;
  handsDealt: number;
  buyIn: number;
  bigBlind: number;
  /** Buy-ins, rebuys and departures, newest last. */
  events: TableEvent[];
}

export type ServerMessage =
  | { t: 'authed'; username: string }
  | { t: 'welcome'; code: string }
  | { t: 'room'; room: RoomView }
  | { t: 'error'; message: string; reason?: 'auth' | 'no-table' };

// ---------------------------------------------------------------------------
// HTTP API (accounts and history)
// ---------------------------------------------------------------------------

export interface AccountUser {
  id: number;
  username: string;
}

export interface AuthResponse {
  user: AccountUser;
  token: string;
}

export interface ProfileGame {
  id: number;
  code: string;
  startedAt: number;
  endedAt: number | null;
  chips: number;
  boughtIn: number;
  net: number;
  buyIns: number;
  handsPlayed: number;
  handsWon: number;
  /** Everyone at that table, with their result. */
  players: { username: string; net: number }[];
}

export interface Profile {
  username: string;
  memberSince: number;
  totals: {
    games: number;
    handsPlayed: number;
    handsWon: number;
    net: number;
    buyIns: number;
    bestGame: number | null;
    worstGame: number | null;
  };
  /** Newest first. */
  games: ProfileGame[];
  /** Cumulative net chips after each game, oldest first (for the progress chart). */
  progression: { gameId: number; at: number; net: number; cumulative: number }[];
}

export const MAX_PLAYERS = 6;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const HIDDEN_CARD = -1;

export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}
