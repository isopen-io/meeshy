import { describe, expect, test } from 'bun:test';

import { startFrameClock, type FrameClockEnv, type FrameVideo } from './frame-clock';

/**
 * LA PENDULE DES COMPOSITEURS D'APPEL (#11313) — un enregistrement peint au
 * rythme des images présentées (rVFC), à défaut à celui de l'écran (rAF), et
 * jamais en gel : onglet masqué, rAF et rVFC se suspendent, la minuterie
 * prend le relais.
 */

type Pending = { readonly kind: 'frame' | 'timer'; readonly ms: number; readonly run: () => void };

const fakeClock = (options: { readonly hidden?: boolean } = {}) => {
  const state = {
    hidden: options.hidden ?? false,
    listeners: new Set<() => void>(),
    pending: new Map<number, Pending>(),
    next: 1,
  };
  const schedule = (kind: Pending['kind'], ms: number, run: () => void): (() => void) => {
    const id = state.next;
    state.next += 1;
    state.pending.set(id, { kind, ms, run });
    return () => void state.pending.delete(id);
  };
  const env: FrameClockEnv = {
    hidden: () => state.hidden,
    onVisibility: (listener) => {
      state.listeners.add(listener);
      return () => void state.listeners.delete(listener);
    },
    frame: (run) => schedule('frame', 0, run),
    timer: (run, ms) => schedule('timer', ms, run),
  };
  return {
    env,
    kinds: (): readonly Pending['kind'][] => [...state.pending.values()].map((entry) => entry.kind),
    timerDelays: (): readonly number[] => [...state.pending.values()].filter((entry) => entry.kind === 'timer').map((entry) => entry.ms),
    fireAll: (): void => {
      const runs = [...state.pending.values()];
      state.pending.clear();
      runs.forEach((entry) => entry.run());
    },
    hide: (): void => {
      state.hidden = true;
      [...state.listeners].forEach((listener) => listener());
    },
    listenerCount: (): number => state.listeners.size,
  };
};

const rvfcVideo = (options: { readonly paused?: boolean } = {}) => {
  const callbacks: Array<() => void> = [];
  const video: FrameVideo = {
    paused: options.paused ?? false,
    requestVideoFrameCallback: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancelVideoFrameCallback: () => undefined,
  };
  const presentFrame = (): void => {
    const due = callbacks.splice(0, callbacks.length);
    due.forEach((callback) => callback());
  };
  return { video, callbacks, presentFrame };
};

describe('startFrameClock', () => {
  test('startFrameClock_videoFrameCallbackAvailable_ticksOnEachPresentedFrame', () => {
    const clock = fakeClock();
    const { video, callbacks, presentFrame } = rvfcVideo();
    const ticks = { count: 0 };
    const stop = startFrameClock({ fps: 30, tick: () => void (ticks.count += 1), driver: () => video, env: clock.env });

    expect(ticks.count).toBe(0);
    expect(callbacks.length).toBe(1);
    presentFrame();
    expect(ticks.count).toBe(1);
    expect(callbacks.length).toBe(1);
    expect(clock.kinds()).toEqual([]);
    stop.stop();
  });

  test('startFrameClock_noVideoFrameCallback_fallsBackToAnimationFrame', () => {
    const clock = fakeClock();
    const ticks = { count: 0 };
    const stop = startFrameClock({ fps: 15, tick: () => void (ticks.count += 1), driver: () => null, env: clock.env });

    expect(clock.kinds()).toEqual(['frame']);
    clock.fireAll();
    expect(ticks.count).toBe(1);
    expect(clock.kinds()).toEqual(['frame']);
    stop.stop();
  });

  test('startFrameClock_pausedDriverVideo_doesNotWaitForFramesThatWillNeverCome', () => {
    const clock = fakeClock();
    const { video, callbacks } = rvfcVideo({ paused: true });
    const stop = startFrameClock({ fps: 30, tick: () => undefined, driver: () => video, env: clock.env });

    expect(callbacks.length).toBe(0);
    expect(clock.kinds()).toEqual(['frame']);
    stop.stop();
  });

  test('startFrameClock_documentHidden_usesTimerAtFrameRate', () => {
    const clock = fakeClock({ hidden: true });
    const { video, callbacks } = rvfcVideo();
    const stop = startFrameClock({ fps: 30, tick: () => undefined, driver: () => video, env: clock.env });

    expect(callbacks.length).toBe(0);
    expect(clock.kinds()).toEqual(['timer']);
    expect(clock.timerDelays()[0]).toBeCloseTo(1000 / 30, 5);
    stop.stop();
  });

  test('startFrameClock_hiddenWhileWaitingForAFrame_rearmsOnTimerInsteadOfFreezing', () => {
    const clock = fakeClock();
    const ticks = { count: 0 };
    const stop = startFrameClock({ fps: 10, tick: () => void (ticks.count += 1), driver: () => null, env: clock.env });

    expect(clock.kinds()).toEqual(['frame']);
    clock.hide();
    expect(clock.kinds()).toEqual(['timer']);
    expect(clock.timerDelays()[0]).toBeCloseTo(100, 5);
    clock.fireAll();
    expect(ticks.count).toBe(1);
    stop.stop();
  });

  test('startFrameClock_stop_cancelsPendingWorkAndDetachesVisibility', () => {
    const clock = fakeClock();
    const ticks = { count: 0 };
    const stop = startFrameClock({ fps: 30, tick: () => void (ticks.count += 1), driver: () => null, env: clock.env });

    expect(clock.listenerCount()).toBe(1);
    stop.stop();
    expect(clock.kinds()).toEqual([]);
    expect(clock.listenerCount()).toBe(0);
    clock.fireAll();
    expect(ticks.count).toBe(0);
  });
});
