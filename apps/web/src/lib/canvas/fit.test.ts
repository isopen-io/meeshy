import { describe, expect, test } from 'bun:test';

import { SCENE_ASPECT } from '@/lib/feed/scene-framing';

import { fitScene, sceneRatio, SCENE_RATIO } from './fit';
import type { CanvasScene } from './document';

const sceneWith = (carrierAspect?: number): CanvasScene => ({ id: 's1', objects: [], ...(carrierAspect !== undefined ? { carrierAspect } : {}) });

describe('fitScene — un ajustement UNIFORME et CENTRÉ (T-B)', () => {
  const RATIO = 9 / 16;

  const cases: ReadonlyArray<readonly [string, { readonly width: number; readonly height: number }]> = [
    ['portrait', { width: 390, height: 844 }],
    ['paysage', { width: 844, height: 390 }],
    ['carré', { width: 500, height: 500 }],
  ];

  for (const [name, viewport] of cases) {
    test(`${name} — même échelle en X et en Y, centré, une dimension égale le viewport`, () => {
      const fitted = fitScene({ viewport, ratio: RATIO });
      const scaleX = fitted.width / 1080;
      const scaleY = fitted.height / 1920;
      expect(Math.abs(scaleX - scaleY)).toBeLessThan(1e-9);
      expect(fitted.offsetX).toBeCloseTo((viewport.width - fitted.width) / 2, 9);
      expect(fitted.offsetY).toBeCloseTo((viewport.height - fitted.height) / 2, 9);
      const matchesViewport = Math.abs(fitted.width - viewport.width) < 1e-9 || Math.abs(fitted.height - viewport.height) < 1e-9;
      expect(matchesViewport).toBe(true);
    });
  }

  test('un viewport dégénéré rend une boîte nulle', () => {
    expect(fitScene({ viewport: { width: 0, height: 100 }, ratio: RATIO })).toEqual({ width: 0, height: 0, offsetX: 0, offsetY: 0 });
    expect(fitScene({ viewport: { width: 100, height: 0 }, ratio: RATIO })).toEqual({ width: 0, height: 0, offsetX: 0, offsetY: 0 });
    expect(fitScene({ viewport: { width: 100, height: 100 }, ratio: 0 })).toEqual({ width: 0, height: 0, offsetX: 0, offsetY: 0 });
  });
});

// T-B2 — la décision porteur 2026-09-17 (D-80) : le rapport de scène est
// TOUJOURS 9:16, qu'un `carrierAspect` soit déclaré ou non. Le témoin de rang
// de la décision porte sur le cas où `carrierAspect` EXISTE — le cas nominal
// (absent) ne prouverait pas qu'il est ignoré.
describe('sceneRatio — le rapport de scène est TOUJOURS 9:16 (T-B2, décision porteur 2026-09-17)', () => {
  test('sans carrierAspect ⇒ SCENE_RATIO', () => {
    expect(sceneRatio(sceneWith())).toBe(SCENE_RATIO);
  });

  test('avec carrierAspect: 4 (ancienne loi PÉRIMÉE) ⇒ SCENE_RATIO tout de même', () => {
    expect(sceneRatio(sceneWith(4))).toBe(SCENE_RATIO);
  });

  test('SCENE_RATIO === SCENE_ASPECT (lib/feed/scene-framing.ts) — les deux miroirs de CanvasGeometry.portraitRatio ne divergent jamais', () => {
    expect(SCENE_RATIO).toBe(SCENE_ASPECT);
  });
});
