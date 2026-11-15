import type { StudioPose } from './studio-pose';

/**
 * **LES LIGNES MAGNÉTIQUES DU PLATEAU** (#8413, directive porteur 2026-09-27)
 * — miroir de `StoryCanvasUIView.snapTargets` / `snapTolerance`
 * (`StoryCanvasUIView.swift:1113-1114`) : pendant un déplacement, le centre de
 * l'objet s'accroche aux mêmes fractions de la scène, sur les deux axes. Les
 * lignes TRACÉES (`story-compose-limits.tsx`) sont ces cibles et rien d'autre
 * (`magneticLineTargets`, `StoryCanvasUIView+Limits.swift`).
 */
export const STUDIO_SNAP_TARGETS: readonly number[] = [0.18, 0.25, 0.5, 0.75, 0.82];

export const STUDIO_SNAP_TOLERANCE = 0.02;

export type SnappedValue = { readonly value: number; readonly target: number | null };

/** La cible LA PLUS PROCHE dans la portée (strictement), sinon la valeur
 * libre. iOS prend la première dans la portée ; les cibles étant espacées de
 * plus de deux portées, les deux lois rendent le même verdict. */
export function snapValue(value: number): SnappedValue {
  const target = STUDIO_SNAP_TARGETS.filter((candidate) => Math.abs(value - candidate) < STUDIO_SNAP_TOLERANCE).sort(
    (a, b) => Math.abs(value - a) - Math.abs(value - b),
  )[0];
  return target === undefined ? { value, target: null } : { value: target, target };
}

export type SnapEngaged = { readonly x: number | null; readonly y: number | null };

export function snapPose(pose: StudioPose): { readonly pose: StudioPose; readonly engaged: SnapEngaged } {
  const x = snapValue(pose.x);
  const y = snapValue(pose.y);
  return { pose: { ...pose, x: x.value, y: y.value }, engaged: { x: x.target, y: y.target } };
}
