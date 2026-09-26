/**
 * Le bloc de verre du Focal (#8147) — les cotes TS et leur miroir JSON lu par
 * iOS ne divergent jamais, et la loupe s'écrête comme sur iOS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FOCAL_METRICS, focalLoupeScale } from '../utils/focal-metrics.js';

const MIRROR_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'long-message', 'focal-metrics.json');

describe('FOCAL_METRICS', () => {
  it('égale, clé pour clé, le miroir JSON que rejoue iOS', () => {
    expect(JSON.parse(readFileSync(MIRROR_PATH, 'utf8'))).toEqual(FOCAL_METRICS);
  });

  it('reprend les valeurs iOS de référence (rayon 18, gain 0,05)', () => {
    expect(FOCAL_METRICS.glassRadius).toBe(18);
    expect(FOCAL_METRICS.loupeGain).toBe(0.05);
  });
});

describe('focalLoupeScale', () => {
  it('grossit le message élu du gain plein quand il tient dans ses marges', () => {
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 300, height: 60 })).toBeCloseTo(1.05);
  });

  it("écrête la loupe d'un message haut à la marge verticale du verre", () => {
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 300, height: 800 })).toBeCloseTo(1 + 16 / 800);
  });

  it('ne grossit rien hors focus, sous Réduire le mouvement, ou sur une boîte vide', () => {
    expect(focalLoupeScale({ isFocused: false, reducedMotion: false, width: 300, height: 60 })).toBe(1);
    expect(focalLoupeScale({ isFocused: true, reducedMotion: true, width: 300, height: 60 })).toBe(1);
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 0, height: 60 })).toBe(1);
  });
});
