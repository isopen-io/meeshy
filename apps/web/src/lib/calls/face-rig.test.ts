import { describe, expect, test } from 'bun:test';

import { FACE_LANDMARK_COUNT, type FaceLandmarks } from './face-landmarks';
import type { LandmarkerPort } from './face-landmark-detector';
import { poseOf } from './face-pose';
import { BABY_EYE_SCALE, createFaceRig, eyeLensOf } from './face-rig';
import { lazyFaceRig, type FaceRig } from './face-rig-port';
import type { SpriteSurface } from './face-effects-draw';
import type { FaceTarget } from './video-effects-pipeline';

/**
 * LE GRÉEMENT DU VISAGE (#19779) — chargé au premier effet de visage, hors du
 * worker des effets qui a son plafond : le détecteur à 478 points (palier A,
 * repli sur celui du navigateur), la POSE qu'il en tire, et la LOUPE des yeux
 * du bébé. Tant qu'il n'est pas là, rien ne change : le détecteur du
 * navigateur répond, aucune pose, aucune loupe.
 */

const frame = { width: 1000, height: 500 };
const source = {} as CanvasImageSource;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const PLACED: Readonly<Record<number, readonly [number, number]>> = {
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

const POINTS: FaceLandmarks = Array.from({ length: FACE_LANDMARK_COUNT }, (_, index) => {
  const at = PLACED[index];
  return at === undefined ? { x: 0.5, y: 0.5, z: 0 } : { x: at[0] / frame.width, y: at[1] / frame.height, z: 0 };
});

const browser = (calls: string[]) => ({ detect: async () => (calls.push('browser'), [{ boundingBox: { x: 1, y: 2, width: 3, height: 4 } }]) });

const landmarker = (closed: string[]): LandmarkerPort => ({ detect: () => POINTS, close: () => void closed.push('closed') });

type Call = { readonly key: string; readonly args: readonly unknown[] };

const tracing = () => {
  const calls: Call[] = [];
  const sets: { readonly key: string; readonly value: unknown }[] = [];
  const canvas = { painted: true } as unknown as CanvasImageSource;
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'canvas') return canvas;
        return (...args: unknown[]) => {
          calls.push({ key: String(key), args });
          return key === 'createRadialGradient' ? gradient : undefined;
        };
      },
      set: (_target, key, value) => {
        sets.push({ key: String(key), value });
        return true;
      },
    },
  ) as unknown as FaceTarget['context'];
  return { calls, sets, canvas, context };
};

const surfaces = () => {
  const made: ReturnType<typeof tracing>[] = [];
  const surface = (width: number, height: number): SpriteSurface => {
    const traced = tracing();
    made.push(traced);
    return { canvas: { width, height } as unknown as CanvasImageSource, context: traced.context };
  };
  return { made, surface };
};

const targetOf = (context: FaceTarget['context']): FaceTarget => ({ context, source, width: frame.width, height: frame.height, t: 0 });

describe('le détecteur du gréement', () => {
  test('palier B : le détecteur du navigateur répond, aucun modèle chargé, aucune pose', async () => {
    const calls: string[] = [];
    let loads = 0;
    const rig = createFaceRig({ fallback: browser(calls), tier: () => 'mid', now: () => 0, surface: () => null, load: async () => (loads++, landmarker([])) });
    expect(await rig.detector.detect(source)).toHaveLength(1);
    expect(calls).toEqual(['browser']);
    expect(loads).toBe(0);
    expect(rig.pose(frame)).toBeNull();
  });

  test('palier A : les 478 repères, et la pose qu’ils disent, en pixels de l’image', async () => {
    const closed: string[] = [];
    const rig = createFaceRig({ fallback: browser([]), tier: () => 'high', now: () => 0, surface: () => null, load: async () => landmarker(closed) });
    await rig.detector.detect(source);
    await flush();
    const found = await rig.detector.detect({ width: 1000, height: 500 } as unknown as CanvasImageSource);
    expect(found).toHaveLength(1);
    expect(rig.pose(frame)).toEqual(poseOf(POINTS, frame));
    rig.close();
    expect(closed).toEqual(['closed']);
    expect(rig.pose(frame)).toBeNull();
  });
});

describe('la loupe des yeux du bébé', () => {
  test('elle lit une région plus PETITE que celle où elle peint, centrées sur l’œil : l’œil grandit de BABY_EYE_SCALE', () => {
    const eye = { cx: 300, cy: 200, r: 20 };
    const lens = eyeLensOf(eye);
    expect(BABY_EYE_SCALE).toBeGreaterThanOrEqual(1.3);
    expect(BABY_EYE_SCALE).toBeLessThanOrEqual(1.4);
    expect(lens.to.size / lens.from.size).toBeCloseTo(BABY_EYE_SCALE, 5);
    expect(lens.from.x + lens.from.size / 2).toBeCloseTo(eye.cx, 5);
    expect(lens.to.y + lens.to.size / 2).toBeCloseTo(eye.cy, 5);
    expect(lens.to.size).toBeGreaterThan(eye.r * 2);
  });

  test('chaque œil : la région lue sur l’image PEINTE, grossie dans une surface de travail, découpée par un masque rond, reposée centrée sur l’œil', () => {
    const { made, surface } = surfaces();
    const rig = createFaceRig({ fallback: null, tier: () => 'low', now: () => 0, surface });
    const main = tracing();
    const eyes = [
      { cx: 445, cy: 200, r: 25 },
      { cx: 555, cy: 200, r: 25 },
    ];
    rig.magnify(targetOf(main.context), eyes);
    const back = main.calls.filter((call) => call.key === 'drawImage');
    expect(back).toHaveLength(2);
    eyes.forEach((eye, index) => {
      const lens = eyeLensOf(eye);
      const [, , , , , dx, dy, dw, dh] = (back[index]?.args ?? []) as number[];
      expect(dx).toBeCloseTo(lens.to.x, 5);
      expect(dy).toBeCloseTo(lens.to.y, 5);
      expect(dw).toBeCloseTo(lens.to.size, 0);
      expect(dh).toBeCloseTo(lens.to.size, 0);
    });
    const work = made.find((traced) => traced.calls.some((call) => call.key === 'drawImage' && call.args[0] === main.canvas));
    const read = work?.calls.find((call) => call.key === 'drawImage' && call.args[0] === main.canvas);
    const lens = eyeLensOf(eyes[0] ?? { cx: 0, cy: 0, r: 0 });
    expect(read?.args.slice(1, 5)).toEqual([lens.from.x, lens.from.y, lens.from.size, lens.from.size]);
    expect(work?.sets.some((set) => set.key === 'globalCompositeOperation' && set.value === 'destination-in')).toBe(true);
  });

  test('le masque rond se peint UNE fois, quel que soit le nombre d’images', () => {
    const { made, surface } = surfaces();
    const rig = createFaceRig({ fallback: null, tier: () => 'low', now: () => 0, surface });
    const eyes = [{ cx: 445, cy: 200, r: 25 }];
    rig.magnify(targetOf(tracing().context), eyes);
    const gradients = () => made.flatMap((traced) => traced.calls).filter((call) => call.key === 'createRadialGradient').length;
    const first = gradients();
    rig.magnify(targetOf(tracing().context), eyes);
    rig.magnify(targetOf(tracing().context), eyes);
    expect(first).toBe(1);
    expect(gradients()).toBe(1);
  });

  test('sans surface de travail, l’œil se grossit dans un disque découpé, sans masque', () => {
    const rig = createFaceRig({ fallback: null, tier: () => 'low', now: () => 0, surface: () => null });
    const main = tracing();
    rig.magnify(targetOf(main.context), [{ cx: 445, cy: 200, r: 25 }]);
    expect(main.calls.map((call) => call.key)).toEqual(['save', 'beginPath', 'arc', 'clip', 'drawImage', 'restore']);
    expect(main.calls.find((call) => call.key === 'drawImage')?.args[0]).toBe(main.canvas);
  });
});

describe('le gréement chargé à la demande', () => {
  const stub = (calls: string[]): FaceRig => ({
    detector: { detect: async () => (calls.push('rig'), []) },
    pose: () => poseOf(POINTS, frame),
    magnify: () => void calls.push('magnify'),
    close: () => void calls.push('close'),
  });

  test('avant son arrivée, le détecteur du navigateur répond ; ni pose, ni loupe ; il n’est demandé qu’une fois', async () => {
    const calls: string[] = [];
    let asked = 0;
    const rig = lazyFaceRig(() => (asked++, new Promise<FaceRig>(() => undefined)), browser(calls));
    await rig.detector.detect(source);
    await rig.detector.detect(source);
    rig.magnify(targetOf(tracing().context), []);
    expect(calls).toEqual(['browser', 'browser']);
    expect(rig.pose(frame)).toBeNull();
    expect(asked).toBe(1);
  });

  test('arrivé, il répond à la place du navigateur, rend sa pose et sa loupe, et se ferme avec le calque', async () => {
    const calls: string[] = [];
    const rig = lazyFaceRig(async () => stub(calls), browser(calls));
    await rig.detector.detect(source);
    await flush();
    await rig.detector.detect(source);
    rig.magnify(targetOf(tracing().context), []);
    expect(rig.pose(frame)).toEqual(poseOf(POINTS, frame));
    rig.close();
    expect(calls).toEqual(['browser', 'rig', 'magnify', 'close']);
    expect(rig.pose(frame)).toBeNull();
  });

  test('un gréement qui ne se charge pas laisse le navigateur répondre, sans le redemander ; sans navigateur, aucun visage', async () => {
    let asked = 0;
    const rig = lazyFaceRig(() => (asked++, Promise.reject(new Error('hors ligne'))), null);
    expect(await rig.detector.detect(source)).toEqual([]);
    await flush();
    expect(await rig.detector.detect(source)).toEqual([]);
    expect(asked).toBe(1);
  });

  test('fermé avant d’arriver, il se ferme dès qu’il arrive', async () => {
    const calls: string[] = [];
    const rig = lazyFaceRig(async () => stub(calls), null);
    await rig.detector.detect(source);
    rig.close();
    await flush();
    expect(calls).toEqual(['close']);
    expect(rig.pose(frame)).toBeNull();
  });
});
