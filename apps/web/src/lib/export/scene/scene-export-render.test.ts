import { describe, expect, test } from 'bun:test';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import type { PreparedSceneExport } from './scene-export-assets';
import { planSceneExport } from './scene-export-plan';
import { renderSceneExport, type RenderEnvironment } from './scene-export-render';

const object = (raw: Record<string, unknown>) => ({ anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 1, transform: {}, ...raw });

function documentOf(scenes: readonly (readonly Record<string, unknown>[])[]): CanvasDocument {
  const parsed = parseCanvasDocument({ v: 3, scenes: scenes.map((objects, index) => ({ id: `s${index}`, objects: objects.map(object) })) });
  if (parsed === null) throw new Error('document de témoin invalide');
  return parsed;
}

const carrier: SceneCarrier = { postId: 'p', media: [] };

/** Un contexte 2D qui accepte tout : le rendu est témoigné par `scene-export-paint`. */
function permissiveContext(): CanvasRenderingContext2D {
  const state = new Map<PropertyKey, unknown>([['globalAlpha', 1]]);
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, key) => {
      if (state.has(key)) return state.get(key);
      if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      return () => undefined;
    },
    set: (_target, key, value) => {
      state.set(key, value);
      return true;
    },
  });
}

type FakeTrack = { readonly kind: string; stopped: boolean; stop: () => void };
const trackOf = (kind: string): FakeTrack => {
  const track: FakeTrack = { kind, stopped: false, stop: () => (track.stopped = true) };
  return track;
};

function fakeDocument(captured: { tracks: FakeTrack[] }): Document {
  const createElement = () => ({
    width: 0,
    height: 0,
    getContext: () => permissiveContext(),
    toBlob: (callback: (blob: Blob | null) => void, type: string) => callback(new Blob(['png'], { type })),
    captureStream: () => {
      const tracks: FakeTrack[] = [trackOf('video')];
      captured.tracks = tracks;
      return { getTracks: () => tracks, addTrack: (track: FakeTrack) => tracks.push(track) };
    },
  });
  return { createElement } as unknown as Document;
}

class FakeRecorder {
  static isTypeSupported = (type: string) => type.startsWith('video/mp4');
  static last: FakeRecorder | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly stream: unknown,
    readonly options: MediaRecorderOptions,
  ) {
    FakeRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['frames']) });
    this.onstop?.();
  }
}

type Started = { readonly when: number; readonly offset: number; readonly duration: number };

/** Un contexte audio dont l'horloge avance d'une seconde par image demandée. */
function fakeAudio() {
  const started: Started[] = [];
  const clock = { time: 10 };
  const node = () => ({ connect: () => undefined, disconnect: () => undefined });
  const context = {
    state: 'running',
    get currentTime() {
      return clock.time;
    },
    resume: async () => undefined,
    createMediaStreamDestination: () => ({ ...node(), stream: { getAudioTracks: () => [trackOf('audio')] } }),
    createGain: () => ({ ...node(), gain: { setValueAtTime: () => undefined } }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      start: (when: number, offset: number, duration: number) => started.push({ when, offset, duration }),
      stop: () => undefined,
    }),
  };
  return { context: context as unknown as AudioContext, clock, started };
}

function environment(params: { readonly audio?: ReturnType<typeof fakeAudio>; readonly recorder?: typeof MediaRecorder | undefined; readonly onFrame?: () => void }) {
  const captured = { tracks: [] as FakeTrack[] };
  const wall = { ms: 0 };
  const env: RenderEnvironment = {
    doc: fakeDocument(captured),
    MediaRecorder: 'recorder' in params ? params.recorder : (FakeRecorder as unknown as typeof MediaRecorder),
    audioContext: params.audio?.context ?? null,
    requestFrame: (callback) => {
      wall.ms += 1000;
      if (params.audio !== undefined) params.audio.clock.time += 1;
      params.onFrame?.();
      queueMicrotask(callback);
    },
    now: () => wall.ms,
    palette: { card: '#000', scrim: '#000', onMedia: '#fff', placeFill: '#fff', placeInk: '#000', pin: '#f00', mediaBackdrop: '#000', fontFamily: 'Inter' },
    labels: { placeHere: 'Ici' },
  };
  return { env, captured };
}

function prepared(document: CanvasDocument, durations: ReadonlyMap<string, number>, buffers: ReadonlyMap<string, AudioBuffer> = new Map()): PreparedSceneExport {
  return {
    plan: planSceneExport({ document, carrier, durations }),
    assets: { image: () => null, video: () => null },
    videos: new Map(),
    buffers,
    missing: [],
    dispose: () => undefined,
  };
}

const voiceStory = documentOf([[{ id: 'voice', kind: 'audio', payload: { mediaURL: 'https://cdn/voice.m4a' } }]]);
const fourMinutes = new Map([['https://cdn/voice.m4a', 240_000]]);

const run = (params: { readonly prepared: PreparedSceneExport; readonly document: CanvasDocument; readonly lengthMs: number; readonly env: RenderEnvironment; readonly signal?: AbortSignal }) => {
  const progress: number[] = [];
  const outcome = renderSceneExport({
    prepared: params.prepared,
    document: params.document,
    carrier,
    preferredLanguages: ['fr'],
    watermark: '@ana',
    lengthMs: params.lengthMs,
    env: params.env,
    signal: params.signal ?? new AbortController().signal,
    onProgress: (fraction) => progress.push(fraction),
  });
  return { outcome, progress };
};

describe('rendre l’export — la composition filmée de bout en bout', () => {
  test('une story de 4 min se filme jusqu’à 4 min, en MP4, et la progression atteint 1', async () => {
    const plan = prepared(voiceStory, fourMinutes);
    expect(plan.plan.totalMs).toBe(240_000);
    const { env } = environment({});
    const { outcome, progress } = run({ prepared: plan, document: voiceStory, lengthMs: plan.plan.totalMs, env });
    expect(await outcome).toMatchObject({ kind: 'video', mimeType: 'video/mp4' });
    expect(progress.at(-1)).toBe(1);
    expect(progress.filter((fraction) => fraction < 1).length).toBeGreaterThanOrEqual(239);
  });

  test('« Imager » 2/4 d’une story de 4 min s’arrête à 2 min', async () => {
    const plan = prepared(voiceStory, fourMinutes);
    const { env } = environment({});
    const { outcome, progress } = run({ prepared: plan, document: voiceStory, lengthMs: 120_000, env });
    expect((await outcome).kind).toBe('video');
    expect(progress.length).toBeLessThanOrEqual(125);
    expect(progress.at(-1)).toBe(1);
  });

  test('la piste son mixée entre dans le flux filmé, et chaque son part à son heure', async () => {
    const audio = fakeAudio();
    const buffers = new Map([['https://cdn/voice.m4a', { duration: 240 } as AudioBuffer]]);
    const plan = prepared(voiceStory, fourMinutes, buffers);
    const { env, captured } = environment({ audio });
    const { outcome } = run({ prepared: plan, document: voiceStory, lengthMs: 30_000, env });
    expect((await outcome).kind).toBe('video');
    expect(captured.tracks.map((track) => track.kind)).toEqual(['video', 'audio']);
    expect(captured.tracks.every((track) => track.stopped)).toBe(true);
    expect(audio.started).toHaveLength(1);
    expect(audio.started[0]?.duration).toBe(30);
  });

  test('annulé en cours de route, rien ne sort', async () => {
    const controller = new AbortController();
    let frames = 0;
    const { env } = environment({ onFrame: () => (frames += 1) === 5 && controller.abort() });
    const plan = prepared(voiceStory, fourMinutes);
    const { outcome } = run({ prepared: plan, document: voiceStory, lengthMs: 240_000, env, signal: controller.signal });
    expect(await outcome).toEqual({ kind: 'cancelled' });
    expect(frames).toBeLessThan(10);
  });

  test('une scène purement statique et muette sort en image', async () => {
    const still = documentOf([[{ id: 't', kind: 'text', payload: { text: 'Bonjour' } }]]);
    const { env } = environment({});
    const outcome = await run({ prepared: prepared(still, new Map()), document: still, lengthMs: 6000, env }).outcome;
    expect(outcome.kind).toBe('image');
    expect(outcome.kind === 'image' ? outcome.blob.type : '').toBe('image/png');
  });

  test('sans enregistreur vidéo, l’export dit qu’il ne peut pas', async () => {
    const { env } = environment({ recorder: undefined });
    expect(await run({ prepared: prepared(voiceStory, fourMinutes), document: voiceStory, lengthMs: 1000, env }).outcome).toEqual({ kind: 'unsupported' });
  });
});
