import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import type { SceneClockHandle } from './scene-clock';
import ScenePlayer from './scene-player';

/**
 * LE PARCOURS AU DOIGT, CÔTÉ MOTEUR (#7879) — l'hôte reçoit la poignée de
 * l'horloge (`onClock`) ; un `seek` redessine les objets temporisés EN PAUSE
 * et recale chaque `<video>` de la scène (fond, média posé) au temps pointé.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    lecture.set(this, 'lit');
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    lecture.set(this, 'pause');
  };
});

/** L'état DEMANDÉ à chaque élément — happy-dom ne fait pas évoluer `paused`. */
const lecture = new WeakMap<HTMLMediaElement, 'lit' | 'pause'>();

afterAll(async () => {
  await act(async () => {});
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
});

function mount(node: ReactElement): HTMLDivElement {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

function documentOf(objects: readonly unknown[], sceneOverrides: Record<string, unknown> = {}): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects, ...sceneOverrides }] });
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

const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'vid', src: 'clip.mp4' }, { id: 'clip2', src: 'clip2.mp4' }] };

const withDuration = (el: HTMLMediaElement, seconds: number) => {
  Object.defineProperty(el, 'duration', { value: seconds, configurable: true });
};

function mountPlayer(document: CanvasDocument): { readonly el: HTMLDivElement; readonly clock: SceneClockHandle } {
  let handle: SceneClockHandle | null = null;
  const el = mount(
    <ScenePlayer
      document={document}
      sceneIndex={0}
      mode="reel"
      playing={false}
      carrier={carrier}
      preferredLanguages={['fr']}
      fallbackDurationSeconds={10}
      onClock={(clock) => (handle = clock)}
    />,
  );
  if (handle === null) throw new Error('onClock jamais appelé');
  return { el, clock: handle };
}

describe('ScenePlayer — onClock et seek (#7879)', () => {
  test('en PAUSE, un objet hors fenêtre APPARAÎT quand on pointe dans sa fenêtre — et disparaît en revenant', () => {
    const { el, clock } = mountPlayer(
      documentOf([object({ id: 'txt', kind: 'text', payload: { text: 'x' }, timing: { start: 3 } })], { timelineDuration: 10 }),
    );
    const frame = () => el.querySelector('[data-scene-object="text"]') as HTMLElement;
    expect(frame().hidden).toBe(true);
    act(() => clock.seek(4));
    expect(frame().hidden).toBe(false);
    act(() => clock.seek(1));
    expect(frame().hidden).toBe(true);
  });

  test('la vidéo de FOND se cale au temps pointé, repliée sur sa durée (elle boucle)', () => {
    const { el, clock } = mountPlayer(documentOf([object({ id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { postMediaId: 'vid', mediaType: 'video/mp4' } })]));
    const video = el.querySelector('video') as HTMLVideoElement;
    withDuration(video, 4);
    act(() => clock.seek(2.5));
    expect(video.currentTime).toBeCloseTo(2.5, 5);
    act(() => clock.seek(6));
    expect(video.currentTime).toBeCloseTo(2, 5);
  });

  test('un média POSÉ qui ne boucle pas s’arrête sur sa dernière image', () => {
    const { el, clock } = mountPlayer(
      documentOf([object({ id: 'm1', kind: 'media', payload: { postMediaId: 'clip2', mediaType: 'video/mp4', aspectRatio: 1 } })], { timelineDuration: 10 }),
    );
    const video = el.querySelector('[data-scene-object="media"] video') as HTMLVideoElement;
    withDuration(video, 3);
    act(() => clock.seek(5));
    expect(video.currentTime).toBeCloseTo(3, 5);
  });
});

/** Une file `requestAnimationFrame` rejouée à la main — l'horloge de scène
 * replanifie elle-même son tick suivant. */
function withFrames<T>(run: (frame: (ms: number) => void) => T): T {
  const queue: Array<(now: number) => void> = [];
  const originalRaf = window.requestAnimationFrame;
  const originalCaf = window.cancelAnimationFrame;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    queue.push(cb as (now: number) => void);
    return queue.length;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
  try {
    return run((ms) => {
      const cb = queue.shift();
      if (cb !== undefined) act(() => cb(ms));
    });
  } finally {
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCaf;
  }
}

type PlayerProps = Parameters<typeof ScenePlayer>[0];

function mountPlaying(
  document: CanvasDocument,
  playing: boolean,
): { readonly el: HTMLDivElement; readonly clock: SceneClockHandle; readonly setPlaying: (next: boolean) => void } {
  let handle: SceneClockHandle | null = null;
  const props = (p: boolean): PlayerProps => ({
    document,
    sceneIndex: 0,
    mode: 'reel',
    playing: p,
    carrier,
    preferredLanguages: ['fr'],
    fallbackDurationSeconds: 10,
    onClock: (clock) => (handle = clock),
  });
  const el = mount(<ScenePlayer {...props(playing)} />);
  if (handle === null) throw new Error('onClock jamais appelé');
  return {
    el,
    clock: handle,
    setPlaying: (next) =>
      act(() => {
        root.render(<ScenePlayer {...props(next)} />);
      }),
  };
}

const posedVideo = (params: { readonly timing?: Record<string, unknown>; readonly payload?: Record<string, unknown> }) =>
  documentOf(
    [
      object({
        id: 'm1',
        kind: 'media',
        payload: { postMediaId: 'clip2', mediaType: 'video/mp4', aspectRatio: 1, ...params.payload },
        ...(params.timing !== undefined ? { timing: params.timing } : {}),
      }),
    ],
    { timelineDuration: 10 },
  );

describe('ScenePlayer — les médias SUIVENT la timeline de la scène (#7879, retour porteur)', () => {
  test('un média qui entre à 3 s attend en pause, puis lit depuis 0 s LOCAL quand la scène y arrive', () => {
    withFrames((frame) => {
      const { el } = mountPlaying(posedVideo({ timing: { start: 3 } }), true);
      const video = el.querySelector('[data-scene-object="media"] video') as HTMLVideoElement;
      withDuration(video, 20);
      frame(0);
      frame(1000);
      expect(lecture.get(video)).toBe('pause');
      frame(3200);
      expect(lecture.get(video)).toBe('lit');
      expect(video.currentTime).toBeLessThan(0.5);
    });
  });

  test('la COUPE décale l’origine : pointer t=4 sur un média qui entre à 3 s coupé à 5 s ⇒ 6 s dans le fichier', () => {
    const { el, clock } = mountPlaying(posedVideo({ timing: { start: 3 }, payload: { sourceStart: 5, sourceEnd: 9 } }), false);
    const video = el.querySelector('[data-scene-object="media"] video') as HTMLVideoElement;
    withDuration(video, 20);
    act(() => clock.seek(4));
    expect(video.currentTime).toBeCloseTo(6, 5);
  });

  test('en lecture, une vidéo qui DÉRIVE de la timeline est recalée', () => {
    withFrames((frame) => {
      const { el } = mountPlaying(posedVideo({}), true);
      const video = el.querySelector('[data-scene-object="media"] video') as HTMLVideoElement;
      withDuration(video, 20);
      frame(0);
      video.currentTime = 7;
      frame(2000);
      expect(video.currentTime).toBeCloseTo(2, 1);
    });
  });

  test('relâcher après un glissé : TOUT repart ensemble depuis le temps pointé', () => {
    withFrames(() => {
      const { el, clock, setPlaying } = mountPlaying(
        documentOf([object({ id: 'bg', kind: 'media', plane: 'bg', z: 0, payload: { postMediaId: 'vid', mediaType: 'video/mp4' } })]),
        true,
      );
      const video = el.querySelector('video') as HTMLVideoElement;
      withDuration(video, 4);
      setPlaying(false);
      expect(lecture.get(video)).toBe('pause');
      act(() => clock.seek(6));
      video.currentTime = 3.5;
      setPlaying(true);
      expect(lecture.get(video)).toBe('lit');
      expect(video.currentTime).toBeCloseTo(2, 5);
    });
  });
});
