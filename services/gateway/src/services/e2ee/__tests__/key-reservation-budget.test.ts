/**
 * Audit de #19080, E4 — le magasin des compteurs en panne. `RateLimiter.consume`
 * rend `null` quand Redis tombe, ce que le budget lisait « sous le plafond » :
 * le seau de la CIBLE laissait alors dépenser ses pré-clés uniques sans compter.
 * Son repli sûr est le dernier recours, qui ne refuse personne et ne consomme
 * aucune pré-clé ; le DEMANDEUR, lui, passe comme devant chaque limiteur de la
 * passerelle. La limitation désactivée hors production (`RATE_LIMIT_DISABLED`)
 * n'est pas une panne : elle dépense, comme avant.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import type { Redis } from 'ioredis';
import { createKeyReservationBudget } from '../key-reservation-budget';

const REQUESTER = '507f1f77bcf86cd7994390a1';
const TARGET = '507f1f77bcf86cd7994390b1';

/** Un Redis dont chaque commande lève, comme une connexion perdue. */
const unreachableRedis = (): Redis =>
  new Proxy({}, { get: () => () => { throw new Error('redis: connection lost'); } }) as unknown as Redis;

/**
 * Un Redis JOIGNABLE qui répond une erreur PAR COMMANDE (LOADING au redémarrage,
 * READONLY pendant une bascule, OOM sous `noeviction`) : `pipeline.exec()` ne
 * lève pas, il résout des couples `[erreur, null]` (audit du delta de #19080, D3).
 */
const replyingErrorsRedis = (message: string): Redis => {
  const failure = () => Object.assign(new Error(message), { name: 'ReplyError' });
  const queued: string[] = [];
  const pipeline = {
    incr: () => { queued.push('incr'); return pipeline; },
    incrby: () => { queued.push('incrby'); return pipeline; },
    pttl: () => { queued.push('pttl'); return pipeline; },
    exec: async () => queued.splice(0).map(() => [failure(), null]),
  };
  return { pipeline: () => pipeline, pexpire: async () => { throw failure(); } } as unknown as Redis;
};

const environment = { disabled: process.env.RATE_LIMIT_DISABLED, nodeEnv: process.env.NODE_ENV };

afterEach(() => {
  if (environment.disabled === undefined) delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = environment.disabled;
  process.env.NODE_ENV = environment.nodeEnv;
});

describe('le budget des bundles quand le magasin des compteurs tombe (audit #19080, E4)', () => {
  it('le demandeur passe, et la cible ne perd aucune pré-clé unique : bundle de dernier recours', async () => {
    delete process.env.RATE_LIMIT_DISABLED;

    const verdict = await createKeyReservationBudget(unreachableRedis()).spend({ requesterUserId: REQUESTER, targetUserId: TARGET });

    expect(verdict).toEqual({ requesterAllowed: true, retryAfter: 0, spendOneTimeKeys: false });
  });

  it.each([
    'LOADING Redis is loading the dataset in memory',
    'READONLY You can\'t write against a read only replica.',
    'OOM command not allowed when used memory > \'maxmemory\'.',
  ])('un Redis qui répond « %s » à chaque commande n’est pas « sous le plafond » : dernier recours', async (message) => {
    delete process.env.RATE_LIMIT_DISABLED;

    const verdict = await createKeyReservationBudget(replyingErrorsRedis(message)).spend({ requesterUserId: REQUESTER, targetUserId: TARGET });

    expect(verdict).toEqual({ requesterAllowed: true, retryAfter: 0, spendOneTimeKeys: false });
  });

  it('un magasin qui répond dépense sous le plafond, comme avant (contrôle)', async () => {
    delete process.env.RATE_LIMIT_DISABLED;

    const verdict = await createKeyReservationBudget().spend({ requesterUserId: REQUESTER, targetUserId: TARGET });

    expect(verdict).toEqual({ requesterAllowed: true, retryAfter: 0, spendOneTimeKeys: true });
  });

  it('la limitation désactivée hors production n’est pas une panne : elle dépense', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    process.env.NODE_ENV = 'test';

    const verdict = await createKeyReservationBudget(unreachableRedis()).spend({ requesterUserId: REQUESTER, targetUserId: TARGET });

    expect(verdict.spendOneTimeKeys).toBe(true);
  });

  it('ses propres appareils se lisent toujours avec leurs pré-clés, magasin en panne ou non', async () => {
    delete process.env.RATE_LIMIT_DISABLED;

    const verdict = await createKeyReservationBudget(unreachableRedis()).spend({ requesterUserId: REQUESTER, targetUserId: REQUESTER });

    expect(verdict.spendOneTimeKeys).toBe(true);
  });
});
