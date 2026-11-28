/**
 * #20795 — Redis en panne au DÉBIT : `consume` rend `null` et le geste passe
 * sans être compté (fail-open, décision de #19812). Mais le rendu armé par ce
 * geste décrémentait quand Redis revenait — sur des clés que d'AUTRES gestes
 * avaient comptées entre-temps. Un débit ne se rend que là où il a été PRIS.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import Fastify from 'fastify';
import { spendCommunitySalonAdmissionUndoable } from '../../../services/conversations/communitySalonAdmissionBudget';
import type { CommunityAdmission } from '../../../services/conversations/communityMembershipSync';
import { spendCommunityAdditionOfTargetsUndoable } from '../../../utils/community-addition-budget';

const ACTEUR = '507f1f77bcf86cd7994390a1';
const AUTRE = '507f1f77bcf86cd7994390a2';
const CIBLE = '507f1f77bcf86cd7994390b1';

const fakeRedis = () => {
  const store = new Map<string, number>();
  const state: { down: boolean; downFor: (key: string) => boolean } = { down: false, downFor: () => false };
  const guard = (key = '') => {
    if (state.down || state.downFor(key)) throw new Error('ECONNREFUSED');
  };
  const pipeline = () => {
    const ops: Array<() => [null, number]> = [];
    const keys: string[] = [];
    const chain = {
      incr: (key: string) => (keys.push(key), ops.push(() => [null, store.set(key, (store.get(key) ?? 0) + 1).get(key) as number]), chain),
      incrby: (key: string, n: number) => (keys.push(key), ops.push(() => [null, store.set(key, (store.get(key) ?? 0) + n).get(key) as number]), chain),
      pttl: (_key: string) => (ops.push(() => [null, 60_000]), chain),
      exec: async () => {
        keys.forEach((key) => guard(key));
        return ops.map((op) => op());
      },
    };
    return chain;
  };
  const redis = {
    pipeline,
    pexpire: async () => 1,
    exists: async (key: string) => (guard(), store.has(key) ? 1 : 0),
    decr: async (key: string) => (guard(), store.set(key, (store.get(key) ?? 0) - 1).get(key) as number),
    decrby: async (key: string, n: number) => (guard(), store.set(key, (store.get(key) ?? 0) - n).get(key) as number),
    set: async (key: string, value: string) => (guard(), store.set(key, Number(value)), 'OK'),
    del: async (key: string) => (guard(), store.delete(key), 1),
  };
  return { redis, store, state };
};

const appWith = (redis: unknown) => {
  const app = Fastify({ logger: false });
  app.decorate('redis', redis as never);
  return app;
};

const entre = (userId: string): CommunityAdmission => ({ kind: 'admitted', reactivations: [], creations: [{ userId, via: 'invited' } as never] });
const count = (store: Map<string, number>, suffix: string) =>
  [...store.entries()].find(([key]) => key.endsWith(suffix))?.[1] ?? 0;

describe('#20795 — un débit pris pendant une panne Redis ne se rend pas sur les gestes des autres', () => {
  it('le seau de la CIBLE garde les ajouts que d’autres ont comptés après la panne', async () => {
    const { redis, store, state } = fakeRedis();
    const app = appWith(redis);
    state.down = true;
    const pendantLaPanne = await spendCommunityAdditionOfTargetsUndoable(app, [CIBLE], ACTEUR);
    expect(pendantLaPanne.verdict.allowed).toBe(true);
    state.down = false;
    await spendCommunityAdditionOfTargetsUndoable(app, [CIBLE], AUTRE);
    await spendCommunityAdditionOfTargetsUndoable(app, [CIBLE], AUTRE);
    expect(count(store, `target:d:user:${CIBLE}`)).toBe(2);

    await pendantLaPanne.rendre();

    expect(count(store, `target:d:user:${CIBLE}`)).toBe(2);
    await app.close();
  });

  it('le seau de l’ACTEUR garde les gestes qu’il a comptés après la panne', async () => {
    const { redis, store, state } = fakeRedis();
    const app = appWith(redis);
    state.down = true;
    const pendantLaPanne = await spendCommunitySalonAdmissionUndoable(app, ACTEUR, entre(CIBLE));
    expect(pendantLaPanne.verdict.allowed).toBe(true);
    state.down = false;
    await spendCommunitySalonAdmissionUndoable(app, ACTEUR, entre('507f1f77bcf86cd7994390b2'));
    expect(count(store, `actor:h:user:${ACTEUR}`)).toBe(1);
    expect(count(store, `actor:d:user:${ACTEUR}`)).toBe(1);

    await pendantLaPanne.rendre();

    expect(count(store, `actor:h:user:${ACTEUR}`)).toBe(1);
    expect(count(store, `actor:d:user:${ACTEUR}`)).toBe(1);
    await app.close();
  });

  it('une fenêtre comptée et l’autre en panne : seule la fenêtre comptée se rend', async () => {
    const { redis, store, state } = fakeRedis();
    const app = appWith(redis);
    state.downFor = (key) => key.includes('actor:d');
    const spend = await spendCommunitySalonAdmissionUndoable(app, ACTEUR, entre(CIBLE));
    expect(spend.verdict.allowed).toBe(true);
    expect(count(store, `actor:h:user:${ACTEUR}`)).toBe(1);
    state.downFor = () => false;
    await spendCommunitySalonAdmissionUndoable(app, ACTEUR, entre('507f1f77bcf86cd7994390b2'));
    expect(count(store, `actor:d:user:${ACTEUR}`)).toBe(1);

    await spend.rendre();

    expect(count(store, `actor:h:user:${ACTEUR}`)).toBe(1);
    expect(count(store, `actor:d:user:${ACTEUR}`)).toBe(1);
    await app.close();
  });

  it('un débit compté se rend toujours, Redis vivant', async () => {
    const { redis, store } = fakeRedis();
    const app = appWith(redis);
    const spend = await spendCommunitySalonAdmissionUndoable(app, ACTEUR, entre(CIBLE));
    expect(count(store, `actor:h:user:${ACTEUR}`)).toBe(1);
    expect(count(store, `target:d:user:${CIBLE}`)).toBe(1);
    await spend.rendre();
    expect(count(store, `actor:h:user:${ACTEUR}`)).toBe(0);
    expect(count(store, `target:d:user:${CIBLE}`)).toBe(0);
    await app.close();
  });
});
