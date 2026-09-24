import { describe, expect, test } from 'bun:test';

import { nextFocusIndex } from './focus-trap';

describe('nextFocusIndex — le piège à focus d’une couche modale', () => {
  test('Tab depuis le DERNIER revient au PREMIER', () => {
    expect(nextFocusIndex(4, 3, false)).toBe(0);
  });

  test('Shift+Tab depuis le PREMIER revient au DERNIER', () => {
    expect(nextFocusIndex(4, 0, true)).toBe(3);
  });

  test('au milieu, avance/recule normalement', () => {
    expect(nextFocusIndex(4, 1, false)).toBe(2);
    expect(nextFocusIndex(4, 2, true)).toBe(1);
  });

  test('un seul élément focalisable : Tab et Shift+Tab restent sur lui', () => {
    expect(nextFocusIndex(1, 0, false)).toBe(0);
    expect(nextFocusIndex(1, 0, true)).toBe(0);
  });

  test('aucun élément focalisable : 0 par convention', () => {
    expect(nextFocusIndex(0, 0, false)).toBe(0);
  });
});
