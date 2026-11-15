import { describe, expect, test } from 'bun:test';

import { FACE_LANDMARK_COUNT, landmarksBox, landmarksTierAllows, type FaceLandmarks } from './face-landmarks';

/**
 * LES 478 POINTS DU VISAGE (W15, #11321) — MediaPipe Face Landmarker les rend
 * NORMALISÉS à l'image qu'il a lue : la boîte du visage s'en déduit à
 * l'échelle de n'importe quelle image, et le palier A seul les lit.
 */
const grid = (): FaceLandmarks => Array.from({ length: FACE_LANDMARK_COUNT }, (_, index) => ({ x: 0.3 + (index % 20) * 0.01, y: 0.2 + Math.floor(index / 20) * 0.01, z: 0 }));

describe('la boîte des points', () => {
  test('un visage a 478 points', () => {
    expect(FACE_LANDMARK_COUNT).toBe(478);
  });

  test('la boîte englobe les points, à l’échelle de l’image', () => {
    const points: FaceLandmarks = [
      { x: 0.25, y: 0.5, z: 0 },
      { x: 0.75, y: 0.25, z: 0.1 },
      { x: 0.5, y: 0.75, z: -0.1 },
    ];
    expect(landmarksBox(points, { width: 200, height: 100 })).toEqual({ x: 50, y: 25, width: 100, height: 50 });
  });

  test('478 points donnent une boîte non vide, sans points aucune', () => {
    const box = landmarksBox(grid(), { width: 320, height: 180 });
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
    expect(landmarksBox([], { width: 320, height: 180 })).toBeNull();
  });

  test('une image sans surface n’a pas de boîte', () => {
    expect(landmarksBox(grid(), { width: 0, height: 180 })).toBeNull();
  });
});

describe('le palier A seulement', () => {
  test('high et pro lisent les points, low et mid gardent le détecteur du navigateur', () => {
    expect((['low', 'mid', 'high', 'pro'] as const).map(landmarksTierAllows)).toEqual([false, false, true, true]);
  });
});
