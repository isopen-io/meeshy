import { describe, expect, test } from 'bun:test';

import { FACE_LANDMARK_COUNT, type FaceLandmark } from './face-landmarks';
import { poseOf, smoothPose } from './face-pose';

/**
 * LA POSE DU VISAGE (#19779) — ce que les 478 repères disent que la boîte ne
 * dit pas : où sont les deux yeux, où sont le front et le menton, et de
 * combien la tête penche. Le halo, les cornes et les yeux du bébé s'y posent ;
 * une boîte seule ne sait rien de l'inclinaison.
 */

const frame = { width: 1000, height: 500 };

type Placed = Readonly<Record<number, readonly [number, number]>>;

/** Un visage DEBOUT, en pixels : front (500, 100), menton (500, 400), joues à 400 et 600, yeux à (445, 200) et (555, 200). */
const UPRIGHT: Placed = {
  10: [500, 100],
  152: [500, 400],
  234: [400, 250],
  454: [600, 250],
  33: [420, 200],
  133: [470, 200],
  468: [445, 200],
  362: [530, 200],
  263: [580, 200],
  473: [555, 200],
};

const rotated = (placed: Placed, degrees: number): Placed => {
  const angle = (degrees * Math.PI) / 180;
  const [cx, cy] = [500, 250];
  return Object.fromEntries(
    Object.entries(placed).map(([index, [x, y]]) => [index, [cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle), cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle)] as const]),
  );
};

const mirrored = (placed: Placed): Placed => Object.fromEntries(Object.entries(placed).map(([index, [x, y]]) => [index, [frame.width - x, y] as const]));

const landmarksOf = (placed: Placed, count = FACE_LANDMARK_COUNT): readonly FaceLandmark[] =>
  Array.from({ length: count }, (_, index) => {
    const at = placed[index];
    return at === undefined ? { x: 0.5, y: 0.5, z: 0 } : { x: at[0] / frame.width, y: at[1] / frame.height, z: 0 };
  });

describe('la pose d’un visage debout', () => {
  test('la boîte va du front au menton et d’une joue à l’autre ; les yeux sont les iris, leur rayon la demi-largeur de l’œil ; aucune inclinaison', () => {
    const pose = poseOf(landmarksOf(UPRIGHT), frame);
    expect(pose?.roll).toBeCloseTo(0, 5);
    expect(pose?.face.x).toBeCloseTo(400, 5);
    expect(pose?.face.y).toBeCloseTo(100, 5);
    expect(pose?.face.width).toBeCloseTo(200, 5);
    expect(pose?.face.height).toBeCloseTo(300, 5);
    expect(pose?.eyes.map((eye) => [Math.round(eye.cx), Math.round(eye.cy), Math.round(eye.r)])).toEqual([
      [445, 200, 25],
      [555, 200, 25],
    ]);
  });

  test('sans les iris (468 repères), l’œil est le milieu de ses deux coins', () => {
    const pose = poseOf(landmarksOf({ ...UPRIGHT, 468: [0, 0] }, 468), frame);
    expect(pose?.eyes.map((eye) => [Math.round(eye.cx), Math.round(eye.cy)])).toEqual([
      [445, 200],
      [555, 200],
    ]);
  });
});

describe('la tête qui penche', () => {
  test('l’inclinaison se lit sur la ligne des yeux ; la boîte garde sa taille, dans le repère du visage', () => {
    const pose = poseOf(landmarksOf(rotated(UPRIGHT, 20)), frame);
    expect(((pose?.roll ?? 0) * 180) / Math.PI).toBeCloseTo(20, 3);
    expect(pose?.face.width).toBeCloseTo(200, 3);
    expect(pose?.face.height).toBeCloseTo(300, 3);
    expect((pose?.face.x ?? 0) + (pose?.face.width ?? 0) / 2).toBeCloseTo(500, 3);
  });

  test('une image en miroir ne retourne pas la tête : l’inclinaison reste petite', () => {
    const pose = poseOf(landmarksOf(mirrored(rotated(UPRIGHT, 12))), frame);
    expect(((pose?.roll ?? 0) * 180) / Math.PI).toBeCloseTo(-12, 3);
  });
});

describe('aucune pose', () => {
  test('sans assez de repères, ou sur une image vide', () => {
    expect(poseOf([], frame)).toBeNull();
    expect(poseOf(landmarksOf(UPRIGHT), { width: 0, height: 500 })).toBeNull();
  });

  test('un visage écrasé en un point n’a pas de pose', () => {
    expect(poseOf(landmarksOf({}), frame)).toBeNull();
  });
});

describe('la pose glisse d’une lecture à l’autre', () => {
  test('sans pose connue, la nouvelle ; sinon, un pas vers elle', () => {
    const from = poseOf(landmarksOf(UPRIGHT), frame);
    const to = poseOf(landmarksOf(rotated(UPRIGHT, 20)), frame);
    if (from === null || to === null) throw new Error('pose attendue');
    expect(smoothPose(null, to)).toBe(to);
    const step = smoothPose(from, to);
    expect(step.roll).toBeGreaterThan(0);
    expect(step.roll).toBeLessThan(to.roll);
    expect(step.eyes[0].cx).not.toBe(from.eyes[0].cx);
    const settled = Array.from({ length: 60 }).reduce<typeof from>((pose) => smoothPose(pose, to), from);
    expect(settled.roll).toBeCloseTo(to.roll, 3);
  });
});
