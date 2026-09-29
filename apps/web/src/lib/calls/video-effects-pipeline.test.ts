import { describe, expect, test } from 'bun:test';

import { createEffectsPipeline, type FaceLayer, type PipelineEnv } from './video-effects-pipeline';
import { NO_EFFECTS, type VideoEffects } from './video-effects';

/**
 * LE TRAITEMENT DES IMAGES ENVOYÉES (#8442) — chaque image de la caméra passe
 * par le filtre, et sort sur une piste neuve que les liens envoient. Les
 * images, le canevas et les flux sont des doublures : ces témoins gardent ce
 * qui arrive à CHAQUE image (filtrée, horodatée, jamais perdue).
 */

type FakeFrame = { readonly id: number; readonly displayWidth: number; readonly displayHeight: number; readonly timestamp: number; closed: boolean; close: () => void };

const frame = (id: number): FakeFrame => {
  const self: FakeFrame = { id, displayWidth: 640, displayHeight: 480, timestamp: id * 1000, closed: false, close: () => void (self.closed = true) };
  return self;
};

const fakeTrack = () => {
  const self = { kind: 'video', readyState: 'live', stop: () => void (self.readyState = 'ended'), getSettings: () => ({ frameRate: 24 }) };
  return self;
};

const warm: VideoEffects = { ...NO_EFFECTS, preset: 'warm' };

function framesHarness(options: { readonly failDraw?: boolean; readonly face?: FaceLayer } = {}) {
  const incoming: FakeFrame[] = [];
  let push: ((value: FakeFrame) => void) | null = null;
  const readable = new ReadableStream<FakeFrame>({ start: (controller) => void (push = (value) => controller.enqueue(value)) });
  const written: unknown[] = [];
  const output = fakeTrack();
  const draws: string[] = [];
  const context = { filter: 'none', drawImage: () => {
    if (options.failDraw === true) throw new Error('draw');
    draws.push(context.filter);
  } };
  const env: PipelineEnv = {
    frames: {
      processor: () => ({ readable: readable as unknown as ReadableStream<VideoFrame> }),
      generator: () => ({ track: output as unknown as MediaStreamTrack, writable: new WritableStream({ write: (chunk) => void written.push(chunk) }) as unknown as WritableStream<VideoFrame> }),
      surface: () => ({ canvas: {} as CanvasImageSource, context: context as unknown as OffscreenCanvasRenderingContext2D, resize: () => undefined }),
      frameFrom: (_canvas, init) => ({ derived: true, timestamp: init.timestamp }) as unknown as VideoFrame,
    },
    canvas: null,
    ...(options.face === undefined ? {} : { face: options.face }),
  };
  const send = async (id: number): Promise<FakeFrame> => {
    const next = frame(id);
    incoming.push(next);
    push?.(next);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return next;
  };
  return { env, send, written, output, draws };
}

describe('les images traitables (MediaStreamTrackProcessor)', () => {
  test('neutre : chaque image passe TELLE QUELLE, sans copie', async () => {
    const h = framesHarness();
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, NO_EFFECTS, h.env);
    const sent = await h.send(1);
    expect(pipeline.output).toBe(h.output as unknown as MediaStreamTrack);
    expect(h.written).toEqual([sent]);
    expect(sent.closed).toBe(false);
    pipeline.stop();
  });

  test('un préréglage : l’image est redessinée filtrée, garde son horodatage, et l’originale est relâchée', async () => {
    const h = framesHarness();
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, warm, h.env);
    const sent = await h.send(2);
    expect(h.draws).toEqual([pipeline.filter()]);
    expect(h.draws[0]).not.toBe('none');
    expect(h.written).toEqual([{ derived: true, timestamp: 2000 }]);
    expect(sent.closed).toBe(true);
    pipeline.stop();
  });

  test('changer d’effet change l’image SUIVANTE, sans rebâtir la piste', async () => {
    const h = framesHarness();
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, warm, h.env);
    await h.send(1);
    pipeline.update({ ...NO_EFFECTS, brightness: 0.2 });
    await h.send(2);
    expect(h.draws[0]).toContain('sepia');
    expect(h.draws[1]).toBe('brightness(1.2)');
    expect(pipeline.output).toBe(h.output as unknown as MediaStreamTrack);
    pipeline.stop();
  });

  test('une image qu’on n’a pas su filtrer part quand même : aucune image perdue', async () => {
    const h = framesHarness({ failDraw: true });
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, warm, h.env);
    const sent = await h.send(3);
    expect(h.written).toEqual([sent]);
    expect(sent.closed).toBe(false);
    pipeline.stop();
  });

  test('arrêter coupe la piste envoyée et le flux des images', async () => {
    const h = framesHarness();
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, warm, h.env);
    pipeline.stop();
    await h.send(4);
    expect(h.output.readyState).toBe('ended');
    expect(h.written).toEqual([]);
  });
});

describe('les effets de visage (#8551)', () => {
  const faceLog = () => {
    const calls: Array<{ effect: string; t: number; width: number; height: number }> = [];
    const face: FaceLayer = (target, effects) => void calls.push({ effect: effects.faceEffect, t: target.t, width: target.width, height: target.height });
    return { calls, face };
  };

  test('en couleur naturelle, un effet de visage redessine chaque image et y pose son calque, à l’heure de l’image', async () => {
    const log = faceLog();
    const h = framesHarness({ face: log.face });
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, { ...NO_EFFECTS, faceEffect: 'toad' }, h.env);
    const sent = await h.send(5);
    expect(h.draws).toEqual(['none']);
    expect(log.calls).toEqual([{ effect: 'toad', t: 5, width: 640, height: 480 }]);
    expect(h.written).toEqual([{ derived: true, timestamp: 5000 }]);
    expect(sent.closed).toBe(true);
    pipeline.stop();
  });

  test('l’éruption étalonne toute l’image, par-dessus le préréglage', async () => {
    const h = framesHarness({ face: () => undefined });
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, { ...NO_EFFECTS, preset: 'vivid', faceEffect: 'volcano' }, h.env);
    await h.send(1);
    expect(h.draws[0]).toContain('saturate(1.3)');
    expect(h.draws[0]).toContain('sepia(0.35)');
    pipeline.stop();
  });

  test('revenir à « Aucun » rend les images telles quelles', async () => {
    const log = faceLog();
    const h = framesHarness({ face: log.face });
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, { ...NO_EFFECTS, faceEffect: 'angel' }, h.env);
    await h.send(1);
    pipeline.update(NO_EFFECTS);
    const second = await h.send(2);
    expect(log.calls).toHaveLength(1);
    expect(h.written.at(-1)).toBe(second);
    pipeline.stop();
  });
});

describe('le canevas filmé (captureStream), là où les images ne sont pas traitables', () => {
  function canvasHarness() {
    const ticks: Array<() => void> = [];
    const draws: string[] = [];
    const output = fakeTrack();
    const video = { paused: false, videoWidth: 640, videoHeight: 480, pause: () => void (video.paused = true) };
    const context = { filter: 'none', drawImage: () => void draws.push(context.filter) };
    const env: PipelineEnv = {
      frames: null,
      canvas: {
        video: () => video as unknown as HTMLVideoElement,
        surface: () => ({ context: context as unknown as CanvasRenderingContext2D, resize: () => undefined, capture: () => output as unknown as MediaStreamTrack }),
        nextFrame: (_video, draw) => void ticks.push(draw),
      },
    };
    const tick = () => ticks.shift()?.();
    return { env, draws, output, video, tick, ticks };
  }

  test('chaque image de la caméra est redessinée filtrée sur la piste filmée', () => {
    const h = canvasHarness();
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, warm, h.env);
    h.tick();
    pipeline.update({ ...NO_EFFECTS, preset: 'muted' });
    h.tick();
    expect(pipeline.output).toBe(h.output as unknown as MediaStreamTrack);
    expect(h.draws).toHaveLength(2);
    expect(h.draws[0]).toContain('sepia');
    expect(h.draws[1]).toContain('saturate(0.7)');
    pipeline.stop();
  });

  test('arrêter coupe la piste filmée, met la vidéo source en pause et cesse de dessiner', () => {
    const h = canvasHarness();
    const pipeline = createEffectsPipeline(fakeTrack() as unknown as MediaStreamTrack, warm, h.env);
    pipeline.stop();
    h.tick();
    expect(h.output.readyState).toBe('ended');
    expect(h.video.paused).toBe(true);
    expect(h.draws).toEqual([]);
    expect(h.ticks).toEqual([]);
  });
});
