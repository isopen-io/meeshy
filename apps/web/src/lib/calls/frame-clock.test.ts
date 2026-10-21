import { describe, expect, test } from 'bun:test';

import { startFrameClock, type FrameClockEnv, type FrameVideo } from './frame-clock';

/**
 * LA PENDULE DES COMPOSITEURS D'APPEL (#11313) — un enregistrement peint au
 * rythme des images présentées (rVFC), à défaut à celui de l'écran (rAF),
 * jamais plus vite que la cadence demandée, et jamais en gel : vidéo pilote
 * qui cale ou onglet masqué, la minuterie prend le relais.
 */

type Pending = { readonly kind: 'frame' | 'timer'; readonly ms: number; readonly run: () => void };

const fakeClock = (options: { readonly hidden?: boolean } = {}) => {
  const state = {
    hidden: options.hidden ?? false,
    time: 0,
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
    now: () => state.time,
    onVisibility: (listener) => {
      state.listeners.add(listener);
      return () => void state.listeners.delete(listener);
    },
    frame: (run) => schedule('frame', 0, run),
    timer: (run, ms) => schedule('timer', ms, run),
  };
  const fire = (kind: Pending['kind']): void => {
    const due = [...state.pending.entries()].filter(([, entry]) => entry.kind === kind);
    due.forEach(([id]) => state.pending.delete(id));
    due.forEach(([, entry]) => entry.run());
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
    fireFrames: (): void => fire('frame'),
    fireTimers: (): void => fire('timer'),
    at: (ms: number): void => {
      state.time = ms;
    },
    hide: (): void => {
      state.hidden = true;
      [...state.listeners].forEach((listener) => listener());
    },
    listenerCount: (): number => state.listeners.size,
  };
};

const rvfcVideo = (options: { readonly paused?: boolean } = {}) => {
  const callbacks = new Map<number, () => void>();
  const state = { next: 1 };
  const video: FrameVideo = {
    paused: options.paused ?? false,
    requestVideoFrameCallback: (callback) => {
      const handle = state.next;
      state.next += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelVideoFrameCallback: (handle) => void callbacks.delete(handle),
  };
  const presentFrame = (): void => {
    const due = [...callbacks.values()];
    callbacks.clear();
    due.forEach((callback) => callback());
  };
  return { video, waiting: (): number => callbacks.size, presentFrame };
};

const counter = () => {
  const ticks = { count: 0 };
  return { ticks, tick: (): void => void (ticks.count += 1) };
};

describe('startFrameClock', () => {
  test('startFrameClock_videoFrameCallbackAvailable_ticksOnEachPresentedFrame', () => {
    const clock = fakeClock();
    const { video, waiting, presentFrame } = rvfcVideo();
    const { ticks, tick } = counter();
    const stop = startFrameClock({ fps: 30, tick, driver: () => video, env: clock.env });

    expect(ticks.count).toBe(0);
    expect(waiting()).toBe(1);
    presentFrame();
    expect(ticks.count).toBe(1);
    expect(waiting()).toBe(1);
    expect(clock.kinds()).not.toContain('frame');
    stop.stop();
  });

  test('startFrameClock_noVideoFrameCallback_fallsBackToAnimationFrame', () => {
    const clock = fakeClock();
    const { ticks, tick } = counter();
    const stop = startFrameClock({ fps: 15, tick, driver: () => null, env: clock.env });

    expect(clock.kinds()).toEqual(['frame']);
    clock.fireAll();
    expect(ticks.count).toBe(1);
    expect(clock.kinds()).toEqual(['frame']);
    stop.stop();
  });

  test('startFrameClock_pausedDriverVideo_doesNotWaitForFramesThatWillNeverCome', () => {
    const clock = fakeClock();
    const { video, waiting } = rvfcVideo({ paused: true });
    const stop = startFrameClock({ fps: 30, tick: () => undefined, driver: () => video, env: clock.env });

    expect(waiting()).toBe(0);
    expect(clock.kinds()).toEqual(['frame']);
    stop.stop();
  });

  test('startFrameClock_documentHidden_usesTimerAtFrameRate', () => {
    const clock = fakeClock({ hidden: true });
    const { video, waiting } = rvfcVideo();
    const stop = startFrameClock({ fps: 30, tick: () => undefined, driver: () => video, env: clock.env });

    expect(waiting()).toBe(0);
    expect(clock.kinds()).toEqual(['timer']);
    expect(clock.timerDelays()[0]).toBeCloseTo(1000 / 30, 5);
    stop.stop();
  });

  test('startFrameClock_hiddenWhileWaitingForAFrame_rearmsOnTimerInsteadOfFreezing', () => {
    const clock = fakeClock();
    const { ticks, tick } = counter();
    const stop = startFrameClock({ fps: 10, tick, driver: () => null, env: clock.env });

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
    const { ticks, tick } = counter();
    const stop = startFrameClock({ fps: 30, tick, driver: () => null, env: clock.env });

    expect(clock.listenerCount()).toBe(1);
    stop.stop();
    expect(clock.kinds()).toEqual([]);
    expect(clock.listenerCount()).toBe(0);
    clock.fireAll();
    expect(ticks.count).toBe(0);
  });

  test('startFrameClock_fastDisplay_neverPaintsFasterThanTheRequestedRate', () => {
    const clock = fakeClock();
    const { ticks, tick } = counter();
    const stop = startFrameClock({ fps: 5, tick, driver: () => null, env: clock.env });

    Array.from({ length: 120 }, (_, frame) => frame).forEach((frame) => {
      clock.at((frame * 1000) / 120);
      clock.fireFrames();
    });

    expect(ticks.count).toBe(5);
    stop.stop();
  });

  test('startFrameClock_fastCamera_isCappedAtTheRequestedRate', () => {
    const clock = fakeClock();
    const { video, presentFrame } = rvfcVideo();
    const { ticks, tick } = counter();
    const stop = startFrameClock({ fps: 15, tick, driver: () => video, env: clock.env });

    Array.from({ length: 60 }, (_, frame) => frame).forEach((frame) => {
      clock.at((frame * 1000) / 60);
      presentFrame();
    });

    expect(ticks.count).toBe(15);
    stop.stop();
  });

  test('startFrameClock_driverVideoStalls_watchdogKeepsPaintingTheOtherTiles', () => {
    const clock = fakeClock();
    const { video, waiting } = rvfcVideo();
    const { ticks, tick } = counter();
    const stop = startFrameClock({ fps: 15, tick, driver: () => video, env: clock.env });

    expect(clock.timerDelays()[0]).toBeCloseTo(2000 / 15, 5);
    clock.at(2000 / 15);
    clock.fireTimers();
    expect(ticks.count).toBe(1);
    clock.at(4000 / 15);
    clock.fireTimers();
    expect(ticks.count).toBe(2);
    expect(waiting()).toBe(1);
    stop.stop();
  });

  test('startFrameClock_frameArrivesBeforeWatchdog_cancelsTheWatchdog', () => {
    const clock = fakeClock();
    const { video, waiting, presentFrame } = rvfcVideo();
    const { ticks, tick } = counter();
    const stop = startFrameClock({ fps: 30, tick, driver: () => video, env: clock.env });

    presentFrame();
    expect(clock.kinds()).toEqual(['timer']);
    clock.at(1000 / 30);
    presentFrame();
    expect(ticks.count).toBe(2);
    expect(clock.kinds()).toEqual(['timer']);
    stop.stop();
    expect(clock.kinds()).toEqual([]);
    expect(waiting()).toBe(0);
  });
});
