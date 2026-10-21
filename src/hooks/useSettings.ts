import { useCallback, useState } from 'react';
import type { BotStyle } from '../engine/game';

export type CoachMode = 'ask' | 'feedback' | 'off';
export type Accuracy = 'fast' | 'standard' | 'precise';
export type Speed = 'slow' | 'normal' | 'fast';

export interface Settings {
  opponents: number;
  botStyle: BotStyle | 'mixed';
  /** ask = pause and ask "why?" after every action; feedback = grade silently; off = no coach. */
  coachMode: CoachMode;
  showOdds: boolean;
  /** Plain-English explanations alongside the coach's numbers. */
  beginnerMode: boolean;
  /** Guided tours that highlight each part of the app the first time it appears. */
  tutorial: boolean;
  accuracy: Accuracy;
  speed: Speed;
}

export const DEFAULT_SETTINGS: Settings = {
  opponents: 3,
  botStyle: 'mixed',
  coachMode: 'ask',
  showOdds: true,
  beginnerMode: true,
  tutorial: true,
  accuracy: 'standard',
  speed: 'normal',
};

export const ITERATIONS: Record<Accuracy, number> = { fast: 2500, standard: 6000, precise: 15000 };
export const BOT_DELAY_MS: Record<Speed, number> = { slow: 1400, normal: 800, fast: 350 };

export const SETTINGS_STORAGE_KEY = 'hindsight-holdem.settings.v1';

/** Keeps only known settings, so fields removed in later versions (e.g. an old API key) are dropped. */
export function sanitise(raw: Record<string, unknown>): Settings {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (key in raw && typeof raw[key] === typeof DEFAULT_SETTINGS[key]) (out as Record<string, unknown>)[key] = raw[key];
  }
  return out;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean = sanitise(parsed);
    // Iteration 1–2 could store an Anthropic API key; scrub it from storage.
    if ('apiKey' in parsed || 'claudeEnabled' in parsed) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    // Storage can be unavailable (private mode, blocked site data) — defaults are fine.
    return DEFAULT_SETTINGS;
  }
}

export type SaveResult = { ok: true } | { ok: false; message: string };

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  /**
   * Applies new settings and writes them to the browser, then reads them back
   * to confirm the save really happened.
   */
  const save = useCallback((next: Settings): SaveResult => {
    setSettings(next);
    try {
      const json = JSON.stringify(next);
      localStorage.setItem(SETTINGS_STORAGE_KEY, json);
      if (localStorage.getItem(SETTINGS_STORAGE_KEY) !== json) throw new Error('read-back mismatch');
      return { ok: true };
    } catch {
      return { ok: false, message: 'Applied for now, but this browser blocked saving — the changes will reset when you close the page.' };
    }
  }, []);

  return { settings, save };
}
