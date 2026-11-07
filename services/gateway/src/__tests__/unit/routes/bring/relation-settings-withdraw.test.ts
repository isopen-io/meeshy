/**
 * #14401 (écart E3 de #13942, RGPD art. 7(3)) : un partage consenti au rituel du
 * Sang se RETIRE par le réglage par personne, un par un, avec effet immédiat, sans
 * quitter le Sang. Il ne s'y accorde jamais. Les doubles lisent l'ÉTAT stocké.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const cache = new Map<string, { value: string; expiresAt: number }>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async (key: string) => {
      const hit = cache.get(key);
      return hit && hit.expiresAt > Date.now() ? hit.value : null;
    },
    set: async (key: string, value: string, ttl = 3600) => { cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 }); },
    setnx: async (key: string, value: string, ttl = 3600) => {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) return false;
      cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return true;
    },
    del: async (key: string) => { cache.delete(key); },
  }),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => Promise<unknown> }) => args.op()),
}));

const pushes: Array<Record<string, any>> = [];
jest.mock('../../../../services/PushNotificationService', () => ({
  getPushNotificationService: () => ({
    sendToUser: async (options: Record<string, unknown>) => { pushes.push(options); return []; },
  }),
}));

import { bringRoutes } from '../../../../routes/bring';
import { relationsRoutes } from '../../../../routes/relations';
import { freezeClock, thawClock } from '../../../helpers/relation-app';
import { AUTRE, MOI, NOW, TIERS, buildBringApp, lien, type BringAppOptions, type BringTestApp } from '../../../helpers/bring-app';

const appli = (options: BringAppOptions = {}): Promise<BringTestApp> =>
  buildBringApp(async (a) => {
    await a.register(bringRoutes, { prefix: '/api/v1/bring' });
    await a.register(relationsRoutes, { prefix: '/api/v1/relations' });
  }, options);

const TOUT_PARTAGE = { listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true };
const AU_RITUEL = new Date('2026-10-01T00:00:00.000Z');
const sang = (extra: Record<string, unknown> = {}): BringAppOptions => ({
  liens: [lien('BLOOD', 'BLOOD')],
  reglages: [
    { ownerId: MOI, otherId: AUTRE, bringBlockedAt: null, consentedAt: AU_RITUEL, ...TOUT_PARTAGE, ...extra },
    { ownerId: AUTRE, otherId: MOI, bringBlockedAt: null, consentedAt: AU_RITUEL, ...TOUT_PARTAGE },
  ],
});
const regler = (app: BringTestApp, body: unknown, other = AUTRE, as = MOI) => app.call('PUT', `/api/v1/relations/${other}/settings`, body, as);
const lire = (app: BringTestApp, other = AUTRE, as = MOI) => app.call('GET', `/api/v1/relations/${other}/settings`, undefined, as);

beforeEach(() => { cache.clear(); freezeClock(NOW); });
afterEach(() => thawClock());

describe('#14401 — chaque partage consenti au rituel se retire en un geste, sans quitter le Sang', () => {
  it('je lis ce que j’ai consenti à l’autre, à côté du blocage du Bring', async () => {
    const app = await appli(sang());
    const res = await lire(app);
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId: AUTRE, bringBlocked: false, talkieBlocked: false, listeningCategoryShared: false, ...TOUT_PARTAGE });
  });

  it('retirer UN partage écrit tout de suite MA ligne, et laisse les autres partages, le lien et le consentement de l’autre', async () => {
    const app = await appli(sang());
    const res = await regler(app, { locationShared: false });
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId: AUTRE, bringBlocked: false, talkieBlocked: false, listeningCategoryShared: false, ...TOUT_PARTAGE, locationShared: false });
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ ...TOUT_PARTAGE, locationShared: false, consentedAt: AU_RITUEL });
    expect(app.reglages.get(`${AUTRE}:${MOI}`)).toMatchObject(TOUT_PARTAGE);
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'BLOOD', grantedByHigh: 'BLOOD' });
  });

  it('les quatre se retirent d’un seul geste', async () => {
    const app = await appli(sang());
    const res = await regler(app, { listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false });
    await app.close();

    expect(res.body.data).toEqual({ userId: AUTRE, bringBlocked: false, talkieBlocked: false, listeningCategoryShared: false, listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false });
  });

  it('un partage ne s’accorde jamais hors du rituel : 400, et rien ne change', async () => {
    const app = await appli(sang({ locationShared: false }));
    const res = await regler(app, { locationShared: true });
    await app.close();

    expect(res.status).toBe(400);
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ locationShared: false });
  });

  it('retirer se fait aussi quand le lien est tombé, et ne crée de ligne pour personne', async () => {
    const tombe = await appli({ ...sang(), liens: [lien('PUBLIC', 'PUBLIC')] });
    const retrait = await regler(tombe, { proximityShared: false });
    await tombe.close();
    const inconnu = await appli();
    const rien = await regler(inconnu, { proximityShared: false }, TIERS);
    await inconnu.close();

    expect(retrait.status).toBe(200);
    expect(tombe.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ proximityShared: false });
    expect(rien.status).toBe(200);
    expect(rien.body.data).toEqual({ userId: TIERS, bringBlocked: false, talkieBlocked: false, listeningCategoryShared: false, listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false });
    expect(inconnu.reglages.size).toBe(0);
  });

  it('audit #14535 (1) — lien tombé, corps mixte { bringBlocked: false, locationShared: false } : le retrait passe', async () => {
    const app = await appli({ ...sang(), liens: [lien('PUBLIC', 'PUBLIC')] });
    const res = await regler(app, { bringBlocked: false, locationShared: false });
    await app.close();

    expect({ status: res.status, locationShared: app.reglages.get(`${MOI}:${AUTRE}`)?.locationShared }).toEqual({ status: 200, locationShared: false });
  });

  it('audit #14535 (1) — lien tombé, { bringBlocked: true, locationShared: false } : le retrait est écrit, le blocage rend 404', async () => {
    const app = await appli({ ...sang(), liens: [lien('PUBLIC', 'PUBLIC')] });
    const res = await regler(app, { bringBlocked: true, locationShared: false });
    await app.close();

    expect(res.status).toBe(404);
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ locationShared: false, bringBlockedAt: null });
  });

  it('audit #14535 (1) — lien vivant, corps mixte : blocage et retrait partent en UNE écriture', async () => {
    const app = await appli(sang());
    const writes = () => app.prisma.relationFeatureSetting.upsert.mock.calls.length + app.prisma.relationFeatureSetting.updateMany.mock.calls.length;
    const res = await regler(app, { bringBlocked: true, proximityShared: false });
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ bringBlocked: true, proximityShared: false, locationShared: true });
    expect(writes()).toBe(1);
  });

  it('audit #14535 (8) — retirer sur une ligne déjà bloquée garde le blocage du Bring', async () => {
    const BLOQUE = new Date('2026-10-15T00:00:00.000Z');
    const app = await appli(sang({ bringBlockedAt: BLOQUE }));
    const res = await regler(app, { locationHistoryShared: false });
    await app.close();

    expect(res.body.data).toMatchObject({ bringBlocked: true, locationHistoryShared: false });
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ bringBlockedAt: BLOQUE });
  });

  it('audit #14535 (3) — le retrait est daté, partage par partage ; un partage déjà éteint garde sa date', async () => {
    const AVANT = new Date('2026-10-20T00:00:00.000Z');
    const app = await appli(sang({ proximityShared: false, proximityWithdrawnAt: AVANT }));
    await regler(app, { locationShared: false, proximityShared: false });
    await app.close();

    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({
      locationShared: false, locationWithdrawnAt: NOW, proximityWithdrawnAt: AVANT, consentedAt: AU_RITUEL,
    });
    expect(app.reglages.get(`${MOI}:${AUTRE}`)?.listeningTitleWithdrawnAt ?? null).toBeNull();
  });

  it.each([['"false"', 'false'], ['null', null], ['0', 0], ['true', true]])('audit #14535 (4) — la route refuse %s pour un partage, comme le contrat partagé', async (_label, value) => {
    const app = await appli(sang());
    const res = await regler(app, { proximityShared: value });
    await app.close();

    expect(res.status).toBe(400);
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ proximityShared: true });
  });
});
