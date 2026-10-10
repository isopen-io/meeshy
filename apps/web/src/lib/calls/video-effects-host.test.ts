import { describe, expect, test } from 'bun:test';

import { NO_EFFECTS, frameSettings, type FrameSettings } from './video-effects';
import { createEffectsHost, type HostEnv, type HostReply } from './video-effects-host';

/**
 * LE WORKER DES EFFETS (#9099) — ce que le worker fait des messages du fil
 * principal : il reçoit les flux (Chrome) ou la piste (Safari), traite chaque
 * image hors du fil principal, se règle, s'arrête, et dit ce qu'il coûte.
 */

const settings = (preset: 'natural' | 'warm' = 'warm'): FrameSettings => frameSettings({ ...NO_EFFECTS, preset }, { nativeBlur: false, zoom: 1 });

type FakeFrame = { readonly id: number; readonly displayWidth: number; readonly displayHeight: number; readonly timestamp: number; closed: boolean; close: () => void };

const frame = (id: number): FakeFrame => {
  const self: FakeFrame = { id, displayWidth: 640, displayHeight: 480, timestamp: id * 1000, closed: false, close: () => void (self.closed = true) };
  return self;
};

const fakeTrack = (name: string) => {
  const self = { name, readyState: 'live', stop: () => void (self.readyState = 'ended') };
  return self;
};

function streams() {
  let push: ((value: FakeFrame) => void) | null = null;
  const readable = new ReadableStream<FakeFrame>({ start: (controller) => void (push = (value) => controller.enqueue(value)) });
  const written: unknown[] = [];
  const writable = new WritableStream({ write: (chunk) => void written.push(chunk) });
  const send = async (id: number): Promise<FakeFrame> => {
    const next = frame(id);
    push?.(next);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return next;
  };
  return { readable: readable as unknown as ReadableStream<VideoFrame>, writable: writable as unknown as WritableStream<VideoFrame>, written, send };
}

function harness(options: { readonly workerFrames?: boolean } = {}) {
  const replies: Array<{ reply: HostReply; transfer: readonly unknown[] }> = [];
  const draws: string[] = [];
  const context = { filter: 'none', drawImage: () => void draws.push(context.filter) };
  const generated = fakeTrack('generated');
  const inner = streams();
  const env: HostEnv = {
    surface: () => ({ canvas: {} as CanvasImageSource, context: context as unknown as OffscreenCanvasRenderingContext2D, resize: () => undefined }),
    now: () => 0,
    frameFrom: (_canvas, init) => ({ derived: true, timestamp: init.timestamp }) as unknown as VideoFrame,
    ...(options.workerFrames === true
      ? {
          processor: () => ({ readable: inner.readable }),
          generator: () => ({ track: generated as unknown as MediaStreamTrack, writable: inner.writable }),
        }
      : {}),
  };
  const host = createEffectsHost({ env, post: (reply, transfer) => void replies.push({ reply, transfer }) });
  return { host, replies, draws, generated, inner };
}

describe('les flux transférés (Chrome, la coque Android)', () => {
  test('chaque image est traitée dans le worker et sort horodatée ; le fil principal ne voit rien passer', async () => {
    const h = harness();
    const s = streams();
    h.host.receive({ kind: 'start', settings: settings(), readable: s.readable, writable: s.writable });
    expect(h.replies.map((entry) => entry.reply)).toEqual([{ kind: 'ready', track: null }]);
    const sent = await s.send(1);
    expect(s.written).toEqual([{ derived: true, timestamp: 1000 }]);
    expect(sent.closed).toBe(true);
    expect(h.draws).toHaveLength(1);
  });

  test('un réglage change l’image SUIVANTE', async () => {
    const h = harness();
    const s = streams();
    h.host.receive({ kind: 'start', settings: settings(), readable: s.readable, writable: s.writable });
    h.host.receive({ kind: 'update', settings: settings('natural') });
    const sent = await s.send(2);
    expect(s.written).toEqual([sent]);
  });

  test('arrêter coupe le flux : plus aucune image n’est écrite', async () => {
    const h = harness();
    const s = streams();
    h.host.receive({ kind: 'start', settings: settings(), readable: s.readable, writable: s.writable });
    h.host.receive({ kind: 'stop' });
    await s.send(3);
    expect(s.written).toEqual([]);
  });
});

describe('la piste transférée (Safari : les images se lisent dans le worker)', () => {
  test('le worker bâtit sa piste et la RENVOIE, transférée', async () => {
    const h = harness({ workerFrames: true });
    const camera = fakeTrack('camera');
    h.host.receive({ kind: 'start', settings: settings(), track: camera as unknown as MediaStreamTrack });
    expect(h.replies).toEqual([{ reply: { kind: 'ready', track: h.generated as unknown as MediaStreamTrack }, transfer: [h.generated] }]);
    await h.inner.send(4);
    expect(h.inner.written).toEqual([{ derived: true, timestamp: 4000 }]);
  });

  test('arrêter coupe la piste bâtie ET la caméra reçue', () => {
    const h = harness({ workerFrames: true });
    const camera = fakeTrack('camera');
    h.host.receive({ kind: 'start', settings: settings(), track: camera as unknown as MediaStreamTrack });
    h.host.receive({ kind: 'stop' });
    expect(h.generated.readyState).toBe('ended');
    expect(camera.readyState).toBe('ended');
  });

  test('un worker qui ne lit pas les images le dit : le fil principal prend le repli', () => {
    const h = harness();
    const camera = fakeTrack('camera');
    h.host.receive({ kind: 'start', settings: settings(), track: camera as unknown as MediaStreamTrack });
    expect(h.replies.map((entry) => entry.reply)).toEqual([{ kind: 'failed' }]);
    expect(camera.readyState).toBe('ended');
  });
});

describe('le mouvement réduit (#9100 : pas de `matchMedia` dans un worker)', () => {
  test('la préférence lue sur le fil principal arrive avec le départ, puis à chaque changement', () => {
    const relayed: boolean[] = [];
    const s = streams();
    const host = createEffectsHost({
      env: {
        surface: () => ({ canvas: {} as CanvasImageSource, context: { filter: 'none', drawImage: () => undefined } as unknown as OffscreenCanvasRenderingContext2D, resize: () => undefined }),
        now: () => 0,
        frameFrom: (_canvas, init) => ({ timestamp: init.timestamp }) as unknown as VideoFrame,
        motion: (reduced) => void relayed.push(reduced),
      },
      post: () => undefined,
    });
    host.receive({ kind: 'start', settings: settings(), readable: s.readable, writable: s.writable, reducedMotion: true });
    host.receive({ kind: 'motion', reduced: false });
    expect(relayed).toEqual([true, false]);
  });
});
