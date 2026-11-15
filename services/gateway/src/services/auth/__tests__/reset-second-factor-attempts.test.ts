/**
 * #10866 — le compteur d'essais 2FA d'un jeton de réinitialisation, sur son
 * chemin de PRODUCTION (Redis) : rang atomique, durée de vie posée dans la même
 * transaction, rang rendu sans jamais passer sous zéro, et repli sur la mémoire
 * de l'instance quand Redis ne répond plus — jamais un refus généralisé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { Redis } from 'ioredis';

import { createResetSecondFactorAttempts } from '../reset-second-factor-attempts';

type Entry = { value: number; ttl: number | null };

function fakeRedis(options: { broken?: boolean } = {}) {
  const store = new Map<string, Entry>();
  const expireCalls: Array<readonly [string, number, string | undefined]> = [];
  const fail = () => {
    if (options.broken) throw new Error('Connection is closed.');
  };
  const client = {
    multi() {
      const ops: Array<() => readonly [Error | null, unknown]> = [];
      const chain = {
        incr(key: string) {
          ops.push(() => {
            const entry = store.get(key) ?? { value: 0, ttl: null };
            const next = { ...entry, value: entry.value + 1 };
            store.set(key, next);
            return [null, next.value] as const;
          });
          return chain;
        },
        expire(key: string, seconds: number, mode?: string) {
          ops.push(() => {
            expireCalls.push([key, seconds, mode]);
            const entry = store.get(key);
            if (!entry || (mode === 'NX' && entry.ttl !== null)) return [null, 0] as const;
            store.set(key, { ...entry, ttl: seconds });
            return [null, 1] as const;
          });
          return chain;
        },
        async exec() {
          fail();
          return ops.map((op) => op());
        },
      };
      return chain;
    },
    async decr(key: string) {
      fail();
      const entry = store.get(key) ?? { value: 0, ttl: null };
      store.set(key, { ...entry, value: entry.value - 1 });
      return entry.value - 1;
    },
    async del(key: string) {
      fail();
      store.delete(key);
      return 1;
    },
  };
  return { redis: client as unknown as Redis, store, expireCalls };
}

describe('compteur d’essais 2FA — chemin Redis (#10866)', () => {
  it('rend des rangs successifs, une clé par jeton, sans le jeton dans la clé', async () => {
    const { redis, store } = fakeRedis();
    const attempts = createResetSecondFactorAttempts({ redis });

    expect(await attempts.reserve('tok-a')).toBe(1);
    expect(await attempts.reserve('tok-a')).toBe(2);
    expect(await attempts.reserve('tok-b')).toBe(1);
    expect([...store.keys()].sort()).toEqual(['auth:reset-2fa:token:tok-a', 'auth:reset-2fa:token:tok-b']);
  });

  it('la durée de vie est posée DANS la transaction, en NX : une heure, jamais repoussée', async () => {
    const { redis, store, expireCalls } = fakeRedis();
    const attempts = createResetSecondFactorAttempts({ redis });
    await attempts.reserve('tok');
    await attempts.reserve('tok');

    expect(expireCalls.every(([, seconds, mode]) => seconds === 3600 && mode === 'NX')).toBe(true);
    expect(store.get('auth:reset-2fa:token:tok')).toEqual({ value: 2, ttl: 3600 });
  });

  it('rendre un rang le retire ; rendre sur une clé absente ne laisse aucun compteur négatif', async () => {
    const { redis, store } = fakeRedis();
    const attempts = createResetSecondFactorAttempts({ redis });
    await attempts.reserve('tok');
    await attempts.release('tok');
    expect(store.get('auth:reset-2fa:token:tok')?.value).toBe(0);

    await attempts.release('expired');
    expect(store.has('auth:reset-2fa:token:expired')).toBe(false);
  });

  it('Redis fermé : le compteur se replie sur la mémoire et BORNE encore', async () => {
    const { redis } = fakeRedis({ broken: true });
    const attempts = createResetSecondFactorAttempts({ redis });

    const ranks = [];
    for (let i = 0; i < 6; i++) ranks.push(await attempts.reserve('tok'));

    expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
