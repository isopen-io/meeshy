import { describe, expect, test } from 'bun:test';

import {
  IDENTITY_POSE,
  SCALE_MAX,
  SCALE_MIN,
  clampPose,
  movedBy,
  rotatedBy,
  scaledBy,
  type StudioPose,
} from './studio-pose';

const pose = (partial: Partial<StudioPose> = {}): StudioPose => ({ ...IDENTITY_POSE, ...partial });

describe('clampPose — les bornes de `SceneObjectScalePolicy`, jamais réinventées', () => {
  test('la pose neutre est le centre, à l’échelle 1, sans rotation', () => {
    expect(IDENTITY_POSE).toEqual({ x: 0.5, y: 0.5, scale: 1, rotation: 0 });
  });

  test('l’ancre reste DANS la scène — un objet ne se perd jamais hors cadre', () => {
    expect(clampPose(pose({ x: 1.4, y: -0.3 }))).toEqual({ x: 1, y: 0, scale: 1, rotation: 0 });
  });

  test('l’échelle est bornée à 0,3 et 4 — les valeurs d’iOS', () => {
    expect(SCALE_MIN).toBe(0.3);
    expect(SCALE_MAX).toBe(4);
    expect(clampPose(pose({ scale: 12 })).scale).toBe(4);
    expect(clampPose(pose({ scale: 0.01 })).scale).toBe(0.3);
  });

  test('une échelle NULLE ou non finie revient à 1, jamais à la borne basse (parité iOS)', () => {
    expect(clampPose(pose({ scale: 0 })).scale).toBe(1);
    expect(clampPose(pose({ scale: Number.NaN })).scale).toBe(1);
    expect(clampPose(pose({ scale: -2 })).scale).toBe(1);
  });

  test('la rotation se ramène dans (−180, 180] — deux tours ne valent pas 720°', () => {
    expect(clampPose(pose({ rotation: 450 })).rotation).toBe(90);
    expect(clampPose(pose({ rotation: -450 })).rotation).toBe(-90);
    expect(clampPose(pose({ rotation: 180 })).rotation).toBe(180);
  });

  test('une rotation non finie retombe à zéro', () => {
    expect(clampPose(pose({ rotation: Number.NaN })).rotation).toBe(0);
  });
});

describe('les trois gestes rendent une pose DÉJÀ bornée', () => {
  test('déplacer ajoute une fraction de scène et reste dans le cadre', () => {
    expect(movedBy(pose(), 0.25, -0.25)).toEqual({ x: 0.75, y: 0.25, scale: 1, rotation: 0 });
    expect(movedBy(pose(), 9, 9)).toEqual({ x: 1, y: 1, scale: 1, rotation: 0 });
  });

  test('l’échelle est MULTIPLICATIVE — un pincement compose, il ne remplace pas', () => {
    expect(scaledBy(pose({ scale: 2 }), 1.5).scale).toBe(3);
    expect(scaledBy(pose({ scale: 3 }), 10).scale).toBe(SCALE_MAX);
  });

  test('un facteur d’échelle absurde ne casse pas la pose', () => {
    expect(scaledBy(pose(), 0).scale).toBe(1);
    expect(scaledBy(pose(), Number.NaN).scale).toBe(1);
  });

  test('tourner ajoute des degrés et se ramène dans le tour', () => {
    expect(rotatedBy(pose({ rotation: 170 }), 20).rotation).toBe(-170);
  });

  test('un geste ne touche QUE sa dimension', () => {
    expect(movedBy(pose({ scale: 2, rotation: 30 }), 0.1, 0)).toEqual({ x: 0.6, y: 0.5, scale: 2, rotation: 30 });
    expect(rotatedBy(pose({ x: 0.2, scale: 2 }), 15)).toEqual({ x: 0.2, y: 0.5, scale: 2, rotation: 15 });
  });
});
