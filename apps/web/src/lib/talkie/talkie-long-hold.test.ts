import { describe, expect, test } from 'bun:test';

import { createLongHold, TALKIE_LONG_HOLD_MS, type HoldSchedule } from './talkie-long-hold';

/**
 * **L'APPUI LONG D'UN TALKIE POSÉ PARMI D'AUTRES GESTES** (#19888, iso `TalkieLongHold` iOS #19885) — en deçà du
 * seuil, un toucher ; au-delà, la voix s'ouvre et le relâcher la ferme, en avalant le toucher qui suivrait.
 */

const manual = () => {
  const timers: Array<{ readonly fire: () => void; readonly ms: number; cancelled: boolean }> = [];
  const schedule: HoldSchedule = (fire, ms) => {
    const timer = { fire, ms, cancelled: false };
    timers.push(timer);
    return () => void (timer.cancelled = true);
  };
  return { timers, schedule, fire: () => timers.filter((timer) => !timer.cancelled).forEach((timer) => timer.fire()) };
};

const counting = () => {
  const counts = { hold: 0, release: 0 };
  return { counts, onHold: () => void (counts.hold += 1), onRelease: () => void (counts.release += 1) };
};

describe('createLongHold (#19888)', () => {
  test('le seuil est celui d’iOS : 350 ms', () => {
    const clock = manual();
    const hold = createLongHold({ ...counting(), schedule: clock.schedule });
    hold.down();
    expect(clock.timers.map((timer) => timer.ms)).toEqual([TALKIE_LONG_HOLD_MS]);
    expect(TALKIE_LONG_HOLD_MS).toBe(350);
  });

  test('relâché avant le seuil : un toucher, rien ne s’ouvre et le toucher passe', () => {
    const clock = manual();
    const calls = counting();
    const hold = createLongHold({ ...calls, schedule: clock.schedule });
    hold.down();
    expect(hold.up()).toBe('tap');
    clock.fire();
    expect(calls.counts).toEqual({ hold: 0, release: 0 });
    expect(hold.swallowsTap()).toBe(false);
  });

  test('tenu au-delà du seuil : la voix s’ouvre, le relâcher la ferme et avale UN toucher', () => {
    const clock = manual();
    const calls = counting();
    const hold = createLongHold({ ...calls, schedule: clock.schedule });
    hold.down();
    clock.fire();
    expect(calls.counts).toEqual({ hold: 1, release: 0 });
    expect(hold.up()).toBe('held');
    expect(calls.counts).toEqual({ hold: 1, release: 1 });
    expect(hold.swallowsTap()).toBe(true);
    expect(hold.swallowsTap()).toBe(false);
  });

  test('annulé pendant la voix : elle se ferme une fois, et un second appui repart de zéro', () => {
    const clock = manual();
    const calls = counting();
    const hold = createLongHold({ ...calls, schedule: clock.schedule });
    hold.down();
    clock.fire();
    hold.cancel();
    hold.cancel();
    expect(calls.counts).toEqual({ hold: 1, release: 1 });
    hold.down();
    expect(hold.up()).toBe('tap');
  });

  test('un second appui pendant l’attente ne double pas le minuteur', () => {
    const clock = manual();
    const calls = counting();
    const hold = createLongHold({ ...calls, schedule: clock.schedule });
    hold.down();
    hold.down();
    clock.fire();
    expect(calls.counts.hold).toBe(1);
  });
});
