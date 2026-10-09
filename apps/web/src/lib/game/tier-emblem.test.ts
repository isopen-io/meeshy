import { describe, expect, test } from 'bun:test';

import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';

import { EMBLEM_BOX, TIER_EMBLEMS, TIER_ROMAN, tierOrdinal, tierRoman } from './tier-emblem';

/**
 * LES DIX EMBLÈMES DE PALIER (#9481) — un dessin par palier, Étincelle →
 * Galaxie, bâti sur la Signature et à la couleur spectrale du palier. Le
 * dessin est une DONNÉE : les chiffres romains et les formes se prouvent sans
 * rendu, et le web et iOS lisent le même dessin.
 */
describe('le rang d’un palier', () => {
  test('Étincelle est le premier, Galaxie le dixième', () => {
    expect(tierOrdinal('etincelle')).toBe(1);
    expect(tierOrdinal('eclat')).toBe(4);
    expect(tierOrdinal('galaxie')).toBe(10);
  });

  test('le chiffre romain suit le rang : I à XX, un par palier, tous différents', () => {
    expect(LEVEL_TIER_KEYS.map(tierRoman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']);
    expect(new Set(TIER_ROMAN).size).toBe(20);
  });
});

describe('les vingt emblèmes', () => {
  test('un emblème par palier de la loi partagée, aucun réécrit ici', () => {
    expect(Object.keys(TIER_EMBLEMS).sort()).toEqual([...LEVEL_TIER_KEYS].sort());
  });

  test('chaque emblème a des formes, et deux paliers ne partagent jamais le même dessin', () => {
    const drawings = LEVEL_TIER_KEYS.map((tier) => JSON.stringify(TIER_EMBLEMS[tier].shapes));
    for (const tier of LEVEL_TIER_KEYS) expect(TIER_EMBLEMS[tier].shapes.length).toBeGreaterThan(0);
    expect(new Set(drawings).size).toBe(LEVEL_TIER_KEYS.length);
  });

  test('chaque forme tient dans la boîte de l’emblème (un carré centré sur l’origine)', () => {
    const half = EMBLEM_BOX / 2;
    for (const tier of LEVEL_TIER_KEYS) {
      for (const shape of TIER_EMBLEMS[tier].shapes) {
        const numbers = shape.kind === 'path' ? (shape.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) : shape.kind === 'circle' ? [shape.cx, shape.cy, shape.r] : [shape.x1, shape.y1, shape.x2, shape.y2];
        expect(numbers.length).toBeGreaterThan(0);
        for (const n of numbers) expect(Math.abs(n)).toBeLessThanOrEqual(half + 2);
      }
    }
  });

  test('aucun nombre illisible (NaN, Infinity) dans un dessin', () => {
    for (const tier of LEVEL_TIER_KEYS) expect(JSON.stringify(TIER_EMBLEMS[tier])).not.toMatch(/NaN|Infinity|null/);
  });

  test('le cœur est dit : plein (la Signature s’y creuse) ou ouvert (la Signature y reste de la couleur du palier)', () => {
    for (const tier of LEVEL_TIER_KEYS) expect(['filled', 'open']).toContain(TIER_EMBLEMS[tier].core);
  });
});
