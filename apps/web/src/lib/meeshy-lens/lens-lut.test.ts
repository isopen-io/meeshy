import { describe, expect, test } from 'bun:test';

import { applyLut, identityStrip, lutCubeOf, type LutImage, type Rgb } from './lens-lut';

/**
 * LA LUT D'UNE LENS (W14, #11320) — une bande N² × N devient le cube d'une
 * texture 3D, et la lecture trilinéaire du processeur (la RÉFÉRENCE des
 * goldens) rend ce que le GPU rendra.
 */
const SAMPLES: readonly Rgb[] = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [12, 200, 77],
  [128, 64, 250],
];

const inverted = (size: number): LutImage => {
  const strip = identityStrip(size);
  return { ...strip, data: Uint8ClampedArray.from(strip.data, (value, index) => (index % 4 === 3 ? value : 255 - value)) };
};

describe('lutCubeOf', () => {
  test('une bande 32² × 32 devient un cube 32³, rouge le plus rapide puis vert puis bleu', () => {
    const cube = lutCubeOf(identityStrip(32));
    expect(cube?.size).toBe(32);
    expect(cube?.data.length).toBe(32 * 32 * 32 * 4);
    const at = (r: number, g: number, b: number) => (((b * 32 + g) * 32 + r) * 4);
    expect(Array.from(cube?.data.slice(at(31, 0, 0), at(31, 0, 0) + 3) ?? [])).toEqual([255, 0, 0]);
    expect(Array.from(cube?.data.slice(at(0, 31, 0), at(0, 31, 0) + 3) ?? [])).toEqual([0, 255, 0]);
    expect(Array.from(cube?.data.slice(at(0, 0, 31), at(0, 0, 31) + 3) ?? [])).toEqual([0, 0, 255]);
  });

  test('une image qui n’est pas une bande est refusée', () => {
    expect(lutCubeOf({ width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4) })).toBeNull();
    expect(lutCubeOf({ width: 20 * 20, height: 20, data: new Uint8ClampedArray(400 * 20 * 4) })).toBeNull();
    expect(lutCubeOf({ width: 256, height: 16, data: new Uint8ClampedArray(10) })).toBeNull();
  });
});

describe('applyLut — la référence des goldens', () => {
  test('la bande identité rend chaque couleur elle-même', () => {
    const cube = lutCubeOf(identityStrip(32));
    if (cube === null) throw new Error('cube');
    SAMPLES.forEach((color) => {
      applyLut(cube, color, 1).forEach((channel, index) => expect(Math.abs(channel - (color[index] ?? 0))).toBeLessThanOrEqual(1));
    });
  });

  test('golden : la bande inversée rend le négatif', () => {
    const cube = lutCubeOf(inverted(16));
    if (cube === null) throw new Error('cube');
    expect(SAMPLES.map((color) => applyLut(cube, color, 1))).toEqual([
      [255, 255, 255],
      [0, 0, 0],
      [0, 255, 255],
      [243, 55, 178],
      [127, 191, 5],
    ]);
  });

  test('l’intensité mêle l’étalonnage à l’original : 0 rend l’original, 0,5 la moitié du chemin', () => {
    const cube = lutCubeOf(inverted(16));
    if (cube === null) throw new Error('cube');
    expect(applyLut(cube, [200, 100, 0], 0)).toEqual([200, 100, 0]);
    expect(applyLut(cube, [200, 100, 0], 0.5)).toEqual([128, 128, 128]);
  });
});
