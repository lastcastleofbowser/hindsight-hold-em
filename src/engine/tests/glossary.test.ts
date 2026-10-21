import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '../../content/glossary';
import { CATEGORY_NAMES } from '../evaluator';

describe('glossary', () => {
  it('links each phrase to exactly one term', () => {
    const phrases = GLOSSARY.flatMap((e) => e.match);
    expect(new Set(phrases).size).toBe(phrases.length);
    for (const p of phrases) expect(p).toBe(p.toLowerCase());
  });

  it('defines every hand ranking', () => {
    const terms = GLOSSARY.map((e) => e.term.toLowerCase());
    for (const name of CATEGORY_NAMES) expect(terms).toContain(name.toLowerCase());
  });
});
