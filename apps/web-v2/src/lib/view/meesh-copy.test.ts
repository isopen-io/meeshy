import { describe, expect, test } from 'bun:test';

import { meeshMissing } from './meesh-copy';

/**
 * L'ACCORD DU DÉTAIL MEESH (#6478) — jumelle du témoin iOS
 * `ProgressionStreakPluralTests`, qui affirme la même propriété.
 */

/** Ce qui reste d'un rendu une fois les CHIFFRES ôtés : le mot accordé, et lui
 * seul. Deux rendus qui ne diffèrent QUE par leur nombre laissent le même
 * reste — c'est exactement le défaut. */
function motAccorde(rendu: string): string {
  return rendu.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
}

describe('le point convertible s’accorde', () => {
  test('à 1 et à 2, le mot change', () =>
    expect(motAccorde(meeshMissing(1, 0))).not.toBe(motAccorde(meeshMissing(2, 0))));
  test('« point convertible » au singulier', () =>
    expect(meeshMissing(1, 0)).toBe('Encore 1 point convertible avant une Meesh.'));
  test('« points convertibles » au pluriel', () =>
    expect(meeshMissing(2, 0)).toBe('Encore 2 points convertibles avant une Meesh.'));
});

describe('le point de conversation s’accorde', () => {
  /**
   * Mesuré à `missing` CONSTANT : les deux rendus partagent leur première
   * phrase et ne peuvent différer que par la seconde. Sans cette précaution,
   * l'accord de `missing` suffirait à faire passer le témoin — il verdirait
   * pour un motif étranger à ce qu'il affirme.
   */
  test('à 1 et à 2, le mot change', () =>
    expect(motAccorde(meeshMissing(5, 1))).not.toBe(motAccorde(meeshMissing(5, 2))));

  test('à UN, aucun chiffre n’accompagne le plancher', () => {
    const seconde = meeshMissing(5, 1).replace(meeshMissing(5, 0), '').trim();
    expect(seconde).toBe('Votre point de conversation sera repris en dernier, sans éteindre aucun badge.');
    expect(seconde).not.toContain('1');
  });

  test('au-delà, le chiffre revient', () =>
    expect(meeshMissing(5, 3)).toContain('Vos 3 points de conversation'));
});

describe('le plancher ABSENT ne compose rien', () => {
  test('zéro ⇒ une seule phrase', () => expect(meeshMissing(4, 0)).toBe('Encore 4 points convertibles avant une Meesh.'));
});
