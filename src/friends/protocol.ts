import type { GameState, PlayerAction } from '../engine/game';

/**
 * Messages between the Friends tab and the game server (server/index.ts).
 * Shared by both sides so they can't drift apart.
 */

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string; token?: string }
  | { t: 'deal' }
  | { t: 'act'; hand: number; action: PlayerAction }
  | { t: 'leave' };

export interface MemberView {
  id: string;
  name: string;
  connected: boolean;
  /** Hands won (a split pot counts as half). */
  score: number;
}

/**
 * A game as one player may see it: the deck is never sent, and other
 * players' hole cards are hidden (as -1) until the hand is over.
 */
export type GameView = Omit<GameState, 'deck'> & { deck: [] };

export interface RoomView {
  code: string;
  hostId: string;
  youId: string;
  members: MemberView[];
  /** memberId for each seat in the current hand. */
  seats: string[];
  game: GameView | null;
  /** Seconds left for the player to act, if a hand is running. */
  turnSeconds: number | null;
}

export type ServerMessage =
  | { t: 'welcome'; code: string; memberId: string; token: string }
  | { t: 'room'; room: RoomView }
  | { t: 'error'; message: string };

export const MAX_PLAYERS = 6;
export const MAX_NAME = 16;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const HIDDEN_CARD = -1;

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_NAME);
  return name.length ? name : null;
}

export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}
