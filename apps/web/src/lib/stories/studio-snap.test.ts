import { describe, expect, test } from 'bun:test';

import { STUDIO_SNAP_TARGETS, STUDIO_SNAP_TOLERANCE, snapPose, snapValue } from './studio-snap';

/** LES LIGNES MAGNÉTIQUES (#8413) — miroir de `StoryCanvasUIView.snapTargets`
 * et `snapTolerance` : les mêmes cibles sur les deux axes, la même portée. */
describe('les cibles d’aimantage — celles d’iOS, sur les deux axes', () => {
  test('0.18, 0.25, 0.5, 0.75, 0.82, à 0.02 près', () => {
    expect(STUDIO_SNAP_TARGETS).toEqual([0.18, 0.25, 0.5, 0.75, 0.82]);
    expect(STUDIO_SNAP_TOLERANCE).toBe(0.02);
  });
});

describe('snapValue — une valeur proche d’une cible s’y accroche', () => {
  test('0.51 s’accroche au centre, et le dit', () => {
    expect(snapValue(0.51)).toEqual({ value: 0.5, target: 0.5 });
  });

  test('0.19 s’accroche à 0.18 — la cible la plus proche, jamais la première venue', () => {
    expect(snapValue(0.19)).toEqual({ value: 0.18, target: 0.18 });
    expect(snapValue(0.235)).toEqual({ value: 0.25, target: 0.25 });
  });

  test('hors de portée, la valeur reste libre', () => {
    expect(snapValue(0.4)).toEqual({ value: 0.4, target: null });
    expect(snapValue(0.5 + STUDIO_SNAP_TOLERANCE)).toEqual({ value: 0.52, target: null });
  });
});

describe('snapPose — chaque axe s’aimante seul, l’échelle et la rotation ne bougent pas', () => {
  test('x accroché, y libre', () => {
    const snapped = snapPose({ x: 0.745, y: 0.4, scale: 1.3, rotation: 12 });
    expect(snapped.pose).toEqual({ x: 0.75, y: 0.4, scale: 1.3, rotation: 12 });
    expect(snapped.engaged).toEqual({ x: 0.75, y: null });
  });
});
