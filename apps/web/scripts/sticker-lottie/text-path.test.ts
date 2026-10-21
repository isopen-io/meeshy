import { describe, expect, test } from 'bun:test';

import { parsePathData } from './geometry';
import { textToPathData } from './text-path';

const bounds = (d: string) => {
  const points = parsePathData(d).flatMap((shape) => shape.vertices);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

describe('textToPathData — le texte d’un sticker devient un tracé, sans police à l’exécution', () => {
  test('le tracé est lisible par le même lecteur de tracés que le reste du dessin', () => {
    expect(parsePathData(textToPathData({ text: 'MDR', x: 0, y: 0, size: 16, weight: 800, anchor: 'start' })).length).toBeGreaterThan(0);
  });

  test('ancré au milieu, le texte est centré sur x ; posé sur y, il tient au-dessus de sa ligne de base', () => {
    const b = bounds(textToPathData({ text: 'LUNDI', x: 100, y: 50, size: 20, weight: 800, anchor: 'middle' }));
    expect(Math.abs((b.minX + b.maxX) / 2 - 100)).toBeLessThan(2);
    expect(b.maxY).toBeLessThanOrEqual(50.5);
    expect(b.minY).toBeLessThan(50 - 10);
  });

  test('la graisse compte : 800 est plus épais que 400 pour le même mot', () => {
    const width = (weight: number) => {
      const b = bounds(textToPathData({ text: 'OK', x: 0, y: 0, size: 40, weight, anchor: 'start' }));
      return b.maxX - b.minX;
    };
    expect(width(800)).toBeGreaterThan(width(400));
  });

  test('les accents du français sont dessinés', () => {
    expect(textToPathData({ text: 'É', x: 0, y: 0, size: 20, weight: 800, anchor: 'start' })).not.toBe(textToPathData({ text: 'E', x: 0, y: 0, size: 20, weight: 800, anchor: 'start' }));
  });
});
