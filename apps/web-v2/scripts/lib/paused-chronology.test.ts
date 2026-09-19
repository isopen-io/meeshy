import { describe, expect, test } from 'bun:test';

import { CHRONOLOGY_STEP_MS, pausedChronology } from './paused-chronology.mjs';

/**
 * UNE CHRONOLOGIE SOUS HORLOGE EN PAUSE (#7054) — voir le doc-comment de
 * `paused-chronology.mjs` pour la cause racine (Playwright 1.62.1, l'horloge
 * truquée dérive avec le mur sous `install` seul) et la mesure qui motivent
 * chaque choix testé ici.
 */

type Call =
  | { readonly op: 'install'; readonly time: unknown }
  | { readonly op: 'pauseAt'; readonly time: unknown }
  | { readonly op: 'runFor'; readonly ticks: number };

const fakePage = () => {
  const calls: Call[] = [];
  const page = {
    clock: {
      install: (options: { time: unknown }) => {
        calls.push({ op: 'install', time: options.time });
        return Promise.resolve();
      },
      pauseAt: (time: unknown) => {
        calls.push({ op: 'pauseAt', time });
        return Promise.resolve();
      },
      runFor: (ticks: number) => {
        calls.push({ op: 'runFor', ticks });
        return Promise.resolve();
      },
    },
  };
  return { page, calls };
};

describe('pausedChronology', () => {
  test('installe PUIS met en pause à l’instant donné, dans cet ordre', async () => {
    const { page, calls } = fakePage();

    await pausedChronology(page as never, { time: 1_726_750_000_000 });

    expect(calls).toEqual([
      { op: 'install', time: 1_726_750_000_000 },
      { op: 'pauseAt', time: 1_726_750_000_000 },
    ]);
  });

  test('advanceTo avance exactement de la différence, jamais deux fois', async () => {
    const { page, calls } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0 });

    await chrono.advanceTo(300);
    await chrono.advanceTo(2_500);

    const runs = calls.filter((c): c is { op: 'runFor'; ticks: number } => c.op === 'runFor');
    expect(runs).toEqual([{ op: 'runFor', ticks: 300 }, { op: 'runFor', ticks: 2_200 }]);
    expect(chrono.now()).toBe(2_500);
  });

  test('advanceTo refuse de reculer', async () => {
    const { page } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0 });
    await chrono.advanceTo(300);

    let caught: unknown = null;
    try {
      await chrono.advanceTo(100);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RangeError);
  });

  test('advanceTo(now()) est un no-op — aucun runFor', async () => {
    const { page, calls } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0 });
    await chrono.advanceTo(300);
    const runsBefore = calls.filter((c) => c.op === 'runFor').length;

    await chrono.advanceTo(300);

    const runsAfter = calls.filter((c) => c.op === 'runFor').length;
    expect(runsAfter).toBe(runsBefore);
  });

  test('factBefore rend true sans avancer quand le fait est déjà là', async () => {
    const { page, calls } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0 });

    const ok = await chrono.factBefore(1_000, () => true);

    expect(ok).toBe(true);
    expect(calls.some((c) => c.op === 'runFor')).toBe(false);
    expect(chrono.now()).toBe(0);
  });

  test('factBefore avance par pas jusqu’au fait et comptabilise les pas', async () => {
    const { page, calls } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0, stepMs: 50 });
    let attempts = 0;
    const fait = () => {
      attempts += 1;
      return attempts >= 3;
    };

    const ok = await chrono.factBefore(1_000, fait);

    expect(ok).toBe(true);
    const runs = calls.filter((c) => c.op === 'runFor');
    expect(runs).toEqual([{ op: 'runFor', ticks: 50 }, { op: 'runFor', ticks: 50 }]);
    expect(chrono.now()).toBe(100);
  });

  test('factBefore rend true quand le fait arrive exactement à before − step', async () => {
    const { page } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0, stepMs: 50 });

    const ok = await chrono.factBefore(100, () => chrono.now() >= 50);

    expect(ok).toBe(true);
    expect(chrono.now()).toBe(50);
  });

  test('factBefore rend false quand le fait n’arrive qu’à before (jamais franchi)', async () => {
    const { page } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0, stepMs: 50 });

    const ok = await chrono.factBefore(100, () => chrono.now() >= 100);

    expect(ok).toBe(false);
    expect(chrono.now()).toBeLessThanOrEqual(50);
  });

  test('factBefore rend false, il ne lève pas, quand le fait n’arrive jamais', async () => {
    const { page } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0, stepMs: 50 });

    const ok = await chrono.factBefore(500, () => false);

    expect(ok).toBe(false);
  });

  test('mark rend l’instant courant sans effet', async () => {
    const { page, calls } = fakePage();
    const chrono = await pausedChronology(page as never, { time: 0 });
    await chrono.advanceTo(400);
    const runsBefore = calls.filter((c) => c.op === 'runFor').length;

    const marked = chrono.mark();

    expect(marked).toBe(400);
    expect(calls.filter((c) => c.op === 'runFor').length).toBe(runsBefore);
  });

  test('le pas par défaut vaut 50 ms — une constante nommée, une fois', () => {
    expect(CHRONOLOGY_STEP_MS).toBe(50);
  });
});
