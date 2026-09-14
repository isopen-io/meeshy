import { describe, expect, test } from 'vitest';

import {
  PHONE_MIN_DIGITS,
  isPlausiblePhone,
  phoneDigitsOnly,
  phoneImplausibility,
} from '../utils/phone-plausibility';

/**
 * LES TROIS EXEMPLES DU PORTEUR sont les trois premiers témoins (#6479).
 * Un module de plausibilité qui ne rendrait pas le verdict attendu sur eux
 * n'aurait pas répondu à la demande, quoi qu'en disent ses autres cas.
 */
describe('les exemples de la directive', () => {
  test('« 1111100000 » — suite de chiffres identiques', () =>
    expect(phoneImplausibility('1111100000')).toBe('identical-run'));

  test('« 42424242 » — motif répété (et trop court)', () =>
    expect(isPlausiblePhone('42424242')).toBe(false));

  test('« 424242424242 » — motif répété, assez long pour que la LONGUEUR ne décide pas', () =>
    expect(phoneImplausibility('424242424242')).toBe('repeated-pattern'));
});

describe('la borne de longueur — « > 8 chiffres »', () => {
  test('8 chiffres ⇒ trop court', () => expect(phoneImplausibility('06123456')).toBe('too-short'));
  test(`${PHONE_MIN_DIGITS} chiffres ⇒ accepté`, () => expect(isPlausiblePhone('061234567')).toBe(true));
  test('la borne vaut 9 — « plus de 8 » lu à la lettre', () => expect(PHONE_MIN_DIGITS).toBe(9));
});

describe('les vrais numéros passent — le coût d’un refus est plus lourd que celui d’un faux', () => {
  test('un mobile français ordinaire', () => expect(isPlausiblePhone('0612345678')).toBe(true));
  /**
   * LE témoin qui sépare « contient » de « EST ». `0642424242` contient
   * « 42 » quatre fois et reste un numéro parfaitement ordinaire : une règle
   * qui chercherait le motif N'IMPORTE OÙ le refuserait.
   */
  test('un numéro qui CONTIENT un motif répété sans en être un', () =>
    expect(isPlausiblePhone('0642424242')).toBe(true));
  test('quatre chiffres identiques à la suite restent plausibles', () =>
    expect(isPlausiblePhone('0644441230')).toBe(true));
  test('la mise en forme ne décide de rien', () =>
    expect(isPlausiblePhone('06 12.34 56 78')).toBe(true));
});

describe('les faux classiques', () => {
  test('« 0600000000 »', () => expect(phoneImplausibility('0600000000')).toBe('identical-run'));
  test('« 0000000000 »', () => expect(phoneImplausibility('0000000000')).toBe('identical-run'));
  test('« 123123123 » — « 123 » trois fois', () =>
    expect(phoneImplausibility('123123123')).toBe('repeated-pattern'));
});

describe('l’ABSENCE est plausible — le numéro n’est pas requis (#6424)', () => {
  test('chaîne vide', () => expect(isPlausiblePhone('')).toBe(true));
  test('que de la ponctuation ⇒ aucun chiffre ⇒ absent, donc plausible', () =>
    expect(isPlausiblePhone('+ ( ) - .')).toBe(true));
  test('phoneDigitsOnly ne garde que les chiffres', () =>
    expect(phoneDigitsOnly('+33 6 12.34-56 78')).toBe('33612345678'));
});
