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
import { automaticNickname, generateGuestNickname, generateNickname } from '../../../utils/anonymous-nickname';
import { GUEST_NICKNAME_ADJECTIVES, GUEST_NICKNAME_NOUNS } from '../../../utils/anonymous-nickname-words';
import { SecuritySanitizer } from '../../../utils/sanitize';

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

describe('generateGuestNickname — un invité qui n\'a rien saisi est nommé par la passerelle', () => {
  it('compose un adjectif, un nom et un nombre de 3 à 5 chiffres', () => {
    const drawn = Array.from({ length: 500 }, () => generateGuestNickname());

    drawn.forEach((nickname) => {
      const match = /^([A-Z][a-z]+)([A-Z][a-z]+)(\d{3,5})$/.exec(nickname);
      expect(match).not.toBeNull();
      expect(GUEST_NICKNAME_ADJECTIVES).toContain(match?.[1]);
      expect(GUEST_NICKNAME_NOUNS).toContain(match?.[2]);
      expect(Number(match?.[3])).toBeGreaterThanOrEqual(100);
    });
    expect(new Set(drawn.map((nickname) => nickname.replace(/[A-Za-z]/g, '').length)).size).toBeGreaterThan(1);
  });

  it('offre plus de cent mille noms avant même le nombre, sans doublon ni mot hors alphabet', () => {
    const words = [...GUEST_NICKNAME_ADJECTIVES, ...GUEST_NICKNAME_NOUNS];

    expect(GUEST_NICKNAME_ADJECTIVES.length * GUEST_NICKNAME_NOUNS.length).toBeGreaterThan(100_000);
    expect(new Set(GUEST_NICKNAME_ADJECTIVES).size).toBe(GUEST_NICKNAME_ADJECTIVES.length);
    expect(new Set(GUEST_NICKNAME_NOUNS).size).toBe(GUEST_NICKNAME_NOUNS.length);
    expect(words.filter((word) => !/^[A-Z][a-z]{1,11}$/.test(word))).toEqual([]);
  });

  it('traverse la désinfection du pseudo sans rien perdre', () => {
    const nickname = generateGuestNickname();

    expect(SecuritySanitizer.sanitizeUsername(nickname)).toBe(nickname);
  });

  it('ne se répète presque jamais sur mille tirages', () => {
    const drawn = new Set(Array.from({ length: 1000 }, () => generateGuestNickname()));

    expect(drawn.size).toBeGreaterThan(990);
  });
});

describe('automaticNickname — tiré du nom donné, généré sinon', () => {
  it('garde le pseudo dérivé du nom quand un nom est donné', () => {
    expect(automaticNickname('Jean', 'Dupont')).toMatch(/^jean_du\d{3}$/);
    expect(automaticNickname('太郎', '')).toMatch(/^user_\d{3}$/);
  });

  it('génère un pseudo quand aucun nom n\'est donné', () => {
    expect(automaticNickname('', '')).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{3,5}$/);
    expect(automaticNickname('  ', '')).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{3,5}$/);
  });
});
