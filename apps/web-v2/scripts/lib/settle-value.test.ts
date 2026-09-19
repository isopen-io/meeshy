import { describe, expect, test } from 'bun:test';

import { SETTLE_ATTEMPTS, SETTLE_STEP_MS, waitForValueSettled } from './settle-value.mjs';

/**
 * ATTENDRE QU'UNE VALEUR SE STABILISE, PAS QU'ELLE CHANGE UNE FOIS (#7054) —
 * voir le doc-comment de `settle-value.mjs` pour la mesure (30/30 essais
 * verts) qui motive le budget par défaut.
 */

const fakePage = (readings: readonly unknown[]) => {
  let index = 0;
  const waited: number[] = [];
  const page = {
    evaluate: () => {
      const value = readings[Math.min(index, readings.length - 1)];
      index += 1;
      return Promise.resolve(value);
    },
    waitForTimeout: (ms: number) => {
      waited.push(ms);
      return Promise.resolve();
    },
  };
  return { page, waited, callCount: () => index };
};

describe('waitForValueSettled', () => {
  test('rend la valeur dès que deux lectures consécutives concordent', async () => {
    const { page, callCount } = fakePage(['a', 'b', 'b', 'c']);

    const result = await waitForValueSettled(page as never, () => undefined, undefined);

    expect(result).toBe('b');
    expect(callCount()).toBe(3);
  });

  test('une PREMIÈRE lecture seule ne suffit jamais — il en faut deux identiques', async () => {
    const { page, callCount } = fakePage(['x', 'x']);

    const result = await waitForValueSettled(page as never, () => undefined, undefined);

    expect(result).toBe('x');
    expect(callCount()).toBe(2);
  });

  test('rend undefined, jamais un throw, quand la valeur ne se stabilise pas dans le budget', async () => {
    let toggle = false;
    const page = {
      evaluate: () => {
        toggle = !toggle;
        return Promise.resolve(toggle);
      },
      waitForTimeout: () => Promise.resolve(),
    };

    const result = await waitForValueSettled(page as never, () => undefined, undefined, { attempts: 5 });

    expect(result).toBeUndefined();
  });

  test('espace deux lectures du pas configuré, jamais un délai plus long', async () => {
    const { page, waited } = fakePage(['a', 'a']);

    await waitForValueSettled(page as never, () => undefined, undefined, { stepMs: 7 });

    expect(waited).toEqual([7]);
  });

  test('les constantes par défaut sont nommées, une fois', () => {
    expect(SETTLE_STEP_MS).toBe(50);
    expect(SETTLE_ATTEMPTS).toBe(100);
  });
});
