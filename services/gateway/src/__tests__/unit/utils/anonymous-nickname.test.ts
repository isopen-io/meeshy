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
import {
  automaticNickname,
  automaticNicknameBase,
  generateGuestNickname,
  generateNickname,
  numberedAnonymousUsername,
} from '../../../utils/anonymous-nickname';
import { GUEST_NICKNAME_ADJECTIVES, GUEST_NICKNAME_NOUNS } from '../../../utils/anonymous-nickname-words';
import { SecuritySanitizer } from '../../../utils/sanitize';

const FORMAT = /^[a-z]+_[a-z]{0,2}[1-9]\d{1,4}$/;

describe('generateNickname — format', () => {
  it('produces a sanitizer-safe handle: base + underscore + up to 2 initials + 2-to-5-digit number', () => {
    expect(generateNickname('Jean', 'Dupont')).toMatch(FORMAT);
  });

  it('keeps the latin base and last-name initials (behavior preserved)', () => {
    expect(generateNickname('Jean', 'Dupont')).toMatch(/^jean_du[1-9]\d{1,4}$/);
  });

  it('lower-cases and only exposes ASCII letters + digits + underscore', () => {
    const handle = generateNickname('ALICE', 'Martin');
    expect(handle).toMatch(/^alice_ma[1-9]\d{1,4}$/);
  });
});

describe('generateNickname — accent folding (José → jose, not jos)', () => {
  it('folds diacritics on the first name instead of dropping the accented letter', () => {
    expect(generateNickname('José', 'Nlomé')).toMatch(/^jose_nl[1-9]\d{1,4}$/);
  });

  it('folds diacritics on the last-name initials', () => {
    expect(generateNickname('Renee', 'Éric')).toMatch(/^renee_er[1-9]\d{1,4}$/);
  });
});

describe('generateNickname — non-latin names never yield a degenerate handle', () => {
  it('falls back to the neutral base for a Cyrillic first name (no leading "_")', () => {
    const handle = generateNickname('Иван', 'Петров');
    expect(handle).toMatch(/^user_[1-9]\d{1,4}$/);
    expect(handle.startsWith('_')).toBe(false);
  });

  it('falls back to the neutral base for CJK and Arabic first names', () => {
    expect(generateNickname('太郎', '山田')).toMatch(/^user_[1-9]\d{1,4}$/);
    expect(generateNickname('محمد', 'علي')).toMatch(/^user_[1-9]\d{1,4}$/);
  });

  it('keeps a latin first name even when the last name is entirely non-latin', () => {
    expect(generateNickname('Jean', 'Петров')).toMatch(/^jean_[1-9]\d{1,4}$/);
  });
});

describe('generateGuestNickname — un invité qui n\'a rien saisi est nommé par la passerelle', () => {
  it('compose un adjectif, un nom et un nombre de 2 à 5 chiffres', () => {
    const drawn = Array.from({ length: 500 }, () => generateGuestNickname());

    drawn.forEach((nickname) => {
      const match = /^([A-Z][a-z]+)([A-Z][a-z]+)([1-9]\d{1,4})$/.exec(nickname);
      expect(match).not.toBeNull();
      expect(GUEST_NICKNAME_ADJECTIVES).toContain(match?.[1]);
      expect(GUEST_NICKNAME_NOUNS).toContain(match?.[2]);
      expect(Number(match?.[3])).toBeGreaterThanOrEqual(10);
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
    expect(automaticNickname('Jean', 'Dupont')).toMatch(/^jean_du[1-9]\d{1,4}$/);
    expect(automaticNickname('太郎', '')).toMatch(/^user_[1-9]\d{1,4}$/);
  });

  it('génère un pseudo quand aucun nom n\'est donné', () => {
    expect(automaticNickname('', '')).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+[1-9]\d{1,4}$/);
    expect(automaticNickname('  ', '')).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+[1-9]\d{1,4}$/);
  });
});

/**
 * #10602 — tout pseudo anonyme, SAISI comme automatique, se termine par un
 * nombre de 2 à 5 chiffres : deux personnes (ou la même, qui revient) peuvent
 * choisir le même nom sans qu'aucune ne soit refusée.
 */
describe('numberedAnonymousUsername — le pseudo final d\'un participant sans compte', () => {
  const NUMBERED = /^ano_([A-Za-z0-9_.-]*?)([1-9]\d{1,4})$/;

  it('place la base dans l\'espace `ano_` et la termine par 2 à 5 chiffres sans zéro de tête', () => {
    const drawn = Array.from({ length: 2000 }, () => numberedAnonymousUsername('bobby'));

    drawn.forEach((username) => expect(username).toMatch(/^ano_bobby[1-9]\d{1,4}$/));
    const lengths = new Set(drawn.map((username) => username.length - 'ano_bobby'.length));
    expect(lengths.has(1)).toBe(false);
    expect(lengths.has(5)).toBe(true);
  });

  it('tire un nombre différent d\'un appel à l\'autre', () => {
    const drawn = new Set(Array.from({ length: 200 }, () => numberedAnonymousUsername('bobby')));

    expect(drawn.size).toBeGreaterThan(190);
  });

  it('ne double pas le préfixe d\'une base déjà dans l\'espace réservé', () => {
    expect(numberedAnonymousUsername('ano_bob')).toMatch(/^ano_bob[1-9]\d{1,4}$/);
  });

  it('rogne la BASE, jamais le nombre, quand la place manque', () => {
    const username = numberedAnonymousUsername('a'.repeat(80));

    expect(username.length).toBeLessThanOrEqual(50);
    expect(username).toMatch(NUMBERED);
    expect(username).toMatch(/[1-9]\d{1,4}$/);
  });

  it('retombe sur une base neutre quand la saisie ne contient rien d\'utilisable', () => {
    expect(numberedAnonymousUsername('')).toMatch(/^ano_user[1-9]\d{1,4}$/);
  });

  it('traverse la désinfection du pseudo sans rien perdre', () => {
    const username = numberedAnonymousUsername('bob.smith-jr');

    expect(SecuritySanitizer.sanitizeUsername(username)).toBe(username);
  });
});

describe('automaticNicknameBase — la base d\'un pseudo automatique, sans son nombre', () => {
  it('dérive la base du nom donné', () => {
    expect(automaticNicknameBase('Jean', 'Dupont')).toBe('jean_du');
  });

  it('génère adjectif + nom quand aucun nom n\'est donné', () => {
    expect(automaticNicknameBase('', ' ')).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  });
});
