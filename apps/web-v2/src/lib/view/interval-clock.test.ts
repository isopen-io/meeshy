import { describe, expect, test } from 'bun:test';

import { createIntervalClock } from './interval-clock';

/** Un planificateur FAUX, entièrement contrôlé par le témoin — même patron que `minute-clock.test.ts`. */
function fakeScheduler() {
  let nowValue = 0;
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const started: number[] = [];
  const stopped: number[] = [];
  const delays: number[] = [];

  return {
    scheduler: {
      setInterval: (callback: () => void, delayMs: number) => {
        const id = nextId++;
        timers.set(id, callback);
        started.push(id);
        delays.push(delayMs);
        return id;
      },
      clearInterval: (id: unknown) => {
        timers.delete(id as number);
        stopped.push(id as number);
      },
      now: () => nowValue,
    },
    setNow: (v: number) => {
      nowValue = v;
    },
    fireAll: () => {
      for (const cb of timers.values()) cb();
    },
    started,
    stopped,
    delays,
    activeTimerCount: () => timers.size,
  };
}

describe('createIntervalClock — généralisation (#5816, E6)', () => {
  test('arme le planificateur avec l’intervalle PASSÉ, pas un littéral figé', () => {
    const f = fakeScheduler();
    const clock = createIntervalClock(1_000, f.scheduler);
    clock.subscribe(() => {});
    expect(f.delays).toEqual([1_000]);
  });

  test('aucun minuteur tant que personne n’est abonné', () => {
    const f = fakeScheduler();
    createIntervalClock(1_000, f.scheduler);
    expect(f.activeTimerCount()).toBe(0);
  });

  test('un SEUL setInterval quel que soit le nombre d’abonnés', () => {
    const f = fakeScheduler();
    const clock = createIntervalClock(1_000, f.scheduler);
    clock.subscribe(() => {});
    clock.subscribe(() => {});
    clock.subscribe(() => {});
    expect(f.started.length).toBe(1);
    expect(f.activeTimerCount()).toBe(1);
  });

  test('chaque tick notifie TOUS les abonnés avec now()', () => {
    const f = fakeScheduler();
    const clock = createIntervalClock(1_000, f.scheduler);
    const seenA: number[] = [];
    const seenB: number[] = [];
    clock.subscribe((now) => seenA.push(now));
    clock.subscribe((now) => seenB.push(now));
    f.setNow(1_000);
    f.fireAll();
    expect(seenA).toEqual([1_000]);
    expect(seenB).toEqual([1_000]);
  });

  test('le dernier désabonnement éteint le minuteur', () => {
    const f = fakeScheduler();
    const clock = createIntervalClock(1_000, f.scheduler);
    const unsubA = clock.subscribe(() => {});
    const unsubB = clock.subscribe(() => {});
    unsubA();
    expect(f.activeTimerCount()).toBe(1);
    unsubB();
    expect(f.activeTimerCount()).toBe(0);
    expect(f.stopped.length).toBe(1);
  });

  test('un nouvel abonné après extinction rouvre un minuteur', () => {
    const f = fakeScheduler();
    const clock = createIntervalClock(1_000, f.scheduler);
    const unsub = clock.subscribe(() => {});
    unsub();
    clock.subscribe(() => {});
    expect(f.started.length).toBe(2);
  });

  test('deux horloges d’intervalles différents sont deux minuteurs INDÉPENDANTS', () => {
    const f = fakeScheduler();
    const minute = createIntervalClock(60_000, f.scheduler);
    const second = createIntervalClock(1_000, f.scheduler);
    minute.subscribe(() => {});
    second.subscribe(() => {});
    expect(f.activeTimerCount()).toBe(2);
    expect(f.delays.sort((a, b) => a - b)).toEqual([1_000, 60_000]);
  });
});
