/**
 * #13933 — le rituel du Sang : un jeton synchronisé, une fenêtre courte, une double
 * confirmation, un consentement feature par feature — pour tous les âges.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
const cache = new Map<string, { value: string; expiresAt: number }>();
jest.mock('../../../../services/CacheStore', () => ({
  ...(jest.requireActual('../../../../services/CacheStore') as object),
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

import { relationsRoutes } from '../../../../routes/relations';
import {
  AUTRE, DAY, MOI, NOW, TIERS, buildRelationApp, demande, freezeClock, lien, semaineActive, thawClock,
  type AppOptions, type TestApp,
} from '../../../helpers/relation-app';

const LOW = MOI < AUTRE ? MOI : AUTRE;
const HIGH = MOI < AUTRE ? AUTRE : MOI;
const PREFIXE = '/api/v1/relations';
const REQUETE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TOUS = { listeningTitle: true, locationLive: true, locationHistory: true, locationProximity: true };

const pret = (extra: AppOptions = {}): AppOptions => ({
  liens: [lien('CLOSE', 'CLOSE', { levelSince: new Date(NOW.getTime() - 200 * DAY) })],
  demandes: [demande(REQUETE, 'pending', MOI, AUTRE, { targetLevel: 'BLOOD' })],
  jours: Array.from({ length: 13 }, (_, i) => semaineActive(i, LOW, HIGH)),
  ...extra,
});

const appli = (options: AppOptions = pret()): Promise<TestApp> =>
  buildRelationApp(async (a) => { await a.register(relationsRoutes, { prefix: PREFIXE }); }, options);

const rituel = (app: TestApp, as: string, other: string, body: Record<string, unknown>) =>
  app.call('POST', `${PREFIXE}/${other}/ritual`, body, as);
const moi = (app: TestApp, body: Record<string, unknown>) => rituel(app, MOI, AUTRE, body);
const autre = (app: TestApp, body: Record<string, unknown>) => rituel(app, AUTRE, MOI, body);
const avance = (ms: number) => jest.setSystemTime(new Date(Date.now() + ms));

async function jusquAuxDeuxHolds(app: TestApp) {
  const a = await moi(app, { phase: 'start' });
  const b = await autre(app, { phase: 'start' });
  const token = a.body.data.token as string;
  await moi(app, { phase: 'hold', token });
  await autre(app, { phase: 'hold', token });
  return { token, a, b };
}

beforeEach(() => { cache.clear(); freezeClock(NOW); });
afterEach(() => thawClock());

describe('#13933 — le jeton : démarrer et rejoindre', () => {
  it('start rend un jeton, sa fenêtre et prévient l’AUTRE par relation:ritual-started — et seulement lui', async () => {
    const app = await appli();
    const res = await moi(app, { phase: 'start' });
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ token: expect.any(String), holdWindowMs: expect.any(Number), expiresAt: expect.any(String) });
    expect(res.body.data.token.length).toBeGreaterThanOrEqual(16);
    const started = app.emissions.filter((e) => e.event === 'relation:ritual-started');
    expect(started.map((e) => e.room)).toEqual([`user:${AUTRE}`]);
    expect(started[0].payload).toMatchObject({ token: res.body.data.token, userId: MOI });
  });

  it('l’autre qui démarre à son tour REJOINT le même jeton', async () => {
    const app = await appli();
    const a = await moi(app, { phase: 'start' });
    const b = await autre(app, { phase: 'start' });
    await app.close();

    expect(b.status).toBe(200);
    expect(b.body.data.token).toBe(a.body.data.token);
  });

  it('un jeton ne vit que 60 secondes : passé ce délai, plus rien ne se tient', async () => {
    const app = await appli();
    const { token } = (await moi(app, { phase: 'start' })).body.data;
    avance(61_000);
    const res = await moi(app, { phase: 'hold', token });
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RELATION_RITUAL_INVALID');
  });

  it.each(['hold', 'confirm'])('%s sans start préalable : RELATION_RITUAL_INVALID', async (phase) => {
    const app = await appli();
    const res = await moi(app, { phase, token: 'x'.repeat(24), consents: TOUS });
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RELATION_RITUAL_INVALID');
  });

  it('un jeton faux est refusé, et ne défait pas le rituel en cours', async () => {
    const app = await appli();
    const { token } = (await moi(app, { phase: 'start' })).body.data;
    const faux = await moi(app, { phase: 'hold', token: 'y'.repeat(24) });
    const bon = await moi(app, { phase: 'hold', token });
    await app.close();

    expect(faux.status).toBe(409);
    expect(faux.body.code).toBe('RELATION_RITUAL_INVALID');
    expect(bon.status).toBe(200);
  });
});

describe('#13933 — ce qui doit tenir avant d’ouvrir un rituel', () => {
  it('sans demande de Sang EN ATTENTE entre les deux : RELATION_RITUAL_NO_REQUEST', async () => {
    const app = await appli(pret({ demandes: [] }));
    const res = await moi(app, { phase: 'start' });
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RELATION_RITUAL_NO_REQUEST');
  });

  it('une demande de Sang refusée ne rouvre pas de rituel', async () => {
    const app = await appli(pret({ demandes: [demande(REQUETE, 'rejected', MOI, AUTRE, { targetLevel: 'BLOOD' })] }));
    const res = await autre(app, { phase: 'start' });
    await app.close();

    expect(res.body.code).toBe('RELATION_RITUAL_NO_REQUEST');
  });

  it('un tiers ne peut ni démarrer ni rejoindre le rituel d’une paire dont il n’est pas', async () => {
    const app = await appli();
    const res = await rituel(app, TIERS, AUTRE, { phase: 'start' });
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RELATION_RITUAL_NO_REQUEST');
  });

  it('le lien n’est plus Proche : RELATION_PHASE_SKIP', async () => {
    const app = await appli(pret({ liens: [lien('FRIEND', 'FRIEND')] }));
    const res = await moi(app, { phase: 'start' });
    await app.close();

    expect(res.body.code).toBe('RELATION_PHASE_SKIP');
  });

  it('la série n’est plus tenue : RELATION_NOT_ELIGIBLE', async () => {
    const app = await appli(pret({ jours: Array.from({ length: 5 }, (_, i) => semaineActive(i, LOW, HIGH)) }));
    const res = await moi(app, { phase: 'start' });
    await app.close();

    expect(res.body.code).toBe('RELATION_NOT_ELIGIBLE');
  });

  it('une personne bloquée n’ouvre rien', async () => {
    const app = await appli(pret({ bloques: [MOI] }));
    const res = await moi(app, { phase: 'start' });
    await app.close();

    expect(res.status).toBe(409);
  });
});

describe('#13933 — tenir l’écran ensemble', () => {
  it('hold prévient l’autre par relation:ritual-progress', async () => {
    const app = await appli();
    const { token } = (await moi(app, { phase: 'start' })).body.data;
    await moi(app, { phase: 'hold', token });
    await app.close();

    const progress = app.emissions.filter((e) => e.event === 'relation:ritual-progress');
    expect(progress.map((e) => e.room)).toEqual([`user:${AUTRE}`]);
    expect(progress[0].payload).toMatchObject({ token, userId: MOI, stage: 'held' });
  });

  it('confirmer quand l’AUTRE n’a pas tenu l’écran : RELATION_RITUAL_NOT_SYNCHRONISED, rien n’est enregistré', async () => {
    const app = await appli();
    const { token } = (await moi(app, { phase: 'start' })).body.data;
    await moi(app, { phase: 'hold', token });
    const res = await moi(app, { phase: 'confirm', token, consents: TOUS });
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RELATION_RITUAL_NOT_SYNCHRONISED');
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
  });

  it('l’autre a lâché (son hold a plus de 15 s) : RELATION_RITUAL_LAPSED, le rituel est abandonné, rien n’est enregistré', async () => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    avance(16_000);
    await moi(app, { phase: 'hold', token });
    const res = await moi(app, { phase: 'confirm', token, consents: TOUS });
    const apres = await autre(app, { phase: 'hold', token });
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RELATION_RITUAL_LAPSED');
    expect(apres.body.code).toBe('RELATION_RITUAL_INVALID');
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
    expect(app.store.friendRequests()[0]).toMatchObject({ status: 'pending' });
    expect(app.consents).toEqual([]);
  });
});

describe('#13933 — la double confirmation et le consentement feature par feature', () => {
  it('une seule confirmation n’élève rien : le lien reste Proche', async () => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    const res = await moi(app, { phase: 'confirm', token, consents: TOUS });
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ completed: false });
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
    expect(app.consents).toEqual([]);
  });

  it('les DEUX confirment : demande acceptée, deux accords à Sang, consentements écrits pour chacun', async () => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    await moi(app, { phase: 'confirm', token, consents: TOUS });
    const fin = await autre(app, { phase: 'confirm', token, consents: { ...TOUS, locationLive: false } });
    await app.close();

    expect(fin.status).toBe(200);
    expect(fin.body.data).toMatchObject({ completed: true, level: 'BLOOD' });
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'BLOOD', grantedByHigh: 'BLOOD' });
    expect(app.store.friendRequests()[0]).toMatchObject({ status: 'accepted' });
    expect(app.consents).toHaveLength(2);
    expect(app.consents.find((c) => c.ownerId === MOI)).toMatchObject({ otherId: AUTRE, listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true });
    expect(app.consents.find((c) => c.ownerId === AUTRE)).toMatchObject({ otherId: MOI, locationShared: false, proximityShared: true });
  });

  it('émet relation:ritual-completed et relation:level-raised aux DEUX, avec l’identifiant de l’autre', async () => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    await moi(app, { phase: 'confirm', token, consents: TOUS });
    await autre(app, { phase: 'confirm', token, consents: TOUS });
    await app.close();

    for (const event of ['relation:ritual-completed', 'relation:level-raised']) {
      const sent = app.emissions.filter((e) => e.event === event);
      expect(sent.map((e) => e.room).sort()).toEqual([`user:${MOI}`, `user:${AUTRE}`].sort());
      expect(sent.find((e) => e.room === `user:${MOI}`)?.payload).toMatchObject({ userId: AUTRE, level: 'BLOOD' });
      expect(sent.find((e) => e.room === `user:${AUTRE}`)?.payload).toMatchObject({ userId: MOI, level: 'BLOOD' });
    }
  });

  it('refuser un partage ne bloque pas le Sang : il est enregistré à faux, par feature', async () => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    const refus = { listeningTitle: false, locationLive: false, locationHistory: false, locationProximity: false };
    await moi(app, { phase: 'confirm', token, consents: refus });
    await autre(app, { phase: 'confirm', token, consents: refus });
    await app.close();

    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'BLOOD', grantedByHigh: 'BLOOD' });
    expect(app.consents.every((c) => c.listeningTitleShared === false && c.locationShared === false && c.locationHistoryShared === false && c.proximityShared === false)).toBe(true);
  });

  it.each([
    ['sans consentements', undefined],
    ['un partage manquant', { listeningTitle: true, locationLive: true, locationHistory: true }],
    ['un partage qui n’est pas un booléen', { ...TOUS, locationLive: 'oui' }],
  ])('%s : 400 RELATION_CONSENT_REQUIRED, rien n’est confirmé', async (_nom, consents) => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    const res = await moi(app, { phase: 'confirm', token, ...(consents === undefined ? {} : { consents }) });
    const ensuite = await autre(app, { phase: 'confirm', token, consents: TOUS });
    await app.close();

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RELATION_CONSENT_REQUIRED');
    expect(ensuite.body.data).toMatchObject({ completed: false });
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
  });

  it('un mineur déclaré suit le MÊME rituel et le même consentement : aucune règle d’âge (décision 2026-10-31)', async () => {
    const app = await appli(pret({ naissances: { [MOI]: new Date('2012-03-04'), [AUTRE]: new Date('1988-01-01') } }));
    const { token } = await jusquAuxDeuxHolds(app);
    const sans = await moi(app, { phase: 'confirm', token });
    await moi(app, { phase: 'confirm', token, consents: TOUS });
    const fin = await autre(app, { phase: 'confirm', token, consents: TOUS });
    await app.close();

    expect(sans.body.code).toBe('RELATION_CONSENT_REQUIRED');
    expect(fin.body.data).toMatchObject({ completed: true, level: 'BLOOD' });
  });

  it('confirmer deux fois de suite n’achève pas le rituel à soi seul', async () => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    await moi(app, { phase: 'confirm', token, consents: TOUS });
    const encore = await moi(app, { phase: 'confirm', token, consents: TOUS });
    await app.close();

    expect(encore.body.data).toMatchObject({ completed: false });
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
  });

  it('un rituel achevé ne se rejoue pas : le jeton est consommé', async () => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    await moi(app, { phase: 'confirm', token, consents: TOUS });
    await autre(app, { phase: 'confirm', token, consents: TOUS });
    const encore = await moi(app, { phase: 'hold', token });
    await app.close();

    expect(encore.body.code).toBe('RELATION_RITUAL_INVALID');
  });

  it('ne notifie personne par une notification persistée : le rituel parle par ses événements', async () => {
    const app = await appli();
    const { token } = await jusquAuxDeuxHolds(app);
    await moi(app, { phase: 'confirm', token, consents: TOUS });
    await autre(app, { phase: 'confirm', token, consents: TOUS });
    await app.close();

    expect(app.notifier.createSystemNotification).not.toHaveBeenCalled();
    expect(app.notifier.createFriendAcceptedNotification).not.toHaveBeenCalled();
  });
});
