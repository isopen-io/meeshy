/**
 * DE SANG À SANG RIEN NE SE COUPE (#20361) — après MON accord au palier pour un Sang réel, chaque
 * réglage par personne qui COUPE répond 409 RELATION_BLOOD_LOCKED et n'écrit rien ; le GET dit
 * `lockedByLevel`. Avant l'accord (décision B, #20367) ou à une version périmée, la coupure reste
 * possible ; rouvrir n'est jamais refusé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../services/CacheStore', () => {
  const cache = new Map<string, string>();
  return {
    getCacheStore: () => ({
      get: async (key: string) => cache.get(key) ?? null,
      set: async (key: string, value: string) => { cache.set(key, value); },
      setnx: async (key: string, value: string) => (cache.has(key) ? false : (cache.set(key, value), true)),
      del: async (key: string) => { cache.delete(key); },
    }),
  };
});
jest.mock('../../../../services/PushNotificationService', () => ({
  getPushNotificationService: () => ({ sendToUser: async () => [] }),
}));

import { RELATION_BLOOD_LOCKED_CODE } from '@meeshy/shared/types/relation-person-settings';
import { BLOOD_BUNDLE_VERSION } from '@meeshy/shared/utils/blood-bundle';
import { relationsRoutes } from '../../../../routes/relations';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, buildBringApp, lien, type BringAppOptions } from '../../../helpers/bring-app';

const ACCORD = { ownerId: MOI, otherId: AUTRE, bringBlockedAt: null, bloodBundleAcceptedAt: NOW, bloodBundleVersion: BLOOD_BUNDLE_VERSION };
const SANG: BringAppOptions = { liens: [lien('BLOOD', 'BLOOD')], reglages: [ACCORD] };

const appli = async (options: BringAppOptions) => {
  const app = await buildBringApp(async (a) => { await a.register(relationsRoutes, { prefix: '/api/v1/relations' }); }, options);
  app.prisma.relationFeatureSetting.findMany = jest.fn(async () => [...app.reglages.values()]);
  app.prisma.relationFeatureSetting.findFirst = jest.fn(async (args: { where: { ownerId: string; otherId: string } }) => app.reglages.get(`${args.where.ownerId}:${args.where.otherId}`) ?? null);
  return app;
};

const COUPURES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['battery', { shared: false }],
  ['battery', { receive: 'none' }],
  ['phone-reachability', { shared: false }],
  ['phone-call', { shared: false }],
  ['inactivity', { shared: false }],
  ['fall', { shared: false }],
];

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

describe('#20361 — les réglages par personne d\'un Sang verrouillé', () => {
  it('chaque coupure répond 409 RELATION_BLOOD_LOCKED et la ligne reste intacte', async () => {
    const app = await appli(SANG);
    const reponses = [];
    for (const [route, body] of COUPURES) reponses.push(await app.call('PUT', `/api/v1/relations/${AUTRE}/${route}/settings`, body, MOI));
    await app.close();

    expect(reponses.map((r) => [r.status, r.body.code])).toEqual(COUPURES.map(() => [409, RELATION_BLOOD_LOCKED_CODE]));
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toEqual(ACCORD);
  });

  it('le GET dit lockedByLevel et l\'accord', async () => {
    const app = await appli(SANG);
    const lu = await app.call('GET', `/api/v1/relations/${AUTRE}/battery/settings`, undefined, MOI);
    await app.close();

    expect(lu.body.data).toMatchObject({ userId: AUTRE, shared: true, lockedByLevel: true, bloodBundleAccepted: true });
  });

  it('sans accord au palier, ou à une version périmée, la coupure s\'écrit', async () => {
    const sans = await appli({ liens: [lien('BLOOD', 'BLOOD')] });
    const libre = await sans.call('PUT', `/api/v1/relations/${AUTRE}/battery/settings`, { shared: false }, MOI);
    await sans.close();
    const perime = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [{ ...ACCORD, bloodBundleVersion: '2020-01-01' }] });
    const vieux = await perime.call('PUT', `/api/v1/relations/${AUTRE}/phone-reachability/settings`, { shared: false }, MOI);
    await perime.close();

    expect([libre.status, vieux.status]).toEqual([200, 200]);
    expect(libre.body.data).toMatchObject({ shared: false, lockedByLevel: false, bloodBundleAccepted: false });
  });

  it('rouvrir ne se refuse jamais', async () => {
    const app = await appli(SANG);
    const res = await app.call('PUT', `/api/v1/relations/${AUTRE}/battery/settings`, { shared: true, receive: 'all' }, MOI);
    await app.close();

    expect(res.status).toBe(200);
  });
});
