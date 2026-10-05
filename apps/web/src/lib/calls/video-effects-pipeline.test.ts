import { describe, expect, test } from 'bun:test';

import { lookFilter } from '@/lib/media/photo-develop';

import { NO_EFFECTS, frameSettings, type FrameSettings, type VideoEffects } from './video-effects';
import type { LocalFrameEnv } from './video-effects-browser';
import type { HostMessage, HostReply } from './video-effects-host';
import { createEffectsPipeline, type PipelineEnv, type WorkerPort } from './video-effects-pipeline';

/**
 * LE TRAITEMENT DES IMAGES ENVOYÉES, VU DU FIL PRINCIPAL (#8442, #9099) —
 * le chemin nominal remet la caméra à un WORKER et ne voit plus passer une
 * image ; le fil principal ne traite lui-même qu'en REPLI (pas de worker, un
 * worker qui refuse), et ce repli se libère entièrement à l'arrêt. Le worker,
 * les flux, le canevas et la vidéo sont des doublures.
 */

const settings = (effects: Partial<VideoEffects> = {}): FrameSettings => frameSettings({ ...NO_EFFECTS, ...effects }, { nativeBlur: false, zoom: 1 });

const warm = settings({ preset: 'warm' });

const fakeTrack = (name = 'track') => {
  const self = { name, kind: 'video', readyState: 'live', stop: () => void (self.readyState = 'ended'), clone: () => fakeTrack(`${name}-clone`), getSettings: () => ({ frameRate: 24 }) };
  return self;
};

type FakeFrame = { readonly id: number; readonly displayWidth: number; readonly displayHeight: number; readonly timestamp: number; closed: boolean; close: () => void };

const frame = (id: number): FakeFrame => {
  const self: FakeFrame = { id, displayWidth: 640, displayHeight: 480, timestamp: id * 1000, closed: false, close: () => void (self.closed = true) };
  return self;
};

function fakeWorker(answer: (message: HostMessage) => HostReply | null = () => ({ kind: 'ready', track: null }), options: { readonly refuseTransfer?: boolean } = {}) {
  const posted: Array<{ message: HostMessage; transfer: readonly unknown[] }> = [];
  let handler: ((reply: HostReply) => void) | null = null;
  const state = { terminated: false };
  const port: WorkerPort = {
    post: (message, transfer) => {
      if (options.refuseTransfer === true && transfer.length > 0) throw new Error('DataCloneError');
      posted.push({ message, transfer });
      const reply = answer(message);
      if (reply !== null) queueMicrotask(() => handler?.(reply));
    },
    listen: (next) => void (handler = next),
    terminate: () => void (state.terminated = true),
  };
  return { port, posted, state, reply: (reply: HostReply) => handler?.(reply) };
}

function localEnv() {
  const draws: string[] = [];
  const context = { filter: 'none', drawImage: () => void draws.push(context.filter) };
  const env: LocalFrameEnv = {
    surface: () => ({ canvas: {} as CanvasImageSource, context: context as unknown as OffscreenCanvasRenderingContext2D, resize: () => undefined }),
    now: () => 0,
    frameFrom: (_canvas, init) => ({ derived: true, timestamp: init.timestamp }) as unknown as VideoFrame,
  };
  return { env, draws };
}

function framesEnv() {
  const generated: Array<{ track: ReturnType<typeof fakeTrack>; written: unknown[] }> = [];
  const pushers: Array<(value: FakeFrame) => void> = [];
  const frames = {
    processor: () => ({ readable: new ReadableStream<FakeFrame>({ start: (controller) => void pushers.push((value) => controller.enqueue(value)) }) as unknown as ReadableStream<VideoFrame> }),
    generator: () => {
      const entry = { track: fakeTrack(`generated-${generated.length}`), written: [] as unknown[] };
      generated.push(entry);
      return { track: entry.track as unknown as MediaStreamTrack, writable: new WritableStream({ write: (chunk) => void entry.written.push(chunk) }) as unknown as WritableStream<VideoFrame> };
    },
  };
  const send = async (id: number): Promise<FakeFrame> => {
    const next = frame(id);
    pushers.at(-1)?.(next);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return next;
  };
  return { frames, generated, send };
}

function motionSource(initial: boolean) {
  const listeners: Array<(reduced: boolean) => void> = [];
  return { port: { read: () => initial, watch: (listener: (reduced: boolean) => void) => (listeners.push(listener), () => void listeners.splice(listeners.indexOf(listener), 1)) }, listeners, change: (reduced: boolean) => listeners.forEach((listener) => listener(reduced)) };
}

const camera = () => fakeTrack('camera') as unknown as MediaStreamTrack;

describe('le chemin nominal : les flux remis au worker (Chrome, la coque Android)', () => {
  test('le processeur et le générateur partent TRANSFÉRÉS ; la piste envoyée est celle du générateur', async () => {
    const worker = fakeWorker();
    const f = framesEnv();
    const local = localEnv();
    const env: PipelineEnv = { worker: () => worker.port, frames: f.frames, canvas: null, local: async () => local.env };
    const pipeline = await createEffectsPipeline(camera(), warm, env);
    const start = worker.posted[0];
    expect(start?.message.kind).toBe('start');
    expect(start?.transfer).toHaveLength(2);
    expect(start?.message).toMatchObject({ settings: warm });
    expect(pipeline.output).toBe(f.generated[0]?.track as unknown as MediaStreamTrack);
    await f.send(1);
    expect(local.draws).toEqual([]);
    pipeline.stop();
  });

  test('un réglage part au worker ; arrêter l’arrête, le termine et coupe la piste', async () => {
    const worker = fakeWorker();
    const f = framesEnv();
    const pipeline = await createEffectsPipeline(camera(), warm, { worker: () => worker.port, frames: f.frames, canvas: null, local: async () => localEnv().env });
    pipeline.update(settings({ preset: 'cool' }));
    pipeline.stop();
    expect(worker.posted.map((entry) => entry.message.kind)).toEqual(['start', 'update', 'stop']);
    expect(worker.state.terminated).toBe(true);
    expect(f.generated[0]?.track.readyState).toBe('ended');
  });

  test('le mouvement réduit part au départ, suit chaque changement, et n’est plus écouté à l’arrêt (#9100)', async () => {
    const worker = fakeWorker();
    const f = framesEnv();
    const motion = motionSource(true);
    const pipeline = await createEffectsPipeline(camera(), warm, { worker: () => worker.port, frames: f.frames, canvas: null, local: async () => localEnv().env, motion: motion.port });
    expect(worker.posted[0]?.message).toMatchObject({ reducedMotion: true });
    motion.change(false);
    expect(worker.posted.at(-1)?.message).toEqual({ kind: 'motion', reduced: false });
    pipeline.stop();
    expect(motion.listeners).toHaveLength(0);
  });

  test('le relevé de coût du worker est publié pour la mesure', async () => {
    const worker = fakeWorker();
    const marks: number[] = [];
    const pipeline = await createEffectsPipeline(camera(), warm, { worker: () => worker.port, frames: framesEnv().frames, canvas: null, local: async () => localEnv().env, mark: (timings) => void marks.push(timings.p95) });
    worker.reply({ kind: 'timings', timings: { frames: 30, p50: 1, p95: 2, max: 3 } });
    expect(marks).toEqual([2]);
    pipeline.stop();
  });

  test('un worker qui refuse : le fil principal traite lui-même, sur un générateur neuf', async () => {
    const worker = fakeWorker(() => ({ kind: 'failed' }));
    const f = framesEnv();
    const local = localEnv();
    const pipeline = await createEffectsPipeline(camera(), warm, { worker: () => worker.port, frames: f.frames, canvas: null, local: async () => local.env });
    expect(worker.state.terminated).toBe(true);
    expect(pipeline.output).toBe(f.generated[1]?.track as unknown as MediaStreamTrack);
    const sent = await f.send(2);
    expect(f.generated[1]?.written).toEqual([{ derived: true, timestamp: 2000 }]);
    expect(sent.closed).toBe(true);
    pipeline.stop();
  });

  test('un worker muet passé le délai : même repli', async () => {
    const worker = fakeWorker(() => null);
    const f = framesEnv();
    const pipeline = await createEffectsPipeline(camera(), warm, { worker: () => worker.port, frames: f.frames, canvas: null, local: async () => localEnv().env, readyTimeoutMs: 5 });
    expect(worker.state.terminated).toBe(true);
    expect(pipeline.output).toBe(f.generated[1]?.track as unknown as MediaStreamTrack);
    pipeline.stop();
  });

  test('des flux non transférables : même repli, sans worker', async () => {
    const worker = fakeWorker(undefined, { refuseTransfer: true });
    const f = framesEnv();
    const pipeline = await createEffectsPipeline(camera(), warm, { worker: () => worker.port, frames: f.frames, canvas: null, local: async () => localEnv().env });
    expect(worker.state.terminated).toBe(true);
    expect(pipeline.output).toBe(f.generated.at(-1)?.track as unknown as MediaStreamTrack);
    pipeline.stop();
  });
});

describe('la piste remise au worker (Safari : les images ne se lisent que dans un worker)', () => {
  test('une COPIE de la caméra part transférée ; la piste envoyée est celle que le worker renvoie', async () => {
    const built = fakeTrack('worker-track') as unknown as MediaStreamTrack;
    const worker = fakeWorker(() => ({ kind: 'ready', track: built }));
    const source = fakeTrack('camera');
    const pipeline = await createEffectsPipeline(source as unknown as MediaStreamTrack, warm, { worker: () => worker.port, frames: null, canvas: null, local: async () => localEnv().env });
    expect(worker.posted[0]?.transfer).toHaveLength(1);
    expect((worker.posted[0]?.transfer[0] as { name: string }).name).toBe('camera-clone');
    expect(source.readyState).toBe('live');
    expect(pipeline.output).toBe(built);
    pipeline.stop();
    expect((built as unknown as { readyState: string }).readyState).toBe('ended');
  });
});

describe('le repli : le canevas filmé, là où rien d’autre ne sait', () => {
  function canvasEnv() {
    const ticks: Array<() => void> = [];
    const draws: string[] = [];
    const output = fakeTrack('captured');
    const video = { paused: false, videoWidth: 640, videoHeight: 480, srcObject: {} as unknown, pause: () => void (video.paused = true) };
    const canvas = { width: 640, height: 480 };
    const context = { filter: 'none', drawImage: () => void draws.push(context.filter) };
    const env: PipelineEnv = {
      worker: null,
      frames: null,
      canvas: {
        video: () => video as unknown as HTMLVideoElement,
        surface: () => ({ canvas: canvas as unknown as CanvasImageSource, context: context as unknown as CanvasRenderingContext2D, resize: () => undefined, capture: () => output as unknown as MediaStreamTrack, release: () => void Object.assign(canvas, { width: 0, height: 0 }) }),
        nextFrame: (_video, draw) => void ticks.push(draw),
      },
      local: async () => localEnv().env,
    };
    return { env, draws, output, video, canvas, tick: () => ticks.shift()?.(), ticks };
  }

  test('chaque image de la caméra est redessinée sur la piste filmée', async () => {
    const h = canvasEnv();
    const pipeline = await createEffectsPipeline(camera(), warm, h.env);
    h.tick();
    pipeline.update(settings({ preset: 'muted' }));
    h.tick();
    expect(pipeline.output).toBe(h.output as unknown as MediaStreamTrack);
    expect(h.draws).toHaveLength(2);
    expect(h.draws[0]?.startsWith(lookFilter())).toBe(true);
    expect(h.draws[1]).toContain('saturate(0.7)');
    pipeline.stop();
  });

  test('arrêter LIBÈRE tout : piste coupée, vidéo vidée, canevas rendu, plus aucun dessin (#9099)', async () => {
    const h = canvasEnv();
    const pipeline = await createEffectsPipeline(camera(), warm, h.env);
    pipeline.stop();
    h.tick();
    expect(h.output.readyState).toBe('ended');
    expect(h.video.paused).toBe(true);
    expect(h.video.srcObject).toBeNull();
    expect(h.canvas.width).toBe(0);
    expect(h.draws).toEqual([]);
    expect(h.ticks).toEqual([]);
  });
});

describe('le repli : les images traitables sur le fil principal (pas de worker)', () => {
  test('naturel : chaque image passe telle quelle', async () => {
    const f = framesEnv();
    const pipeline = await createEffectsPipeline(camera(), settings(), { worker: null, frames: f.frames, canvas: null, local: async () => localEnv().env });
    const sent = await f.send(1);
    expect(f.generated[0]?.written).toEqual([sent]);
    pipeline.stop();
  });

  test('un réglage change l’image SUIVANTE', async () => {
    const f = framesEnv();
    const local = localEnv();
    const pipeline = await createEffectsPipeline(camera(), warm, { worker: null, frames: f.frames, canvas: null, local: async () => local.env });
    await f.send(1);
    pipeline.update(settings({ brightness: 0.2 }));
    await f.send(2);
    expect(local.draws[1]).toBe(`${lookFilter()} brightness(1.2)`);
    pipeline.stop();
  });
});
