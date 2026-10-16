/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { settleWithConcurrency } from '../../../utils/settle-with-concurrency';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('settleWithConcurrency', () => {
  it('rend les issues dans l’ordre des entrées, échecs compris', async () => {
    const results = await settleWithConcurrency([30, 5, 20, 1], 2, async (ms) => {
      await delay(ms);
      if (ms === 20) throw new Error('vingt');
      return ms * 2;
    });

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled']);
    expect(results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<number>).value))
      .toEqual([60, 10, 2]);
  });

  it('relance dès qu’une place se libère, sans attendre la tranche la plus lente', async () => {
    const started: number[] = [];
    await settleWithConcurrency([50, 1, 1, 1], 2, async (ms) => {
      started.push(Date.now());
      await delay(ms);
    });
    expect(started[3] - started[0]).toBeLessThan(40);
  });

  it('une liste vide rend une liste vide', async () => {
    await expect(settleWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});
