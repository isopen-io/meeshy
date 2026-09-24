import { describe, expect, test } from 'bun:test';

import { layoutIsServed } from './publication-layout';

describe('layoutIsServed — LES DEUX MOITIÉS du seuil (#7684)', () => {
  test('UNE page ⇒ jamais de sous-menu, quel que soit le format', () => {
    expect(layoutIsServed({ pageCount: 1, kind: 'POST' })).toBe(false);
    expect(layoutIsServed({ pageCount: 1, kind: 'REEL' })).toBe(false);
    expect(layoutIsServed({ pageCount: 1, kind: 'STORY' })).toBe(false);
  });

  test('DEUX pages ET un POST ⇒ servi', () => {
    expect(layoutIsServed({ pageCount: 2, kind: 'POST' })).toBe(true);
  });

  test('DEUX pages mais une STORY ou un RÉEL ⇒ jamais servi (le canal de la story publie UN post par page, question 9.4)', () => {
    expect(layoutIsServed({ pageCount: 2, kind: 'STORY' })).toBe(false);
    expect(layoutIsServed({ pageCount: 2, kind: 'REEL' })).toBe(false);
  });

  test('dix pages restent servies — aucun plafond propre à ce prédicat', () => {
    expect(layoutIsServed({ pageCount: 10, kind: 'POST' })).toBe(true);
  });
});
