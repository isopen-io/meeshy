import { describe, expect, test } from 'bun:test';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';

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

describe('l’étincelle s’accorde', () => {
  test('à 1 et à 2, le mot change', () =>
    expect(motAccorde(meeshMissing(1, 0))).not.toBe(motAccorde(meeshMissing(2, 0))));
  test('« étincelle » au singulier', () =>
    expect(meeshMissing(1, 0)).toBe('1 étincelle jusqu’à ta prochaine Meesh.'));
  test('« étincelles » au pluriel', () =>
    expect(meeshMissing(2, 0)).toBe('2 étincelles jusqu’à ta prochaine Meesh.'));
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
    expect(seconde).toBe('Ton étincelle de conversation se figera en dernier, sans éteindre aucune médaille.');
    expect(seconde).not.toContain('1');
  });

  test('au-delà, le chiffre revient', () =>
    expect(meeshMissing(5, 3)).toContain('Tes 3 étincelles de conversation'));
});

describe('le plancher ABSENT ne compose rien', () => {
  test('zéro ⇒ une seule phrase', () => expect(meeshMissing(4, 0)).toBe('4 étincelles jusqu’à ta prochaine Meesh.'));
});

describe('la langue d’interface (#10823)', () => {
  test('interface en : le manque et le plancher en anglais, avec les valeurs d’iOS', async () => {
    await loadGameCatalog('en');
    expect(meeshMissing(1, 0, 'en')).toBe('1 more spark before a Meesh.');
    expect(meeshMissing(4, 3, 'en')).toBe(
      '4 more sparks before a Meesh. Your 3 conversation sparks will be used last, without turning off any badge.',
    );
  });

  test('interface ar : la forme duelle du catalogue arabe', async () => {
    await loadGameCatalog('ar');
    expect(meeshMissing(2, 0, 'ar')).toBe('لا يزال أمامك شرارتان قبل الحصول على Meesh.');
  });
});
