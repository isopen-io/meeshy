import { describe, expect, test } from 'bun:test';

import { bringHeaderState } from './bring-header-law';

/**
 * LE BRING DANS L'EN-TÊTE D'UN DIRECT (#17442) — la même règle que la fiche :
 * le bouton n'existe que si la passerelle sert `available: true`, il dit le
 * quota quand il est épuisé, et il annule tant que ça sonne.
 */

const open = { available: true, perDay: 1, remainingToday: 1, resetsAt: null };

describe('l’état du bouton', () => {
  test('absent tant que la passerelle ne l’ouvre pas', () => {
    expect(bringHeaderState({ availability: null, ringing: false })).toBe('hidden');
    expect(bringHeaderState({ availability: { ...open, available: false }, ringing: false })).toBe('hidden');
  });

  test('ouvert : faire sonner ; illimité aussi', () => {
    expect(bringHeaderState({ availability: open, ringing: false })).toBe('send');
    expect(bringHeaderState({ availability: { ...open, perDay: null, remainingToday: null }, ringing: false })).toBe('send');
  });

  test('quota épuisé : le bouton reste et dit le quota', () => {
    expect(bringHeaderState({ availability: { ...open, remainingToday: 0 }, ringing: false })).toBe('exhausted');
  });

  test('tant que ça sonne : annuler, même si le quota vient de tomber à zéro', () => {
    expect(bringHeaderState({ availability: { ...open, remainingToday: 0 }, ringing: true })).toBe('ringing');
  });
});
