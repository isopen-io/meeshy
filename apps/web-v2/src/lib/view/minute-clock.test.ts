import { describe, expect, test } from 'bun:test';

import { createMinuteClock } from './minute-clock';

/** Un planificateur FAUX, entièrement contrôlé par le témoin. */
function fakeScheduler() {
  let nowValue = 0;
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const started: number[] = [];
  const stopped: number[] = [];

  return {
    scheduler: {
      setInterval: (callback: () => void, _delayMs: number) => {
        const id = nextId++;
        timers.set(id, callback);
        started.push(id);
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
    activeTimerCount: () => timers.size,
  };
}

describe("l'horloge à la minute", () => {
  test('aucun minuteur tant que personne n’est abonné', () => {
    const { activeTimerCount } = fakeScheduler();
    createMinuteClock();
    expect(activeTimerCount()).toBe(0);
  });

  test('un SEUL setInterval quel que soit le nombre d’abonnés', () => {
    const f = fakeScheduler();
    const clock = createMinuteClock(f.scheduler);
    clock.subscribe(() => {});
    clock.subscribe(() => {});
    clock.subscribe(() => {});
    expect(f.started.length).toBe(1);
    expect(f.activeTimerCount()).toBe(1);
  });

  test('chaque tick notifie TOUS les abonnés avec now()', () => {
    const f = fakeScheduler();
    const clock = createMinuteClock(f.scheduler);
    const seenA: number[] = [];
    const seenB: number[] = [];
    clock.subscribe((now) => seenA.push(now));
    clock.subscribe((now) => seenB.push(now));
    f.setNow(60_000);
    f.fireAll();
    expect(seenA).toEqual([60_000]);
    expect(seenB).toEqual([60_000]);
  });

  test('le dernier désabonnement éteint le minuteur', () => {
    const f = fakeScheduler();
    const clock = createMinuteClock(f.scheduler);
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
    const clock = createMinuteClock(f.scheduler);
    const unsub = clock.subscribe(() => {});
    unsub();
    clock.subscribe(() => {});
    expect(f.started.length).toBe(2);
  });
});
