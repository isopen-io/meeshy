/**
 * Audit du delta de #19080, D3 — un Redis JOIGNABLE qui répond une erreur PAR
 * COMMANDE (LOADING au redémarrage, READONLY pendant une bascule, OOM sous
 * `noeviction`) ne fait pas lever `pipeline.exec()` : ioredis résout des couples
 * `[erreur, null]`. `RedisStore.increment` lisait alors un compte `undefined`,
 * jugé « sous le plafond ». C'est une panne du magasin, et `consume` le dit
 * (`null`), comme pour une connexion perdue — le budget des bundles en tire son
 * repli de dernier recours (`key-reservation-budget.test.ts`).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { Redis } from 'ioredis';
import { RateLimiter } from '../../../utils/rate-limiter';

/** Un Redis qui répond `reply` à chaque commande de la file : `[erreur, valeur]`, comme ioredis. */
const redisReplying = (reply: () => [Error | null, unknown]): Redis => {
  const queued: string[] = [];
  const pipeline = {
    incr: () => { queued.push('incr'); return pipeline; },
    incrby: () => { queued.push('incrby'); return pipeline; },
    pttl: () => { queued.push('pttl'); return pipeline; },
    exec: async () => queued.splice(0).map(() => reply()),
  };
  return { pipeline: () => pipeline, pexpire: async () => 1 } as unknown as Redis;
};

const limiter = (redis: Redis) => new RateLimiter({ max: 1, windowMs: 60_000, keyPrefix: 'reply-errors' }, redis);

describe('RedisStore — une réponse sans compte est une panne du magasin (audit du delta #19080, D3)', () => {
  it.each([
    'LOADING Redis is loading the dataset in memory',
    'READONLY You can\'t write against a read only replica.',
    'OOM command not allowed when used memory > \'maxmemory\'.',
  ])('« %s » à chaque commande : consume rend null, jamais un compte sous le plafond', async (message) => {
    const replyError = Object.assign(new Error(message), { name: 'ReplyError' });

    await expect(limiter(redisReplying(() => [replyError, null])).consume('user:a', 1)).resolves.toBeNull();
  });

  it('une valeur qui n’est pas un nombre est une panne, pas un compte', async () => {
    await expect(limiter(redisReplying(() => [null, 'QUEUED'])).consume('user:a', 1)).resolves.toBeNull();
  });

  it('un compte rendu reste un compte : sous puis au-delà du plafond (contrôle)', async () => {
    const counts = [1, 60_000, 2, 59_000];
    const redis = redisReplying(() => [null, counts.shift()]);

    await expect(limiter(redis).consume('user:a', 1)).resolves.toMatchObject({ remaining: 0 });
    await expect(limiter(redis).consume('user:a', 1)).resolves.toMatchObject({ remaining: 0, retryAfter: expect.any(Number) });
  });
});
