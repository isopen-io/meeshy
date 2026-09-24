import { describe, expect, test } from 'bun:test';

import { findFocusableIndex } from './roving-menu';

/**
 * LA PARTIE PURE DU MENU ANCRÉ PARTAGÉ (#5559 défaut 4) — la navigation
 * clavier elle-même (roving tabindex, saut des lignes désactivées),
 * extraite de `ReadingModeChip` où elle vivait sous le nom `findFocusable`
 * avant l'extraction : mêmes bornes, même comportement, exactement les cas
 * que `check-reading-mode.mjs` exerce déjà au navigateur.
 */
describe('findFocusableIndex', () => {
  const NONE_DISABLED = () => false;

  test('avance d’UN cran, avec bouclage', () => {
    expect(findFocusableIndex(4, 0, 1, NONE_DISABLED)).toBe(1);
    expect(findFocusableIndex(4, 3, 1, NONE_DISABLED)).toBe(0);
  });

  test('recule d’UN cran, avec bouclage', () => {
    expect(findFocusableIndex(4, 1, -1, NONE_DISABLED)).toBe(0);
    expect(findFocusableIndex(4, 0, -1, NONE_DISABLED)).toBe(3);
  });

  test('« Home » (start = -1, direction 1) rend le premier index', () => {
    expect(findFocusableIndex(4, -1, 1, NONE_DISABLED)).toBe(0);
  });

  test('« End » (start = count, direction -1) rend le dernier index', () => {
    expect(findFocusableIndex(4, 4, -1, NONE_DISABLED)).toBe(3);
  });

  test('saute une ligne DÉSACTIVÉE — jamais ne s’y arrête', () => {
    const isDisabledAt = (index: number) => index === 1;
    expect(findFocusableIndex(4, 0, 1, isDisabledAt)).toBe(2);
    expect(findFocusableIndex(4, 2, -1, isDisabledAt)).toBe(0);
  });

  test('« Home » saute aussi une première ligne désactivée', () => {
    const isDisabledAt = (index: number) => index === 0;
    expect(findFocusableIndex(4, -1, 1, isDisabledAt)).toBe(1);
  });

  test('tout désactivé : rend le point de départ plutôt que boucler indéfiniment', () => {
    expect(findFocusableIndex(3, 0, 1, () => true)).toBe(0);
  });
});
