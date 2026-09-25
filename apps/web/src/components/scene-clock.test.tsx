import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useSceneClock, type SceneClockHandle, type SceneClockParams } from './scene-clock';

/**
 * LE PARCOURS AU DOIGT (#7879) — `seek` pose le temps de la scène et
 * redessine SUR-LE-CHAMP ses abonnés, lecture en pause comprise : c'est ce
 * qui fait « l'actualisation des frames en temps réel » pendant le glissé,
 * sans aucun rendu React.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;
let frames: Array<(now: number) => void> = [];
let originalRaf: typeof window.requestAnimationFrame;
let originalCaf: typeof window.cancelAnimationFrame;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  originalRaf = window.requestAnimationFrame;
  originalCaf = window.cancelAnimationFrame;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frames.push(cb as (now: number) => void);
    return frames.length;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
});

afterAll(async () => {
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCaf;
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  frames = [];
});

const paramsOf = (overrides: Partial<SceneClockParams> = {}): SceneClockParams => ({
  enabled: true,
  playing: false,
  loops: false,
  durationSeconds: 4,
  onTime: undefined,
  onEnded: undefined,
  onLoop: undefined,
  ...overrides,
});

function Harness({ params, expose }: { readonly params: SceneClockParams; readonly expose: (clock: SceneClockHandle) => void }) {
  expose(useSceneClock(params));
  return null;
}

function mountClock(params: SceneClockParams): { readonly clock: () => SceneClockHandle; readonly rerender: (next: SceneClockParams) => void } {
  let handle: SceneClockHandle | null = null;
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  const render = (p: SceneClockParams) =>
    act(() => {
      root.render(<Harness params={p} expose={(c) => (handle = c)} />);
    });
  render(params);
  return {
    clock: () => {
      if (handle === null) throw new Error('horloge absente');
      return handle;
    },
    rerender: render,
  };
}

const flush = (now: number) => {
  const next = frames.shift();
  if (next !== undefined) act(() => next(now));
};

describe('useSceneClock — seek (#7879)', () => {
  test('en PAUSE, seek redessine les abonnés au temps pointé, sans attendre une trame', () => {
    const { clock } = mountClock(paramsOf());
    const seen: number[] = [];
    clock().subscribe((t) => seen.push(t));
    clock().seek(2.5);
    expect(seen.at(-1)).toBe(2.5);
    expect(clock().now()).toBe(2.5);
    expect(frames).toHaveLength(0);
  });

  test('le temps pointé est BORNÉ à [0, durée]', () => {
    const { clock } = mountClock(paramsOf());
    clock().seek(-3);
    expect(clock().now()).toBe(0);
    clock().seek(99);
    expect(clock().now()).toBe(4);
  });

  test('onTime reçoit le temps pointé IMMÉDIATEMENT — la barre de l’hôte suit le doigt', () => {
    const times: number[] = [];
    const { clock } = mountClock(paramsOf({ onTime: (t) => times.push(t) }));
    clock().seek(1.25);
    expect(times.at(-1)).toBe(1.25);
  });

  test('subscribeSeek n’entend QUE les seeks — les médias s’y calent, jamais à chaque trame', () => {
    const { clock } = mountClock(paramsOf({ playing: true }));
    const seeks: number[] = [];
    clock().subscribeSeek((t) => seeks.push(t));
    flush(0);
    flush(500);
    expect(seeks).toEqual([]);
    clock().seek(3);
    expect(seeks).toEqual([3]);
  });

  test('la lecture REPREND depuis le temps pointé', () => {
    const { clock, rerender } = mountClock(paramsOf());
    clock().seek(2);
    rerender(paramsOf({ playing: true }));
    flush(1000);
    flush(1500);
    expect(clock().now()).toBeCloseTo(2.5, 5);
  });

  test('une scène TERMINÉE qu’on ramène en arrière repart, et pourra se terminer de nouveau', () => {
    let ended = 0;
    const { clock } = mountClock(paramsOf({ playing: true, onEnded: () => (ended += 1) }));
    flush(0);
    flush(5000);
    expect(ended).toBe(1);
    expect(frames).toHaveLength(0);
    clock().seek(1);
    expect(frames.length).toBeGreaterThan(0);
    flush(6000);
    flush(10000);
    expect(ended).toBe(2);
  });

  test('un seek pendant la lecture repart du temps pointé, sans compter le temps écoulé avant', () => {
    const { clock } = mountClock(paramsOf({ playing: true }));
    flush(0);
    flush(1000);
    clock().seek(0.5);
    flush(3000);
    expect(clock().now()).toBeCloseTo(0.5, 5);
    flush(3500);
    expect(clock().now()).toBeCloseTo(1, 5);
  });

  test('isDriving dit si l’horloge MÈNE la scène — les médias ne la suivent que dans ce cas', () => {
    const { clock, rerender } = mountClock(paramsOf({ enabled: false }));
    expect(clock().isDriving()).toBe(false);
    rerender(paramsOf({ enabled: true }));
    expect(clock().isDriving()).toBe(true);
  });

  test('sans durée connue, seek pose le temps sans plafond', () => {
    const { clock } = mountClock(paramsOf({ durationSeconds: null }));
    clock().seek(12);
    expect(clock().now()).toBe(12);
  });
});
