import { describe, expect, test } from 'bun:test';

import { spreadPins } from './fan';

/**
 * **L'ÉVENTAIL DES ÉPINGLES QUI SE RECOUVRENT (#19883)** — miroir de `LocationMapFan.spread`
 * (iOS, `LocationMapPinsLayer.swift`) : à la précision « ville », toutes les positions servies
 * tombent au même centre, et une seule épingle restait visible.
 */

const at = (placed: ReadonlyMap<string, { x: number; y: number }>, id: string): { x: number; y: number } => placed.get(id) ?? { x: Number.NaN, y: Number.NaN };
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('spreadPins', () => {
  test('quatre personnes au même point : quatre places distinctes, aucune ne cache l’autre', () => {
    const placed = spreadPins(
      ['a', 'b', 'c', 'd'].map((id) => ({ id, x: 100, y: 100 })),
      40,
    );
    expect([...placed.keys()].sort()).toEqual(['a', 'b', 'c', 'd']);
    const points = [...placed.values()];
    points.forEach((p, i) => points.slice(i + 1).forEach((q) => expect(distance(p, q)).toBeGreaterThanOrEqual(39.9)));
  });

  test('une épingle seule reste à sa position servie', () => {
    const placed = spreadPins(
      [
        { id: 'a', x: 10, y: 10 },
        { id: 'b', x: 300, y: 300 },
      ],
      40,
    );
    expect(placed.get('a')).toEqual({ x: 10, y: 10 });
    expect(placed.get('b')).toEqual({ x: 300, y: 300 });
  });

  test('l’éventail est centré sur le point partagé et ne dépend pas de l’ordre servi', () => {
    const points = ['b', 'a', 'c'].map((id) => ({ id, x: 50, y: 80 }));
    const placed = spreadPins(points, 40);
    const values = [...placed.values()];
    expect(values.reduce((sum, p) => sum + p.x, 0) / 3).toBeCloseTo(50, 3);
    expect(values.reduce((sum, p) => sum + p.y, 0) / 3).toBeCloseTo(80, 3);
    expect(spreadPins([...points].reverse(), 40)).toEqual(placed);
  });

  test('deux épingles proches sans être confondues s’écartent aussi', () => {
    const placed = spreadPins(
      [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 110, y: 100 },
      ],
      40,
    );
    expect(distance(at(placed, 'a'), at(placed, 'b'))).toBeGreaterThanOrEqual(39.9);
  });
});
