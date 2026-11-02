import { describe, expect, test } from 'bun:test';
import { nameMinLength, usernameMinLength } from '@meeshy/shared/types/api-schemas/auth';

import {
  isGuestNicknameTooShort,
  isNameLongEnough,
  isNameTooShort,
  isUsernameLongEnough,
  isUsernameTooShort,
  NAME_MIN_LENGTH,
} from './identity-bounds';

/**
 * LES BORNES D'UNE IDENTITÉ SAISIE (#13825, directive porteur 2026-10-30) :
 * « A » ou « B » ne sont ni un nom ni un pseudo ; « Al », « Li », « Ly » ou
 * « Sy » passent. Une saisie se juge ROGNÉE, jamais telle que tapée.
 */
describe('un prénom, un nom ou un nom affiché', () => {
  test('le minimum est de deux caractères, lu dans le schéma partagé', () => {
    expect(NAME_MIN_LENGTH).toBe(2);
    expect(NAME_MIN_LENGTH).toBe(nameMinLength);
  });

  for (const typed of ['😀😀', '🇫🇷🇨🇲', 'A😀', 'Ét']) {
    test(`« ${typed} » suffit, comme pour la passerelle : un émoji se voit`, () => {
      expect(isNameTooShort(typed)).toBe(false);
      expect(isNameLongEnough(typed)).toBe(true);
    });
  }

  for (const [typed, why] of [
    ['😀', 'un seul émoji, deux unités UTF-16'],
    ['A\u200E', 'une lettre et une marque de direction'],
    ['A\u2060', 'une lettre et un gluon'],
    ['A\u00AD', 'une lettre et un trait d\'union conditionnel'],
    ['E\u0301', '« É » décomposé'],
    ['A\u3164', 'une lettre et un remplissage hangul'],
    ['A<b></b>', 'une lettre et une balise vide'],
  ] as const) {
    test(`${why} vaut un caractère, comme pour la passerelle`, () => {
      expect(isNameTooShort(typed)).toBe(true);
      expect(isNameLongEnough(typed)).toBe(false);
    });
  }

  for (const typed of ['A', 'B', ' A ', '\tB\n']) {
    test(`« ${typed.trim()} » (${JSON.stringify(typed)}) est trop court`, () => {
      expect(isNameTooShort(typed)).toBe(true);
      expect(isNameLongEnough(typed)).toBe(false);
    });
  }

  for (const typed of ['Al', 'Li', 'Ly', 'Sy', ' Al ', 'Ada']) {
    test(`« ${typed.trim()} » (${JSON.stringify(typed)}) suffit`, () => {
      expect(isNameTooShort(typed)).toBe(false);
      expect(isNameLongEnough(typed)).toBe(true);
    });
  }

  test('un champ vide n\'est pas « trop court » : c\'est un champ absent, que l\'écran sait déjà dire', () => {
    expect(isNameTooShort('')).toBe(false);
    expect(isNameTooShort('   ')).toBe(false);
    expect(isNameLongEnough('   ')).toBe(false);
  });
});

describe('un pseudo', () => {
  test('la borne est celle du schéma partagé, jamais un littéral local', () => {
    expect(isUsernameTooShort('a'.repeat(usernameMinLength - 1))).toBe(true);
    expect(isUsernameLongEnough('a'.repeat(usernameMinLength))).toBe(true);
  });

  test('« Al » est refusé : le pseudo commence à trois caractères (attend usernameMinLength = 3 du lot partagé)', () => {
    expect(isUsernameTooShort('Al')).toBe(true);
    expect(isUsernameLongEnough('Al')).toBe(false);
    expect(isUsernameLongEnough(' Ali ')).toBe(true);
  });

  test('les espaces ne comptent pas', () => {
    expect(isUsernameLongEnough('  Al  ')).toBe(false);
    expect(isUsernameLongEnough('')).toBe(false);
    expect(isUsernameTooShort('')).toBe(false);
  });
});

describe('le pseudo d\'un invité', () => {
  test('se mesure sur ce que la passerelle en garde (lettres ASCII, chiffres, _ . -)', () => {
    expect(isGuestNicknameTooShort('Al#')).toBe(true);
    expect(isGuestNicknameTooShort('Zoé')).toBe(true);
    expect(isGuestNicknameTooShort('Al')).toBe(true);
  });

  test('« Zoe », « a.b » ou « Al_ » suffisent', () => {
    expect(isGuestNicknameTooShort('Zoe')).toBe(false);
    expect(isGuestNicknameTooShort('a.b')).toBe(false);
    expect(isGuestNicknameTooShort(' Al_ ')).toBe(false);
  });

  test('absent ou blanc, il reste permis : la passerelle nomme alors l\'invité', () => {
    expect(isGuestNicknameTooShort('')).toBe(false);
    expect(isGuestNicknameTooShort('   ')).toBe(false);
  });
});
