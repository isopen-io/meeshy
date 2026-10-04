import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import type { SceneClockHandle } from './scene-clock';
import ScenePlayer from './scene-player';

/**
 * LA SCÈNE ATTEND LA VIDÉO QUI BUFFERISE (#9277) — miroir du gel en phase
 * d'iOS (`onPlaybackProgressing` → `setPlaybackStalled`). Sur un réseau lent
 * (ancien Android), l'horloge qui courait devant la vidéo la recalait par
 * `currentTime` à chaque image : chaque recalage relançait le buffer — mesuré
 * sous Chromium bridé ×6, 144 seeks en 3 s sur un réel composé figé.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const lecture = new WeakMap<HTMLMediaElement, 'lit' | 'pause'>();
const ready = new WeakMap<HTMLMediaElement, number>();
const seeks = new WeakMap<HTMLMediaElement, number>();
const positions = new WeakMap<HTMLMediaElement, number>();
let frames: Array<(now: number) => void> = [];
let originalRaf: typeof window.requestAnimationFrame;
let originalCancel: typeof window.cancelAnimationFrame;
const PATCHED = ['play', 'pause', 'paused', 'readyState', 'currentTime'] as const;
let originals: ReadonlyArray<readonly [string, PropertyDescriptor | undefined]> = [];

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const proto = window.HTMLMediaElement.prototype;
  originals = PATCHED.map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const);
  proto.play = function play(this: HTMLMediaElement) {
    lecture.set(this, 'lit');
    this.dispatchEvent(new window.Event('play'));
    return Promise.resolve();
  };
  proto.pause = function pause(this: HTMLMediaElement) {
    lecture.set(this, 'pause');
    this.dispatchEvent(new window.Event('pause'));
  };
  Object.defineProperty(proto, 'paused', { configurable: true, get(this: HTMLMediaElement) { return lecture.get(this) !== 'lit'; } });
  Object.defineProperty(proto, 'readyState', { configurable: true, get(this: HTMLMediaElement) { return ready.get(this) ?? 4; } });
  Object.defineProperty(proto, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) { return positions.get(this) ?? 0; },
    set(this: HTMLMediaElement, value: number) {
      positions.set(this, value);
      seeks.set(this, (seeks.get(this) ?? 0) + 1);
    },
  });
  originalRaf = window.requestAnimationFrame;
  originalCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  };
  window.cancelAnimationFrame = () => {
    frames = [];
  };
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
});

afterAll(async () => {
  await act(async () => {});
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancel;
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
  const proto = window.HTMLMediaElement.prototype;
  for (const [name, descriptor] of originals) {
    if (descriptor !== undefined) Object.defineProperty(proto, name, descriptor);
    else Reflect.deleteProperty(proto, name);
  }
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  frames = [];
});

/** Joue UNE image à l'instant `now` (ms). */
function frame(now: number): void {
  const pending = frames;
  frames = [];
  act(() => {
    for (const cb of pending) cb(now);
  });
}

function documentOf(objects: readonly unknown[]): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects }] });
  if (doc === null) throw new Error('vecteur invalide');
  return doc;
}

const object = (overrides: Record<string, unknown>) => ({
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  ...overrides,
});

const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'vid', src: 'fond.mp4' }, { id: 'clip2', src: 'pose.mp4' }] };

const SCENE = documentOf([
  object({ id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { postMediaId: 'vid', mediaType: 'video/mp4' } }),
  object({ id: 'fg', kind: 'media', payload: { postMediaId: 'clip2', mediaType: 'video/mp4' } }),
]);

function mountPlaying(onProgressing: (progressing: boolean) => void): { readonly el: HTMLDivElement; readonly clock: SceneClockHandle } {
  let handle: SceneClockHandle | null = null;
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  const node: ReactElement = (
    <ScenePlayer
      document={SCENE}
      sceneIndex={0}
      mode="reel"
      playing
      carrier={carrier}
      preferredLanguages={['fr']}
      fallbackDurationSeconds={10}
      onPlaybackProgressing={onProgressing}
      onClock={(clock) => (handle = clock)}
    />
  );
  act(() => {
    root.render(node);
  });
  if (handle === null) throw new Error('onClock jamais appelé');
  return { el: container, clock: handle };
}

const videos = (el: HTMLElement) => {
  const [fond, pose] = [...el.querySelectorAll('video')] as HTMLVideoElement[];
  if (fond === undefined || pose === undefined) throw new Error('deux vidéos attendues');
  for (const v of [fond, pose]) Object.defineProperty(v, 'duration', { value: 20, configurable: true });
  return { fond, pose };
};

const bufferise = (v: HTMLVideoElement) => {
  ready.set(v, 2);
  v.dispatchEvent(new window.Event('waiting'));
};
const reprend = (v: HTMLVideoElement) => {
  ready.set(v, 4);
  v.dispatchEvent(new window.Event('playing'));
};

describe('ScenePlayer — la scène attend un buffer (#9277)', () => {
  test("l'horloge ne compte pas le temps d'un buffer, et ne recale JAMAIS la vidéo qui attend", () => {
    const progress: boolean[] = [];
    const { el, clock } = mountPlaying((p) => progress.push(p));
    const { fond } = videos(el);
    frame(0);
    frame(500);
    frame(1000);
    expect(clock.now()).toBeCloseTo(1, 5);

    act(() => bufferise(fond));
    expect(progress.at(-1)).toBe(false);
    const avant = seeks.get(fond) ?? 0;
    frame(1100);
    frame(2000);
    frame(3000);
    expect(clock.now()).toBeCloseTo(1, 5);
    expect(seeks.get(fond) ?? 0).toBe(avant);
  });

  test('les AUTRES médias attendent avec elle, puis tout repart en phase, sans saut', () => {
    const progress: boolean[] = [];
    const { el, clock } = mountPlaying((p) => progress.push(p));
    const { fond, pose } = videos(el);
    frame(0);
    frame(1000);
    expect(pose.paused).toBe(false);

    act(() => bufferise(fond));
    expect(pose.paused).toBe(true);
    frame(5000);

    act(() => reprend(fond));
    expect(progress.at(-1)).toBe(true);
    expect(pose.paused).toBe(false);
    frame(6000);
    frame(6500);
    expect(clock.now()).toBeCloseTo(1.5, 5);
  });

  test('un buffer ne survit pas au démontage du média : la scène est relâchée', () => {
    const progress: boolean[] = [];
    const { el } = mountPlaying((p) => progress.push(p));
    const { fond } = videos(el);
    frame(0);
    act(() => bufferise(fond));
    expect(progress.at(-1)).toBe(false);
    act(() => root.render(<span />));
    expect(progress.at(-1)).toBe(true);
  });
});
