import { describe, expect, test } from 'bun:test';

import { parsePathData } from './geometry';

const near = (actual: readonly number[], expected: readonly number[]) =>
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index] as number, 2));

describe('parsePathData — un tracé SVG devient des sous-tracés de Bézier Lottie', () => {
  test('un carré fermé garde ses quatre sommets, sans doublon de fermeture', () => {
    const [square] = parsePathData('M0 0 L10 0 L10 10 L0 10 Z');
    expect(square?.closed).toBe(true);
    expect(square?.vertices).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(square?.inTangents.every(([x, y]) => x === 0 && y === 0)).toBe(true);
  });

  test('un retour explicite au départ avant Z est absorbé dans la fermeture', () => {
    const [shape] = parsePathData('M0 0 L10 0 L0 10 L0 0 Z');
    expect(shape?.vertices).toHaveLength(3);
  });

  test('les commandes relatives s’ajoutent au point courant, H et V gardent l’autre axe', () => {
    const [shape] = parsePathData('m5 5 h10 v10 l-10 0 z');
    expect(shape?.vertices).toEqual([[5, 5], [15, 5], [15, 15], [5, 15]]);
  });

  test('une courbe cubique porte ses poignées RELATIVES aux sommets', () => {
    const [shape] = parsePathData('M0 0 C0 10 10 10 10 0');
    expect(shape?.outTangents[0]).toEqual([0, 10]);
    expect(shape?.inTangents[1]).toEqual([0, 10]);
    expect(shape?.vertices[1]).toEqual([10, 0]);
  });

  test('une quadratique est élevée en cubique aux deux tiers', () => {
    const [shape] = parsePathData('M0 0 Q6 6 12 0');
    near(shape?.outTangents[0] ?? [], [4, 4]);
    near(shape?.inTangents[1] ?? [], [-4, 4]);
  });

  test('un demi-cercle en arc arrive au bon point, en deux quarts de Bézier', () => {
    const [shape] = parsePathData('M0 0 A5 5 0 0 1 10 0');
    expect(shape?.vertices).toHaveLength(3);
    near(shape?.vertices[1] ?? [], [5, -5]);
    near(shape?.vertices[2] ?? [], [10, 0]);
  });

  test('des drapeaux d’arc collés au nombre suivant sont lus un par un', () => {
    const [glued] = parsePathData('M0 0 a5 5 0 0110 0');
    const [spaced] = parsePathData('M0 0 a5 5 0 0 1 10 0');
    expect(glued?.vertices).toEqual(spaced?.vertices ?? []);
  });

  test('un nouveau M ouvre un second sous-tracé, et une suite de nombres après M vaut des L', () => {
    const shapes = parsePathData('M0 0 10 0 10 10 M20 20 L30 20');
    expect(shapes).toHaveLength(2);
    expect(shapes[0]?.vertices).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(shapes[0]?.closed).toBe(false);
  });

  test('une commande inconnue est refusée, jamais ignorée en silence', () => {
    expect(() => parsePathData('M0 0 S1 1 2 2')).toThrow(/S/);
  });
});
