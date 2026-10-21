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
    // Sans chronomètre : l'élément lent ne se termine que lorsque le test le libère.
    // Tant qu'il tient sa place, les trois rapides doivent TOUS passer par la seconde
    // — des tranches (`slice` + `allSettled`) attendraient le lent avant de lancer `b`.
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => { releaseSlow = resolve; });
    const started: string[] = [];
    const settled = settleWithConcurrency(['lent', 'a', 'b', 'c'], 2, async (item) => {
      started.push(item);
      if (item === 'lent') await slow;
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(started).toEqual(['lent', 'a', 'b', 'c']);

    releaseSlow();
    await expect(settled).resolves.toHaveLength(4);
  });

  it('une liste vide rend une liste vide', async () => {
    await expect(settleWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});
