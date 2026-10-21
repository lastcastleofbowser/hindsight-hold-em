import { useCallback, useEffect, useState } from 'react';
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
  accuracy: Accuracy;
  speed: Speed;
  claudeEnabled: boolean;
  apiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  opponents: 3,
  botStyle: 'mixed',
  coachMode: 'ask',
  showOdds: true,
  beginnerMode: true,
  accuracy: 'standard',
  speed: 'normal',
  claudeEnabled: false,
  apiKey: '',
};

export const ITERATIONS: Record<Accuracy, number> = { fast: 2500, standard: 6000, precise: 15000 };
export const BOT_DELAY_MS: Record<Speed, number> = { slow: 1400, normal: 800, fast: 350 };

const STORAGE_KEY = 'hindsight-holdem.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Storage can be unavailable (private mode, blocked site data) — defaults are fine.
  }
  return DEFAULT_SETTINGS;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Non-fatal: settings just won't persist.
    }
  }, [settings]);
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  return [settings, update] as const;
}
