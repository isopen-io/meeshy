import { describe, expect, test } from 'bun:test';

import type { Lens, LensLayer } from '@meeshy/shared/types/lens-format';

import type { LandmarkerPort } from '@/lib/calls/face-landmark-detector';
import type { FaceDetectorPort } from '@/lib/calls/face-tracker';

import { browserLensStage } from './lens-browser';
import { lensUsesFace } from './lens-plan';
import { createLensStage, type LensSettings } from './lens-stage';

/**
 * UNE LENS SANS ANCRE DE VISAGE NE CHERCHE PAS DE VISAGE (W15, #11321) — c'est
 * ce qui fait du modèle à 478 points un chargement « à la première lens de
 * visage seulement » : l'étage n'interroge le suiveur que si la lens en a besoin.
 */
const LENS: Lens = {
  schema: 1,
  id: 'essai',
  name: 'Essai',
  credits: { author: 'Studio', createdAt: '2026-10-01' },
  surfaces: ['live'],
  cost: 'light',
  window: { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' },
  layers: [],
  triggers: [],
};

const withLayers = (layers: readonly LensLayer[]): Lens => ({ ...LENS, layers });
const onFace: LensLayer = { kind: 'sticker', id: 'couronne', asset: 'aaaaaaaaaaaaaaaa.png', anchor: { type: 'face', point: 'top-of-head' }, size: 0.5 };
const onScreen: LensLayer = { kind: 'sticker', id: 'logo', asset: 'bbbbbbbbbbbbbbbb.png', anchor: { type: 'screen', x: 0.5, y: 0.5 }, size: 0.2 };
const grade: LensLayer = { kind: 'lut', id: 'g', asset: 'cccccccccccccccc.png' };
const snow: LensLayer = { kind: 'particles', id: 'neige', preset: 'snow', density: 'low' };
const snowOnFace: LensLayer = { kind: 'particles', id: 'aura', preset: 'sparkles', density: 'low', anchor: { type: 'face', point: 'forehead' } };

describe('lensUsesFace', () => {
  test('une ancre de visage, sur un sticker, un texte ou des particules', () => {
    expect(lensUsesFace(withLayers([onFace]))).toBe(true);
    expect(lensUsesFace(withLayers([grade, snowOnFace]))).toBe(true);
  });

  test('ni LUT, ni cadre, ni ancre d’écran, ni particules libres', () => {
    expect(lensUsesFace(withLayers([]))).toBe(false);
    expect(lensUsesFace(withLayers([grade, onScreen, snow]))).toBe(false);
  });

  test('une couche de visage que le palier masque ne compte pas', () => {
    const lens: Lens = { ...withLayers([grade, onFace, snowOnFace]), fallbacks: { reduced: { hide: ['couronne'] } } };
    expect(lensUsesFace(lens, 'full')).toBe(true);
    expect(lensUsesFace(lens, 'reduced')).toBe(true);
    expect(lensUsesFace(lens, 'minimal')).toBe(false);
    expect(lensUsesFace({ ...withLayers([onFace]), fallbacks: { reduced: { hide: ['couronne'] } } }, 'reduced')).toBe(false);
  });
});

describe('l’étage ne demande le visage que s’il sert', () => {
  const size = { width: 1280, height: 720 };
  const source = {} as unknown as CanvasImageSource;
  const settingsOf = (layers: readonly LensLayer[]): LensSettings => ({ lens: withLayers(layers), languages: ['fr'], level: 'full' });
  const stageWith = () => {
    const asked: number[] = [];
    const stage = createLensStage({ face: () => (asked.push(1), { x: 0, y: 0, width: 10, height: 10 }), cube: () => null, paint: { assets: () => null } });
    return { stage, asked };
  };

  test('une lens sans ancre de visage ne le demande jamais', () => {
    const { stage, asked } = stageWith();
    stage.plan(settingsOf([grade, onScreen, snow]), source, size, 0);
    stage.plan(settingsOf([]), source, size, 40);
    expect(asked).toHaveLength(0);
  });

  test('une lens ancrée au visage le demande à chaque image', () => {
    const { stage, asked } = stageWith();
    stage.plan(settingsOf([onFace]), source, size, 0);
    stage.plan(settingsOf([onFace]), source, size, 40);
    expect(asked).toHaveLength(2);
  });

  test('sans ancre de visage, le plan reste celui d’une boîte supposée au centre', () => {
    const { stage } = stageWith();
    const [op] = stage.plan(settingsOf([onScreen]), source, size, 0);
    expect(op?.kind === 'sticker' ? [op.x, op.y] : null).toEqual([640, 360]);
  });
});

describe('l’étage du navigateur rend le modèle à sa fermeture', () => {
  const size = { width: 320, height: 180 };
  const source = { width: 320, height: 180 } as unknown as CanvasImageSource;
  const settings: LensSettings = { lens: withLayers([onFace]), languages: ['fr'], level: 'full' };
  const browser: FaceDetectorPort = { detect: async () => [] };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const stageWith = () => {
    const calls = { loads: 0, closed: 0, tracked: 0 };
    const landmarker: LandmarkerPort = { detect: () => null, close: () => void (calls.closed += 1) };
    const stage = browserLensStage({
      face: {
        track: (detector) => (source, frame) => (calls.tracked += 1, void detector.detect(source), { x: 0, y: 0, width: frame.width / 2, height: frame.height / 2 }),
        browserDetector: () => browser,
        tier: () => 'high',
        now: () => 1,
        load: async () => (calls.loads += 1, landmarker),
      },
    });
    return { stage, calls };
  };

  test('une lens de visage charge le modèle une fois, et la fermeture de l’étage le rend', async () => {
    const { stage, calls } = stageWith();
    stage.plan(settings, source, size, 0);
    stage.plan(settings, source, size, 40);
    await flush();
    stage.close();
    expect(calls.loads).toBe(1);
    expect(calls.closed).toBe(1);
  });

  test('une lens sans visage ne bâtit ni suiveur ni modèle', async () => {
    const { stage, calls } = stageWith();
    stage.plan({ ...settings, lens: withLayers([onScreen]) }, source, size, 0);
    await flush();
    stage.close();
    expect([calls.tracked, calls.loads, calls.closed]).toEqual([0, 0, 0]);
  });
});
