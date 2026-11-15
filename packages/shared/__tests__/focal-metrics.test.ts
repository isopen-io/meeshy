/**
 * Le bloc de verre du Focal (#8147) — les cotes TS et leur miroir JSON lu par
 * iOS ne divergent jamais, et la loupe s'écrête comme sur iOS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FOCAL_METRICS, focalExpandEasingCss, focalLoupeScale } from '../utils/focal-metrics.js';

const MIRROR_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'long-message', 'focal-metrics.json');

describe('FOCAL_METRICS', () => {
  it('égale, clé pour clé, le miroir JSON que rejoue iOS', () => {
    expect(JSON.parse(readFileSync(MIRROR_PATH, 'utf8'))).toEqual(FOCAL_METRICS);
  });

  it('reprend les valeurs iOS de référence (rayon 18, gain 0,26 = 1,05 × 1,2 − 1, #8506)', () => {
    expect(FOCAL_METRICS.glassRadius).toBe(18);
    expect(FOCAL_METRICS.loupeGain).toBe(0.26);
  });
});

describe('le tempo du dépliage (#8232)', () => {
  it('déplie en 300 ms sur la courbe décélérée que web et iOS jouent tous deux', () => {
    expect(FOCAL_METRICS.expandDurationMs).toBe(300);
    expect(FOCAL_METRICS.expandCurve).toEqual([0.2, 0, 0, 1]);
  });

  it('projette la courbe en cubic-bezier CSS, sans la réécrire', () => {
    expect(focalExpandEasingCss()).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });
});

describe('focalLoupeScale', () => {
  it('grossit le message élu du gain plein quand il tient dans ses marges', () => {
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 100, height: 60 })).toBeCloseTo(1.26);
  });

  it("ne s'écrête plus sur la hauteur : le cadre grandit avec un message haut (#8506)", () => {
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 100, height: 800 })).toBeCloseTo(1.26);
  });

  it("s'écrête à la marge verticale quand le verre reste à sa taille (message déplié)", () => {
    expect(
      focalLoupeScale({ isFocused: true, reducedMotion: false, width: 100, height: 800, fixedGlass: true }),
    ).toBeCloseTo(1 + 16 / 800);
  });

  it("s'écrête à la place dont dispose le contenu une fois grossi", () => {
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 200, height: 60, room: 220 })).toBeCloseTo(1.1);
  });

  it('sans place déclarée, grossit par son centre dans la gouttière de la rangée', () => {
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 320, height: 60 })).toBeCloseTo(1 + 32 / 320);
  });

  it('ne rétrécit jamais un contenu plus large que sa place', () => {
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 300, height: 60, room: 250 })).toBe(1);
  });

  it('ne grossit rien hors focus, sous Réduire le mouvement, ou sur une boîte vide', () => {
    expect(focalLoupeScale({ isFocused: false, reducedMotion: false, width: 300, height: 60 })).toBe(1);
    expect(focalLoupeScale({ isFocused: true, reducedMotion: true, width: 300, height: 60 })).toBe(1);
    expect(focalLoupeScale({ isFocused: true, reducedMotion: false, width: 0, height: 60 })).toBe(1);
  });
});
