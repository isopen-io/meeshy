import { describe, expect, test } from 'bun:test';

import type { DeviceTier } from '../device/capability-tier';

import { createLandmarkDetector, type LandmarkerPort } from './face-landmark-detector';
import { FACE_LANDMARK_COUNT, type FaceLandmarks } from './face-landmarks';
import type { FaceDetectorPort } from './face-tracker';

/**
 * LE DÉTECTEUR À 478 POINTS, CHARGÉ À LA DEMANDE (W15, #11321) — le modèle ne
 * se charge qu'au PREMIER visage demandé, qu'une fois, et que sur un appareil
 * de palier A (high, pro). Tant qu'il charge — ou s'il échoue — le détecteur
 * du navigateur répond : rien ne régresse.
 */
const source = { width: 320, height: 180 } as unknown as CanvasImageSource;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const points = (): FaceLandmarks => Array.from({ length: FACE_LANDMARK_COUNT }, (_, index) => ({ x: index === 0 ? 0.25 : index === 1 ? 0.75 : 0.5, y: index === 0 ? 0.25 : index === 1 ? 0.75 : 0.5, z: 0 }));

const browserBox = { x: 1, y: 2, width: 3, height: 4 };
const browser: FaceDetectorPort = { detect: async () => [{ boundingBox: browserBox }] };

function harness(options: { readonly tier: DeviceTier; readonly fallback?: FaceDetectorPort | null; readonly fail?: boolean }) {
  const loads: number[] = [];
  const stamps: number[] = [];
  let closed = 0;
  const landmarker: LandmarkerPort = {
    detect: (_image, timestampMs) => (stamps.push(timestampMs), points()),
    close: () => void (closed += 1),
  };
  let clock = 1000;
  const detector = createLandmarkDetector({
    load: () => (loads.push(1), options.fail === true ? Promise.reject(new Error('réseau')) : Promise.resolve(landmarker)),
    tier: () => options.tier,
    fallback: options.fallback === undefined ? browser : options.fallback,
    now: () => (clock += 33),
  });
  return { detector, loads, stamps, closed: () => closed };
}

describe('le chargement à la demande', () => {
  test('rien ne charge tant qu’aucun visage n’est demandé', async () => {
    const h = harness({ tier: 'high' });
    await flush();
    expect(h.loads).toHaveLength(0);
  });

  test('le premier visage lance UN chargement, répondu par le navigateur ; le suivant lit 478 points', async () => {
    const h = harness({ tier: 'high' });
    expect(await h.detector.detect(source)).toEqual([{ boundingBox: browserBox }]);
    await flush();
    const [found] = await h.detector.detect(source);
    await h.detector.detect(source);
    expect(h.loads).toHaveLength(1);
    expect(found?.landmarks).toHaveLength(FACE_LANDMARK_COUNT);
    expect(found?.boundingBox).toEqual({ x: 80, y: 45, width: 160, height: 90 });
  });

  test('l’horloge qu’on donne au modèle ne recule jamais', async () => {
    const h = harness({ tier: 'pro' });
    await h.detector.detect(source);
    await flush();
    await h.detector.detect(source);
    await h.detector.detect(source);
    expect(h.stamps.every((stamp, index) => index === 0 || stamp > (h.stamps[index - 1] ?? 0))).toBe(true);
  });

  test('sans détecteur du navigateur, aucun visage tant que le modèle charge', async () => {
    const h = harness({ tier: 'high', fallback: null });
    expect(await h.detector.detect(source)).toEqual([]);
  });
});

describe('le palier A seulement', () => {
  test.each(['low', 'mid'] as const)('un appareil %s ne charge jamais le modèle et garde le navigateur', async (tier) => {
    const h = harness({ tier });
    await h.detector.detect(source);
    await flush();
    expect(await h.detector.detect(source)).toEqual([{ boundingBox: browserBox }]);
    expect(h.loads).toHaveLength(0);
  });

  test.each(['high', 'pro'] as const)('un appareil %s charge le modèle', async (tier) => {
    const h = harness({ tier });
    await h.detector.detect(source);
    expect(h.loads).toHaveLength(1);
  });
});

describe('un modèle qui ne charge pas', () => {
  test('le navigateur répond, et le chargement n’est pas rejoué à chaque image', async () => {
    const h = harness({ tier: 'high', fail: true });
    await h.detector.detect(source);
    await flush();
    expect(await h.detector.detect(source)).toEqual([{ boundingBox: browserBox }]);
    await h.detector.detect(source);
    expect(h.loads).toHaveLength(1);
  });

  test('un modèle qui lève sur une image retombe sur le navigateur', async () => {
    const throwing: LandmarkerPort = { detect: () => { throw new Error('perdu'); }, close: () => undefined };
    const detector = createLandmarkDetector({ load: async () => throwing, tier: () => 'high', fallback: browser, now: () => 1 });
    await detector.detect(source);
    await flush();
    expect(await detector.detect(source)).toEqual([{ boundingBox: browserBox }]);
  });

  test('un visage que le modèle ne voit pas : aucun visage', async () => {
    const blind: LandmarkerPort = { detect: () => null, close: () => undefined };
    const detector = createLandmarkDetector({ load: async () => blind, tier: () => 'high', fallback: browser, now: () => 1 });
    await detector.detect(source);
    await flush();
    expect(await detector.detect(source)).toEqual([]);
  });

  test('close rend le modèle', async () => {
    const h = harness({ tier: 'high' });
    await h.detector.detect(source);
    await flush();
    h.detector.close();
    expect(h.closed()).toBe(1);
  });
});
