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

const refreshed: string[] = [];
const recorded = (module: string, names: readonly string[]) => {
  const actual = jest.requireActual(module) as Record<string, unknown>;
  return { ...actual, ...Object.fromEntries(names.map((name) => [name, async (...args: unknown[]) => { refreshed.push(name); return (actual[name] as (...a: unknown[]) => unknown)(...args); }])) };
};
jest.mock('../../../../services/nowPlaying/nowPlayingDeps', () => recorded('../../../../services/nowPlaying/nowPlayingDeps', ['refreshNowPlayingAfter']));
jest.mock('../../../../services/battery/batteryDeps', () => recorded('../../../../services/battery/batteryDeps', ['refreshBatteryAfter']));
jest.mock('../../../../services/sharedLocation/sharedLocationDeps', () => recorded('../../../../services/sharedLocation/sharedLocationDeps', ['refreshSharedLocationAfter']));
jest.mock('../../../../services/inactivityCheck/inactivityDeps', () => recorded('../../../../services/inactivityCheck/inactivityDeps', ['refreshInactivityServedAfter']));

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

describe('#20367 — PUT /relations/:userId/blood-bundle : un Sang déjà scellé accepte la liste (carte de la décision B)', () => {
  const accepter = (app: Awaited<ReturnType<typeof appli>>, body: unknown) => app.call('PUT', `/api/v1/relations/${AUTRE}/blood-bundle`, body, MOI);

  it('au Sang réel, à la version courante : l\'accord s\'écrit daté et versionné, et verrouille', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [{ ownerId: MOI, otherId: AUTRE, bringBlockedAt: null, batteryShared: false }] });
    const res = await accepter(app, { version: BLOOD_BUNDLE_VERSION });
    const coupe = await app.call('PUT', `/api/v1/relations/${AUTRE}/battery/settings`, { shared: false }, MOI);
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId: AUTRE, bloodBundleAccepted: true, version: BLOOD_BUNDLE_VERSION, lockedByLevel: true });
    expect(app.reglages.get(`${MOI}:${AUTRE}`)).toMatchObject({ bloodBundleAcceptedAt: NOW, bloodBundleVersion: BLOOD_BUNDLE_VERSION, batteryShared: false });
    expect(coupe.status).toBe(409);
  });

  it('une redescente pendant l\'écriture : l\'accord ne survit pas, 404, et rien n\'est verrouillé', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')] });
    const ecrire = app.prisma.relationFeatureSetting.upsert;
    app.prisma.relationFeatureSetting.upsert = jest.fn(async (args: unknown) => {
      const ecrit = await ecrire(args);
      await app.prisma.userRelation.updateMany({ where: {}, data: { grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' } });
      return ecrit;
    });
    const res = await accepter(app, { version: BLOOD_BUNDLE_VERSION });
    await app.close();

    expect(res.status).toBe(404);
    expect(app.reglages.get(`${MOI}:${AUTRE}`)?.bloodBundleAcceptedAt ?? null).toBeNull();
    expect(app.reglages.get(`${MOI}:${AUTRE}`)?.bloodBundleVersion ?? null).toBeNull();
  });

  it('sous le Sang : 404 sans rien écrire ; version périmée : 409 RELATION_BLOOD_BUNDLE_OUTDATED ; corps illisible : 400', async () => {
    const proche = await appli({ liens: [lien('CLOSE', 'CLOSE')] });
    const sous = await accepter(proche, { version: BLOOD_BUNDLE_VERSION });
    await proche.close();
    const sang = await appli({ liens: [lien('BLOOD', 'BLOOD')] });
    const vieux = await accepter(sang, { version: '2020-01-01' });
    const illisible = await accepter(sang, { version: 3 });
    await sang.close();

    expect(sous.status).toBe(404);
    expect(proche.reglages.get(`${MOI}:${AUTRE}`)).toBeUndefined();
    expect([vieux.status, vieux.body.code]).toEqual([409, 'RELATION_BLOOD_BUNDLE_OUTDATED']);
    expect(illisible.status).toBe(400);
  });
});

const NAISSANCE = (age: number): Date => new Date(Date.UTC(2026 - age, 0, 1));
const REFUS = { ownerId: MOI, otherId: AUTRE, bringBlockedAt: null, locationShared: false, locationHistoryShared: false, proximityShared: false, listeningTitleShared: false };

describe('constat A (2026-11-23) — un accord pris sous protection de mineur ne lève jamais un refus stocké', () => {
  const accepter = (app: Awaited<ReturnType<typeof appli>>) => app.call('PUT', `/api/v1/relations/${AUTRE}/blood-bundle`, { version: BLOOD_BUNDLE_VERSION }, MOI);

  it('à 14 ans avec quelqu\'un de 30 ans : l\'accord est neutralisé (200, rien d\'écrit) et, cinq ans plus tard, les refus tiennent', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [REFUS], personnes: { [MOI]: { birthDate: NAISSANCE(14) }, [AUTRE]: { birthDate: NAISSANCE(30) } } });
    const res = await accepter(app);
    thawClock();
    freezeClock(new Date('2031-10-31T12:00:00Z'));
    const lu = await app.call('GET', `/api/v1/relations/${AUTRE}/settings`, undefined, MOI);
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ bloodBundleAccepted: false, lockedByLevel: false });
    expect(app.reglages.get(`${MOI}:${AUTRE}`)?.bloodBundleAcceptedAt ?? null).toBeNull();
    expect(lu.body.data).toMatchObject({ locationShared: false, locationHistoryShared: false, proximityShared: false, listeningTitleShared: false, ritualSharesLocked: false });
  });

  it.each([[14, 16], [16, 20], [14, 14]])('à %i et %i ans : à 5 ans d\'écart au plus, l\'accord est pris et le verrou tient entier', async (moi, autre) => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], reglages: [REFUS], personnes: { [MOI]: { birthDate: NAISSANCE(moi) }, [AUTRE]: { birthDate: NAISSANCE(autre) } } });
    const res = await accepter(app);
    const lu = await app.call('GET', `/api/v1/relations/${AUTRE}/settings`, undefined, MOI);
    const coupe = await app.call('PUT', `/api/v1/relations/${AUTRE}/settings`, { locationShared: false }, MOI);
    await app.close();

    expect(res.body.data).toMatchObject({ bloodBundleAccepted: true, lockedByLevel: true });
    expect(lu.body.data).toMatchObject({ locationShared: true, ritualSharesLocked: true });
    expect(coupe.status).toBe(409);
  });

  it('mineur et âge de l\'autre inconnu : la loi du Sang est entière (décision porteur), l\'accord est pris', async () => {
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], personnes: { [MOI]: { birthDate: NAISSANCE(14) } } });
    const res = await accepter(app);
    await app.close();

    expect(res.body.data).toMatchObject({ bloodBundleAccepted: true, lockedByLevel: true });
    expect(app.reglages.get(`${MOI}:${AUTRE}`)?.bloodBundleAcceptedAt).toEqual(NOW);
  });
});

describe('constat D (ré-audit 2026-11-23) — une paire bloquée reçoit EXACTEMENT la réponse d\'un lien absent', () => {
  const MODELES = ['user', 'userRelation', 'friendRequest', 'relationFeatureSetting'] as const;
  const compte = (app: Awaited<ReturnType<typeof appli>>) => {
    let lectures = 0;
    for (const modele of MODELES) {
      const delegue = (app.prisma as unknown as Record<string, Record<string, unknown>>)[modele];
      for (const [nom, fn] of Object.entries(delegue)) {
        if (typeof fn !== 'function') continue;
        delegue[nom] = (...args: unknown[]) => { lectures += 1; return (fn as (...a: unknown[]) => unknown)(...args); };
      }
    }
    return () => lectures;
  };
  const accepter = async (options: BringAppOptions) => {
    const app = await appli(options);
    const lectures = compte(app);
    const res = await app.call('PUT', `/api/v1/relations/${AUTRE}/blood-bundle`, { version: BLOOD_BUNDLE_VERSION }, MOI);
    await app.close();
    return { app, res, lectures: lectures() };
  };

  it.each([
    ['bloqué par l\'autre', { [AUTRE]: { blockedUserIds: [MOI] } }],
    ['bloqué par moi', { [MOI]: { blockedUserIds: [AUTRE] } }],
  ])('%s, resté Sang : même statut, même corps, même nombre de lectures qu\'un lien absent, et rien d\'écrit', async (_cas, personnes) => {
    const absent = await accepter({ liens: [] });
    const rompu = await accepter({ liens: [lien('CLOSE', 'CLOSE')] });
    const bloque = await accepter({ liens: [lien('BLOOD', 'BLOOD')], personnes });

    expect(absent.res.status).toBe(404);
    expect([bloque.res.status, bloque.res.body]).toEqual([absent.res.status, absent.res.body]);
    expect([rompu.res.status, rompu.res.body]).toEqual([absent.res.status, absent.res.body]);
    expect([bloque.lectures, rompu.lectures]).toEqual([absent.lectures, absent.lectures]);
    expect(bloque.app.reglages.get(`${MOI}:${AUTRE}`)?.bloodBundleAcceptedAt ?? null).toBeNull();
  });
});

describe('constat 4 (ré-audit 2026-11-23) — la catégorie d\'écoute par défaut ne trahit pas un blocage', () => {
  it.each([['CLOSE'], ['BLOOD']] as const)('paire bloquée restée %s, sans ligne : GET /settings sert ce qu\'il sert à un lien absent', async (niveau) => {
    const absent = await appli({ liens: [] });
    const sansLien = await absent.call('GET', `/api/v1/relations/${AUTRE}/settings`, undefined, MOI);
    await absent.close();
    const bloque = await appli({ liens: [lien(niveau, niveau)], personnes: { [AUTRE]: { blockedUserIds: [MOI] } } });
    const lu = await bloque.call('GET', `/api/v1/relations/${AUTRE}/settings`, undefined, MOI);
    await bloque.close();

    expect(sansLien.body.data.listeningCategoryShared).toBe(false);
    expect(lu.body).toEqual(sansLien.body);
  });
});

describe('constat 8 — accepter la liste rafraîchit les relais comme tout changement de palier', () => {
  it('écoute, batterie, position partagée et inactivité/chute sont relus après l\'accord', async () => {
    refreshed.length = 0;
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], personnes: { [MOI]: { birthDate: NAISSANCE(30) }, [AUTRE]: { birthDate: NAISSANCE(30) } } });
    const res = await app.call('PUT', `/api/v1/relations/${AUTRE}/blood-bundle`, { version: BLOOD_BUNDLE_VERSION }, MOI);
    await app.close();

    expect(res.body.data.bloodBundleAccepted).toBe(true);
    expect(new Set(refreshed)).toEqual(new Set(['refreshNowPlayingAfter', 'refreshBatteryAfter', 'refreshSharedLocationAfter', 'refreshInactivityServedAfter']));
  });

  it('un accord neutralisé ne relit rien', async () => {
    refreshed.length = 0;
    const app = await appli({ liens: [lien('BLOOD', 'BLOOD')], personnes: { [AUTRE]: { blockedUserIds: [MOI] } } });
    await app.call('PUT', `/api/v1/relations/${AUTRE}/blood-bundle`, { version: BLOOD_BUNDLE_VERSION }, MOI);
    await app.close();

    expect(refreshed).toEqual([]);
  });
});
