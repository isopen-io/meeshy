import { describe, it, expect } from '@jest/globals';
import { KeyedMutex } from '../../../utils/keyed-mutex';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('KeyedMutex', () => {
  it('serializes operations sharing the same key (no overlap)', async () => {
    const mutex = new KeyedMutex();
    let active = 0;
    let maxActive = 0;
    const op = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active--;
    };

    await Promise.all([
      mutex.runExclusive('k', op),
      mutex.runExclusive('k', op),
      mutex.runExclusive('k', op),
    ]);

    expect(maxActive).toBe(1);
  });

  it('runs operations on different keys concurrently', async () => {
    const mutex = new KeyedMutex();
    let active = 0;
    let maxActive = 0;
    const op = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active--;
    };

    await Promise.all([mutex.runExclusive('a', op), mutex.runExclusive('b', op)]);

    expect(maxActive).toBe(2);
  });

  it('preserves accumulation under concurrent read-modify-write (the prod bug)', async () => {
    const mutex = new KeyedMutex();
    const store: Record<string, string[]> = { x: [] };
    const addLang = (lang: string) =>
      mutex.runExclusive('x', async () => {
        const current = [...store.x]; // read
        await sleep(1); // fenêtre de race
        current.push(lang); // modify
        store.x = current; // write
      });

    await Promise.all([addLang('en'), addLang('es'), addLang('de')]);

    expect([...store.x].sort()).toEqual(['de', 'en', 'es']);
  });

  it('continues the chain for a key after one operation throws', async () => {
    const mutex = new KeyedMutex();
    const results: string[] = [];
    const a = mutex
      .runExclusive('k', async () => {
        throw new Error('boom');
      })
      .catch(() => results.push('a-failed'));
    const b = mutex.runExclusive('k', async () => {
      results.push('b-ran');
    });

    await Promise.all([a, b]);

    expect(results).toContain('a-failed');
    expect(results).toContain('b-ran');
  });

  it('returns the operation result', async () => {
    const mutex = new KeyedMutex();
    const value = await mutex.runExclusive('k', async () => 42);
    expect(value).toBe(42);
  });
});
