/**
 * Unit tests for anonymous-nickname util (anonymous-nickname.ts)
 * Génère un handle `username` automatique quand un participant anonyme rejoint
 * une conversation sans en fournir un. Le username est contraint ASCII par tout
 * le système, donc les accents sont repliés et un nom non-latin retombe sur une
 * base neutre au lieu d'un handle dégénéré.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { generateNickname } from '../../../utils/anonymous-nickname';

const FORMAT = /^[a-z]+_[a-z]{0,2}\d{3}$/;

describe('generateNickname — format', () => {
  it('produces a sanitizer-safe handle: base + underscore + up to 2 initials + 3-digit suffix', () => {
    expect(generateNickname('Jean', 'Dupont')).toMatch(FORMAT);
  });

  it('keeps the latin base and last-name initials (behavior preserved)', () => {
    expect(generateNickname('Jean', 'Dupont')).toMatch(/^jean_du\d{3}$/);
  });

  it('lower-cases and only exposes ASCII letters + digits + underscore', () => {
    const handle = generateNickname('ALICE', 'Martin');
    expect(handle).toMatch(/^alice_ma\d{3}$/);
  });
});

describe('generateNickname — accent folding (José → jose, not jos)', () => {
  it('folds diacritics on the first name instead of dropping the accented letter', () => {
    expect(generateNickname('José', 'Nlomé')).toMatch(/^jose_nl\d{3}$/);
  });

  it('folds diacritics on the last-name initials', () => {
    expect(generateNickname('Renee', 'Éric')).toMatch(/^renee_er\d{3}$/);
  });
});

describe('generateNickname — non-latin names never yield a degenerate handle', () => {
  it('falls back to the neutral base for a Cyrillic first name (no leading "_")', () => {
    const handle = generateNickname('Иван', 'Петров');
    expect(handle).toMatch(/^user_\d{3}$/);
    expect(handle.startsWith('_')).toBe(false);
  });

  it('falls back to the neutral base for CJK and Arabic first names', () => {
    expect(generateNickname('太郎', '山田')).toMatch(/^user_\d{3}$/);
    expect(generateNickname('محمد', 'علي')).toMatch(/^user_\d{3}$/);
  });

  it('keeps a latin first name even when the last name is entirely non-latin', () => {
    expect(generateNickname('Jean', 'Петров')).toMatch(/^jean_\d{3}$/);
  });
});
