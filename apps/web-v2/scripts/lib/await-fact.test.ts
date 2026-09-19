import { describe, expect, test } from 'bun:test';

import { FACT_CEILING_MS, awaitCondition, awaitFact } from './await-fact.mjs';

/**
 * ATTENDRE UN FAIT SANS JAMAIS LEVER (#7054) — voir le doc-comment de
 * `await-fact.mjs` pour la mesure et la cause racine qui motivent chaque
 * choix testé ici (10 s, `polling: 25`, `then(true, false)`).
 */

describe('awaitFact', () => {
  test("rend true quand le locator atteint l'état demandé", async () => {
    let received: { state: string; timeout: number } | null = null;
    const locator = {
      waitFor: (options: { state: string; timeout: number }) => {
        received = options;
        return Promise.resolve();
      },
    };

    const ok = await awaitFact(locator as never);

    expect(ok).toBe(true);
    expect(received).toEqual({ state: 'attached', timeout: FACT_CEILING_MS });
  });

  test('rend false quand l’attente expire — jamais un throw', async () => {
    const locator = { waitFor: () => Promise.reject(new Error('Timeout 10000ms exceeded.')) };

    const ok = await awaitFact(locator as never);

    expect(ok).toBe(false);
  });

  test('attend l’état "attached" quand demandé explicitement', async () => {
    const receivedStates: string[] = [];
    const locator = {
      waitFor: (options: { state: string; timeout: number }) => {
        receivedStates.push(options.state);
        return Promise.resolve();
      },
    };

    await awaitFact(locator as never, { state: 'attached' });

    expect(receivedStates).toEqual(['attached']);
  });

  test('attend l’état "detached" quand demandé explicitement', async () => {
    const receivedStates: string[] = [];
    const locator = {
      waitFor: (options: { state: string; timeout: number }) => {
        receivedStates.push(options.state);
        return Promise.resolve();
      },
    };

    await awaitFact(locator as never, { state: 'detached' });

    expect(receivedStates).toEqual(['detached']);
  });
});

describe('awaitCondition', () => {
  test('sonde par un intervalle NUMÉRIQUE, jamais requestAnimationFrame', async () => {
    let received: { polling: number; timeout: number } | null = null;
    const page = {
      waitForFunction: (_predicate: unknown, _arg: unknown, options: { polling: number; timeout: number }) => {
        received = options;
        return Promise.resolve();
      },
    };

    const ok = await awaitCondition(page as never, () => true, undefined);

    expect(ok).toBe(true);
    expect(received).toEqual({ polling: 25, timeout: FACT_CEILING_MS });
  });

  test('rend false sans lever quand le prédicat n’atteint jamais son état', async () => {
    const page = { waitForFunction: () => Promise.reject(new Error('Timeout 10000ms exceeded.')) };

    const ok = await awaitCondition(page as never, () => false, undefined);

    expect(ok).toBe(false);
  });

  test('le plafond vaut 10 000 ms — une constante nommée, une fois', () => {
    expect(FACT_CEILING_MS).toBe(10_000);
  });
});
