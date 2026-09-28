import { describe, expect, test } from 'bun:test';

import { rowStep } from './call-row-keys';

/**
 * LES FLÈCHES DANS UNE RANGÉE DE L'APPEL (#8550) — chaque rangée défile à
 * l'horizontale ; au clavier, ← et → passent d'un bouton au voisin, Début et
 * Fin aux bouts, et l'arabe inverse le sens.
 */

describe('rowStep', () => {
  test('→ passe au suivant, ← au précédent, et la rangée boucle', () => {
    expect(rowStep({ key: 'ArrowRight', index: 0, count: 4, rtl: false })).toBe(1);
    expect(rowStep({ key: 'ArrowLeft', index: 2, count: 4, rtl: false })).toBe(1);
    expect(rowStep({ key: 'ArrowRight', index: 3, count: 4, rtl: false })).toBe(0);
    expect(rowStep({ key: 'ArrowLeft', index: 0, count: 4, rtl: false })).toBe(3);
  });

  test('Début et Fin vont aux bouts', () => {
    expect(rowStep({ key: 'Home', index: 2, count: 4, rtl: false })).toBe(0);
    expect(rowStep({ key: 'End', index: 0, count: 4, rtl: false })).toBe(3);
  });

  test('de droite à gauche, → recule', () => {
    expect(rowStep({ key: 'ArrowRight', index: 2, count: 4, rtl: true })).toBe(1);
    expect(rowStep({ key: 'ArrowLeft', index: 2, count: 4, rtl: true })).toBe(3);
  });

  test('une autre touche, ou une rangée vide, ne bouge rien', () => {
    expect(rowStep({ key: 'Enter', index: 0, count: 4, rtl: false })).toBeNull();
    expect(rowStep({ key: 'ArrowRight', index: 0, count: 0, rtl: false })).toBeNull();
  });

  test('sans focus dans la rangée, → prend le premier', () => {
    expect(rowStep({ key: 'ArrowRight', index: -1, count: 3, rtl: false })).toBe(0);
  });
});
