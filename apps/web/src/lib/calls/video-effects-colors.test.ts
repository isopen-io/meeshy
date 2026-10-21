import { describe, expect, test } from 'bun:test';

import { FRAGMENT_PRECISION, sampledPixel, type Rgb } from './video-effects-blur';
import { FRAGMENT_SHADERS } from './video-effects-compositor';

/**
 * LE FLOU GARDE LES COULEURS DE LA CAMÉRA (#9203) — un pixel que le flou ne
 * touche pas (la personne) ressort IDENTIQUE à une tolérance de 3 par canal.
 *
 * Le compositeur relit l'image nette par une prise bilinéaire au centre de
 * chaque pixel. Sur un GPU mobile (la coque Android, un Mali ou un Adreno),
 * `mediump` est un demi-flottant : à 1920 pixels de large, la coordonnée y
 * tombe jusqu'à un demi-pixel à côté, et le pixel envoyé prend la couleur de
 * son voisin. La mire : une rangée HD dont chaque pixel diffère du suivant.
 */

const CHART: readonly Rgb[] = [
  [1, 136, 1],
  [200, 30, 30],
  [30, 30, 200],
  [240, 240, 240],
  [10, 10, 10],
  [250, 200, 40],
  [90, 40, 160],
];

const row = (width: number): readonly Rgb[] => Array.from({ length: width }, (_, x) => CHART[x % CHART.length] ?? [0, 0, 0]);

const worstDrift = (width: number, precision: Parameters<typeof sampledPixel>[2]): number => {
  const mire = row(width);
  return mire.reduce((worst, original, x) => {
    const sent = sampledPixel(mire, x, precision);
    return Math.max(worst, ...original.map((channel, index) => Math.abs(channel - (sent[index] ?? 0))));
  }, 0);
};

describe('un pixel non flouté ressort identique', () => {
  [640, 1280, 1920, 3840].forEach((width) => {
    test(`sur une mire de ${width} pixels de large, à 3 près par canal`, () => {
      expect(worstDrift(width, FRAGMENT_PRECISION)).toBeLessThanOrEqual(3);
    });
  });

  test('la mire distingue : en demi-flottant, une image HD prend la couleur du voisin', () => {
    expect(worstDrift(1920, 'mediump')).toBeGreaterThan(3);
  });

  test('chaque passe du compositeur lit ses textures à la précision qui tient la mire', () => {
    Object.entries(FRAGMENT_SHADERS).forEach(([name, source]) => {
      expect({ name, precision: /precision (\w+) float;/.exec(source)?.[1] }).toEqual({ name, precision: FRAGMENT_PRECISION });
    });
  });
});
