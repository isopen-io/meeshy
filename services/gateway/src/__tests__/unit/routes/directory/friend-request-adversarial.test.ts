/**
 * #13933 — témoins ROUGES de l'audit adversarial du lot rel-demandes.
 *
 * Chaque témoin décrit un comportement que le lot promet (refus silencieux, aucun saut
 * de phase, le blocage coupe) et qu'un chemin voisin contredit. Ils lisent l'ÉTAT obtenu
 * et la réponse servie, jamais le texte du code.
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
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => unknown }) => args.op()),
}));
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: jest.fn(async () => undefined) })),
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
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import { relationsRoutes } from '../../../../routes/relations';
import { relationsLevelRoutes } from '../../../../routes/relations/level';
import {
  AUTRE, DAY, MOI, NOW, buildRelationApp, demande, freezeClock, lien, semaineActive, thawClock,
  type AppOptions, type TestApp,
} from '../../../helpers/relation-app';

const DIR = '/api/v1/directory';
const REL = '/api/v1/relations';
const FR = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const LOW = MOI < AUTRE ? MOI : AUTRE;
const HIGH = MOI < AUTRE ? AUTRE : MOI;
const enCooldown = (jours: number) =>
  MOI === LOW
    ? { cooldownLowUntil: new Date(NOW.getTime() + jours * DAY) }
    : { cooldownHighUntil: new Date(NOW.getTime() + jours * DAY) };

const appli = (options: AppOptions): Promise<TestApp> =>
  buildRelationApp(async (a) => {
    await a.register(directoryFriendRequestsRoutes, { prefix: DIR });
    await a.register(relationsRoutes, { prefix: REL });
    await a.register(relationsLevelRoutes, { prefix: REL });
  }, options);

beforeEach(() => { cache.clear(); freezeClock(NOW); });
afterEach(() => thawClock());

describe('audit #13933 — un refus ne se lit nulle part chez l’émetteur', () => {
  it('la demande refusée servie « en attente » ne trahit pas la réponse par son updatedAt (Prisma @updatedAt la déplace au refus)', async () => {
    const creee = new Date(NOW.getTime() - 3 * DAY);
    const app = await appli({
      demandes: [demande(FR, 'rejected', MOI, AUTRE, { targetLevel: 'FRIEND', createdAt: creee, updatedAt: NOW, respondedAt: NOW })],
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', enCooldown(30))],
    });
    const sent = await app.call('GET', `${DIR}/friend-requests?direction=sent&status=pending`, undefined, MOI);
    await app.close();

    const servie = sent.body.data[0];
    expect(servie.status).toBe('pending');
    expect(servie.respondedAt ?? null).toBeNull();
    expect(servie.updatedAt).toBe(servie.createdAt);
  });

  it('redemander pendant qu’une demande « en attente » a été refusée répond EXACTEMENT comme si elle attendait encore', async () => {
    const envoi = { receiverId: AUTRE, targetLevel: 'FRIEND' };
    const enAttente = await appli({
      demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'FRIEND' })],
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')],
    });
    const a = await enAttente.call('POST', `${DIR}/friend-requests`, envoi, MOI);
    await enAttente.close();

    const refusee = await appli({
      demandes: [demande(FR, 'rejected', MOI, AUTRE, { targetLevel: 'FRIEND' })],
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', enCooldown(30))],
    });
    const b = await refusee.call('POST', `${DIR}/friend-requests`, envoi, MOI);
    await refusee.close();

    expect([b.status, b.body?.code, b.body?.error]).toEqual([a.status, a.body?.code, a.body?.error]);
  });

  it('ouvrir le rituel sur une demande de Sang refusée répond comme sur une demande qui attend encore', async () => {
    const pret = (status: string): AppOptions => ({
      liens: [lien('CLOSE', 'CLOSE', { levelSince: new Date(NOW.getTime() - 200 * DAY) })],
      demandes: [demande(FR, status, MOI, AUTRE, { targetLevel: 'BLOOD' })],
      jours: Array.from({ length: 13 }, (_, i) => semaineActive(i, LOW, HIGH)),
    });
    const attend = await appli(pret('pending'));
    const a = await attend.call('POST', `${REL}/${AUTRE}/ritual`, { phase: 'start' }, MOI);
    await attend.close();
    cache.clear();

    const refuse = await appli(pret('rejected'));
    const b = await refuse.call('POST', `${REL}/${AUTRE}/ritual`, { phase: 'start' }, MOI);
    await refuse.close();

    expect(b.status).toBe(a.status);
    expect(b.body?.code).toBe(a.body?.code);
  });

  it('le rituel ouvert sur une demande de Sang refusée est MUET : celui qui a refusé n’en reçoit rien, et le jeton n’aboutit jamais', async () => {
    const app = await appli({
      liens: [lien('CLOSE', 'CLOSE', { levelSince: new Date(NOW.getTime() - 200 * DAY) })],
      demandes: [demande(FR, 'rejected', MOI, AUTRE, { targetLevel: 'BLOOD' })],
      jours: Array.from({ length: 13 }, (_, i) => semaineActive(i, LOW, HIGH)),
    });
    const ouvert = await app.call('POST', `${REL}/${AUTRE}/ritual`, { phase: 'start' }, MOI);
    const tenu = await app.call('POST', `${REL}/${AUTRE}/ritual`, { phase: 'hold', token: ouvert.body.data.token }, MOI);
    const parLui = await app.call('POST', `${REL}/${MOI}/ritual`, { phase: 'start' }, AUTRE);
    await app.close();

    expect([ouvert.status, tenu.status]).toEqual([200, 200]);
    expect(parLui.body?.code).toBe('RELATION_RITUAL_NO_REQUEST');
    expect(app.emissions.filter((e) => e.event.startsWith('relation:'))).toEqual([]);
    expect(app.store.friendRequests()).toEqual([expect.objectContaining({ id: FR, status: 'rejected' })]);
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
  });

  it('le receveur qui écarte de sa liste une demande qu’il a refusée ne la fait pas disparaître chez l’émetteur', async () => {
    const app = await appli({
      demandes: [demande(FR, 'rejected', MOI, AUTRE, { targetLevel: 'FRIEND' })],
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', enCooldown(30))],
    });
    const avant = await app.call('GET', `${DIR}/friend-requests?direction=sent&status=pending`, undefined, MOI);
    const ecarte = await app.call('PATCH', `${DIR}/friend-requests/${FR}`, { action: 'dismiss' }, AUTRE);
    const apres = await app.call('GET', `${DIR}/friend-requests?direction=sent&status=pending`, undefined, MOI);
    await app.close();

    expect(avant.body.data.map((d: { id: string }) => d.id)).toEqual([FR]);
    expect(ecarte.status).toBe(200);
    expect(apres.body.data.map((d: { id: string }) => d.id)).toEqual([FR]);
  });
});

describe('audit #13933 — une Connaissance acceptée ne devient jamais Ami', () => {
  it('l’échec d’une étape APRÈS l’écriture du lien (notification) ne laisse pas une demande ACQUAINTANCE « accepted » que la loi lit FRIEND', async () => {
    const app = await appli({ demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'ACQUAINTANCE' })] });
    app.notifier.createFriendAcceptedNotification.mockImplementationOnce(async () => { throw new Error('push indisponible'); });

    await app.call('PATCH', `${DIR}/friend-requests/${FR}`, { action: 'accept' }, AUTRE);
    const lu = await app.call('GET', `${REL}/${AUTRE}`, undefined, MOI);
    await app.close();

    expect(lu.body.data.effectiveLevel).not.toBe('FRIEND');
    expect(app.store.friendRequests().filter((d) => d.status === 'accepted' && d.targetLevel === 'ACQUAINTANCE')).toEqual([]);
  });
});

describe('audit #13933 — aucun saut de phase, aucune exception (D-5)', () => {
  it('une demande en attente SANS niveau (antérieure aux cercles) entre deux inconnus ne fait pas sauter Public -> Ami à l’acceptation', async () => {
    const app = await appli({ demandes: [demande(FR, 'pending', MOI, AUTRE, {})] });
    const res = await app.call('PATCH', `${DIR}/friend-requests/${FR}`, { action: 'accept' }, AUTRE);
    const lu = await app.call('GET', `${REL}/${AUTRE}`, undefined, MOI);
    await app.close();

    expect(lu.body.data.effectiveLevel).not.toBe('FRIEND');
    expect(res.status).toBe(409);
  });
});

describe('audit #13933 — le blocage coupe l’acceptation', () => {
  it('l’émetteur qui a bloqué le receveur après sa demande n’est ni relevé ni notifié quand l’autre accepte', async () => {
    const app = await appli({
      demandes: [demande(FR, 'pending', AUTRE, MOI, { targetLevel: 'FRIEND' })],
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')],
      bloques: [MOI],
    });
    const res = await app.call('PATCH', `${DIR}/friend-requests/${FR}`, { action: 'accept' }, MOI);
    await app.close();

    expect(res.status).not.toBe(200);
    expect(app.store.relations()[0]).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' });
    expect(app.notifier.createFriendAcceptedNotification).not.toHaveBeenCalled();
    expect(app.emissions.filter((e) => e.event === 'relation:level-raised')).toEqual([]);
  });
});
