import { describe, expect, test } from 'bun:test';

import { nextRadioIndex } from './radio-keys';

describe('le clavier d’un groupe de choix', () => {
  test('↓ et → avancent, ↑ et ← reculent, avec bouclage', () => {
    expect(nextRadioIndex('ArrowRight', 0, 4)).toBe(1);
    expect(nextRadioIndex('ArrowDown', 3, 4)).toBe(0);
    expect(nextRadioIndex('ArrowLeft', 0, 4)).toBe(3);
    expect(nextRadioIndex('ArrowUp', 2, 4)).toBe(1);
  });
  test('Début et Fin vont aux extrémités', () => {
    expect(nextRadioIndex('Home', 2, 4)).toBe(0);
    expect(nextRadioIndex('End', 1, 4)).toBe(3);
  });
  test('en RTL les flèches horizontales suivent le sens de lecture', () => {
    expect(nextRadioIndex('ArrowLeft', 0, 4, true)).toBe(1);
    expect(nextRadioIndex('ArrowRight', 0, 4, true)).toBe(3);
  });
  test('une autre touche, ou aucun choix, ne bouge rien', () => {
    expect(nextRadioIndex('a', 0, 4)).toBeNull();
    expect(nextRadioIndex('ArrowDown', 0, 0)).toBeNull();
  });
});
