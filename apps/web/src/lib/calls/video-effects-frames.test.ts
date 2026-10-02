import { describe, expect, test } from 'bun:test';

import { lookFilter } from '@/lib/media/photo-develop';

import { NO_EFFECTS, frameSettings, type FrameSettings, type VideoEffects } from './video-effects';
import { createFrameEngine, cropRect, frameTransform, timingsOf, type BlurStage, type FaceLayer, type FrameEnv } from './video-effects-frames';

/**
 * LE TRAITEMENT D'UNE IMAGE (#9099, #8471, #8441) — le même code dans le
 * worker et dans le repli du fil principal : ce qu'une image devient (brute,
 * floutée, recadrée, filtrée, coiffée d'un effet de visage), et ce que coûte
 * chaque image. Le canevas, le flou et le visage sont des doublures.
 */

const settings = (effects: Partial<VideoEffects> = {}, camera: { readonly nativeBlur?: boolean; readonly zoom?: number } = {}): FrameSettings => frameSettings({ ...NO_EFFECTS, ...effects }, { nativeBlur: camera.nativeBlur ?? false, zoom: camera.zoom ?? 1 });

type Draw = { readonly filter: string; readonly args: readonly unknown[] };

function harness(options: { readonly blur?: boolean; readonly face?: FaceLayer; readonly clock?: () => number } = {}) {
  const draws: Draw[] = [];
  const canvas = { name: 'surface' };
  const context = { filter: 'none', drawImage: (...args: unknown[]) => void draws.push({ filter: context.filter, args }) };
  const rendered: unknown[] = [];
  const blurred = { name: 'blurred' };
  const stage: BlurStage = { render: (source) => (rendered.push(source), blurred as unknown as CanvasImageSource), close: () => undefined };
  const env: FrameEnv = {
    surface: () => ({ canvas: canvas as unknown as CanvasImageSource, context: context as unknown as OffscreenCanvasRenderingContext2D, resize: () => undefined }),
    now: options.clock ?? (() => 0),
    ...(options.blur === true ? { blur: () => stage } : {}),
    ...(options.face === undefined ? {} : { face: options.face }),
  };
  return { env, draws, canvas, rendered, blurred };
}

const source = { name: 'frame' } as unknown as CanvasImageSource;

describe('une image', () => {
  test('rien à faire : l’image n’est pas touchée', () => {
    const h = harness();
    const engine = createFrameEngine(settings(), h.env);
    expect(engine.draw(source, 640, 480, 0)).toBeNull();
    expect(h.draws).toEqual([]);
  });

  test('une couleur : redessinée sous le filtre, avec le look léger des photos en tête', () => {
    const h = harness();
    const engine = createFrameEngine(settings({ preset: 'warm' }), h.env);
    expect(engine.draw(source, 640, 480, 0)).toBe(h.canvas as unknown as CanvasImageSource);
    expect(h.draws).toHaveLength(1);
    expect(h.draws[0]?.filter.startsWith(lookFilter())).toBe(true);
    expect(h.draws[0]?.args).toEqual([source, 0, 0]);
  });

  test('le zoom numérique recadre le centre et l’étire à la taille de l’image (#8441)', () => {
    const h = harness();
    const engine = createFrameEngine(settings({}, { zoom: 2 }), h.env);
    engine.draw(source, 640, 480, 0);
    expect(h.draws[0]?.args).toEqual([source, 160, 120, 320, 240, 0, 0, 640, 480]);
    expect(h.draws[0]?.filter).toBe('none');
  });

  test('zoomé, l’effet de visage se pose sur l’image RECADRÉE', () => {
    const seen: unknown[] = [];
    const h = harness({ face: (target) => void seen.push(target.source) });
    const engine = createFrameEngine(settings({ faceEffect: 'angel' }, { zoom: 2 }), h.env);
    engine.draw(source, 640, 480, 0);
    expect(seen).toEqual([h.canvas]);
  });

  test('sans zoom, l’effet de visage lit l’image d’origine, à l’heure de l’image', () => {
    const seen: Array<{ source: unknown; t: number }> = [];
    const h = harness({ face: (target) => void seen.push({ source: target.source, t: target.t }) });
    const engine = createFrameEngine(settings({ faceEffect: 'toad' }), h.env);
    engine.draw(source, 640, 480, 42);
    expect(seen).toEqual([{ source, t: 42 }]);
  });

  test('le flou seul : l’image floutée part telle quelle, sans repasser par le canevas (#8471)', () => {
    const h = harness({ blur: true });
    const engine = createFrameEngine(settings({ blur: true }), h.env);
    expect(engine.draw(source, 640, 480, 0)).toBe(h.blurred as unknown as CanvasImageSource);
    expect(h.rendered).toEqual([source]);
    expect(h.draws).toEqual([]);
  });

  test('le flou ET une couleur : la couleur se pose sur l’image floutée', () => {
    const h = harness({ blur: true });
    const engine = createFrameEngine(settings({ blur: true, preset: 'cool' }), h.env);
    engine.draw(source, 640, 480, 0);
    expect(h.draws[0]?.args[0]).toBe(h.blurred);
  });

  test('le flou que fait la caméra ne passe jamais par la segmentation', () => {
    const h = harness({ blur: true });
    const engine = createFrameEngine(settings({ blur: true }, { nativeBlur: true }), h.env);
    expect(engine.draw(source, 640, 480, 0)).toBeNull();
    expect(h.rendered).toEqual([]);
  });

  test('sans segmentation possible, le flou laisse l’image intacte', () => {
    const h = harness();
    const engine = createFrameEngine(settings({ blur: true }), h.env);
    expect(engine.draw(source, 640, 480, 0)).toBeNull();
  });

  test('changer de réglage change l’image SUIVANTE', () => {
    const h = harness();
    const engine = createFrameEngine(settings({ preset: 'warm' }), h.env);
    engine.draw(source, 640, 480, 0);
    engine.set(settings({ brightness: 0.2 }));
    engine.draw(source, 640, 480, 0);
    expect(h.draws[1]?.filter).toBe(`${lookFilter()} brightness(1.2)`);
  });
});

describe('le recadrage', () => {
  test('centré, à la taille divisée par le zoom', () => {
    expect(cropRect(1280, 720, 2)).toEqual({ x: 320, y: 180, width: 640, height: 360 });
    expect(cropRect(640, 480, 1)).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  test('un zoom inférieur à 1× ne déborde jamais de l’image', () => {
    expect(cropRect(640, 480, 0.5)).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });
});

describe('le coût de chaque image', () => {
  test('médiane, p95 et pire cas, sur les dernières images', () => {
    const durations = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(timingsOf(durations)).toEqual({ frames: 100, p50: 50, p95: 95, max: 100 });
    expect(timingsOf([])).toEqual({ frames: 0, p50: 0, p95: 0, max: 0 });
  });
});

type FakeFrame = { readonly displayWidth: number; readonly displayHeight: number; readonly timestamp: number; closed: boolean; close: () => void };

const videoFrame = (timestamp: number): FakeFrame => {
  const self: FakeFrame = { displayWidth: 640, displayHeight: 480, timestamp, closed: false, close: () => void (self.closed = true) };
  return self;
};

async function run(transformer: Transformer<VideoFrame, VideoFrame>, frame: FakeFrame): Promise<unknown[]> {
  const out: unknown[] = [];
  await transformer.transform?.(frame as unknown as VideoFrame, { enqueue: (chunk: VideoFrame) => void out.push(chunk) } as unknown as TransformStreamDefaultController<VideoFrame>);
  return out;
}

describe('le flux des images', () => {
  const derived = (_canvas: CanvasImageSource, init: { readonly timestamp: number }) => ({ derived: true, timestamp: init.timestamp }) as unknown as VideoFrame;

  test('une image intacte passe telle quelle, sans copie', async () => {
    const engine = createFrameEngine(settings(), harness().env);
    const frame = videoFrame(1000);
    expect(await run(frameTransform({ engine, frameFrom: derived, now: () => 0 }), frame)).toEqual([frame]);
    expect(frame.closed).toBe(false);
  });

  test('une image traitée sort avec SON horodatage, et l’originale est relâchée', async () => {
    const engine = createFrameEngine(settings({ preset: 'warm' }), harness().env);
    const frame = videoFrame(2000);
    expect(await run(frameTransform({ engine, frameFrom: derived, now: () => 0 }), frame)).toEqual([{ derived: true, timestamp: 2000 }]);
    expect(frame.closed).toBe(true);
  });

  test('une image qu’on n’a pas su traiter part quand même, originale', async () => {
    const engine = createFrameEngine(settings({ preset: 'warm' }), harness().env);
    const frame = videoFrame(3000);
    const failing = () => {
      throw new Error('frame');
    };
    expect(await run(frameTransform({ engine, frameFrom: failing, now: () => 0 }), frame)).toEqual([frame]);
    expect(frame.closed).toBe(false);
  });

  test('chaque image traitée compte son coût, et le relevé part une fois par seconde', async () => {
    let clock = 0;
    const reports: number[] = [];
    const engine = createFrameEngine(settings({ preset: 'warm' }), harness().env);
    const transformer = frameTransform({
      engine,
      frameFrom: (_canvas, init) => {
        clock += 3;
        return { timestamp: init.timestamp } as unknown as VideoFrame;
      },
      now: () => clock,
      report: (timings) => void reports.push(timings.frames),
    });
    await run(transformer, videoFrame(1));
    clock = 1500;
    await run(transformer, videoFrame(2));
    expect(engine.timings()).toEqual({ frames: 2, p50: 3, p95: 3, max: 3 });
    expect(reports).toEqual([2]);
  });
});
