import { mapWithConcurrency, settleWithConcurrency, chunk } from '../../utils/concurrency.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('mapWithConcurrency', () => {
  it('returns an empty array for no items without calling the task', async () => {
    let calls = 0;
    const result = await mapWithConcurrency([] as number[], 4, async (value) => {
      calls += 1;
      return value;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it('preserves input order even when tasks settle out of order', async () => {
    const delays = [30, 0, 15, 5];
    const result = await mapWithConcurrency(delays, 4, async (ms, index) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return index;
    });
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('passes the item and its index to the task', async () => {
    const seen: Array<[string, number]> = [];
    await mapWithConcurrency(['a', 'b', 'c'], 1, async (item, index) => {
      seen.push([item, index]);
      return item;
    });
    expect(seen).toEqual([['a', 0], ['b', 1], ['c', 2]]);
  });

  it('never exceeds the requested concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return value;
    });
    expect(peak).toBe(3);
  });

  it('starts a queued item as soon as a slot frees up', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const started: number[] = [];

    const all = mapWithConcurrency(gates, 2, async (gate, index) => {
      started.push(index);
      return gate.promise;
    });

    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    gates[0].resolve('first');
    await gates[0].promise;
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve('second');
    gates[2].resolve('third');
    expect(await all).toEqual(['first', 'second', 'third']);
  });

  it('runs sequentially when the limit is 1', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3], 1, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return value;
    });
    expect(peak).toBe(1);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'clamps a nonsensical limit (%p) instead of running unbounded',
    async (limit) => {
      let inFlight = 0;
      let peak = 0;
      const result = await mapWithConcurrency([1, 2, 3, 4], limit as number, async (value) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return value * 2;
      });
      expect(result).toEqual([2, 4, 6, 8]);
      expect(peak).toBeGreaterThanOrEqual(1);
      expect(peak).toBeLessThanOrEqual(4);
    }
  );

  it('never spawns more workers than items', async () => {
    let started = 0;
    await mapWithConcurrency([1, 2], 50, async (value) => {
      started += 1;
      return value;
    });
    expect(started).toBe(2);
  });

  it('rejects with the first error, like Promise.all', async () => {
    const boom = new Error('boom');
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (value) => {
        if (value === 2) throw boom;
        return value;
      })
    ).rejects.toBe(boom);
  });

  it('leaves no unhandled rejection when several tasks fail', async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onUnhandled);

    await expect(
      mapWithConcurrency([1, 2, 3, 4], 4, async () => {
        throw new Error('always');
      })
    ).rejects.toThrow('always');

    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off('unhandledRejection', onUnhandled);
    expect(rejections).toEqual([]);
  });
});

describe('settleWithConcurrency', () => {
  it('isolates failures and still reports successes in order', async () => {
    const results = await settleWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error(`fail ${value}`);
      return value * 10;
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ ok: true, value: 10 });
    expect(results[1].ok).toBe(false);
    expect(results[2]).toEqual({ ok: true, value: 30 });
  });

  it('runs every item even when the first one fails', async () => {
    const seen: number[] = [];
    await settleWithConcurrency([1, 2, 3], 1, async (value) => {
      seen.push(value);
      throw new Error('always');
    });
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('chunk', () => {
  it('returns an empty array for no items', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('splits in order with a trailing partial chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when size exceeds the input', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  // Contrat documenté : « size non finie ou < 1 produit une tranche unique ».
  // On épingle la STRUCTURE (`[[1, 2, 3]]`), pas seulement `.flat()` : un
  // `.flat()` seul laissait passer `[[1], [2], [3]]` — exactement le bug où un
  // `size` fini < 1 (0, négatif, fractionnaire) tombait sur `step = 1` au lieu
  // de la tranche unique, alors que le chemin non fini (NaN/Infinity) l'honorait
  // déjà. Toute taille absurde doit donc rendre une seule tranche, jamais
  // boucler à l'infini ni fragmenter en singletons.
  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'produces a single chunk for a nonsensical size (%p)',
    (size) => {
      expect(chunk([1, 2, 3], size as number)).toEqual([[1, 2, 3]]);
    }
  );
});
