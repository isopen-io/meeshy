/**
 * #13933 — refus, ignorance, baisse et sortie sont SILENCIEUX (RG-07), le refus et la
 * baisse posent un cool-down de 30 jours (RG-08), et accepter relève au niveau VISÉ.
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
jest.mock('../../../../services/CacheStore', () => ({
  ...(jest.requireActual('../../../../services/CacheStore') as object),
  getCacheStore: () => ({ del: async () => undefined }),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import {
  AUTRE, DAY, MOI, NOW, buildRelationApp, demande, freezeClock, lien, semaineActive, thawClock,
  type AppOptions,
} from '../../../helpers/relation-app';

const PREFIXE = '/api/v1/directory';
const FR = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const LOW = MOI < AUTRE ? MOI : AUTRE;
const HIGH = MOI < AUTRE ? AUTRE : MOI;
const COOLDOWN_JOURS = 30;

const agir = async (as: string, action: string, options: AppOptions) => {
  const app = await buildRelationApp(async (a) => { await a.register(directoryFriendRequestsRoutes, { prefix: PREFIXE }); }, options);
  const res = await app.call('PATCH', `${PREFIXE}/friend-requests/${FR}`, { action }, as);
  const sent = await app.call('GET', `${PREFIXE}/friend-requests?direction=sent&status=pending`, undefined, MOI);
  await app.close();
  return { ...res, app, sent, store: app.store, notifier: app.notifier, emissions: app.emissions };
};

const cooldownOf = (row: Record<string, unknown> | undefined, userId: string): Date | undefined =>
  (userId === LOW ? row?.cooldownLowUntil : row?.cooldownHighUntil) as Date | undefined;

const jours = (n: number) => Array.from({ length: n }, (_, i) => semaineActive(i, LOW, HIGH));

beforeEach(() => freezeClock(NOW));
afterEach(() => thawClock());

const aucuneNotification = (notifier: Record<string, jest.Mock>) =>
  Object.entries(notifier).filter(([nom, fn]) => !nom.startsWith('markFriendRequest') && !nom.startsWith('retract') && fn.mock.calls.length > 0).map(([nom]) => nom);

describe('#13933 — le refus ne se voit pas', () => {
  it('ne notifie rien à l’émetteur : ni notification système, ni événement friend-request:rejected', async () => {
    const { status, notifier, emissions } = await agir(AUTRE, 'reject', { demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'ACQUAINTANCE' })] });

    expect(status).toBe(200);
    expect(notifier.createSystemNotification).not.toHaveBeenCalled();
    expect(notifier.emitFriendRequestRejected).not.toHaveBeenCalled();
    expect(aucuneNotification(notifier)).toEqual([]);
    expect(emissions).toEqual([]);
  });

  it('pose 30 jours de cool-down sur l’ÉMETTEUR, pas sur celui qui refuse', async () => {
    const { store } = await agir(AUTRE, 'reject', { demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'ACQUAINTANCE' })] });

    const row = store.relations()[0];
    expect(cooldownOf(row, MOI)?.getTime()).toBe(NOW.getTime() + COOLDOWN_JOURS * DAY);
    expect(cooldownOf(row, AUTRE)).toBeUndefined();
  });

  it('l’émetteur continue de voir sa demande « en attente » — le statut refusé ne lui est jamais servi', async () => {
    const { sent } = await agir(AUTRE, 'reject', { demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'ACQUAINTANCE' })] });

    expect(sent.status).toBe(200);
    expect(sent.body.data.map((d: { id: string; status: string }) => [d.id, d.status])).toEqual([[FR, 'pending']]);
  });

  it('ignorer une demande EN ATTENTE (dismiss du receveur) est silencieux : aucun friend-request:cancelled vers l’émetteur, cool-down posé', async () => {
    const { status, notifier, emissions, store } = await agir(AUTRE, 'dismiss', { demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'FRIEND' })], liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });

    expect(status).toBe(200);
    expect(notifier.emitFriendRequestCancelled).not.toHaveBeenCalled();
    expect(emissions).toEqual([]);
    expect(cooldownOf(store.relations()[0], MOI)?.getTime()).toBe(NOW.getTime() + COOLDOWN_JOURS * DAY);
  });

  it('annuler soi-même une demande qui avait été refusée ne prévient pas le receveur et ne lève pas le cool-down', async () => {
    const { status, notifier, store } = await agir(MOI, 'cancel', {
      demandes: [demande(FR, 'rejected', MOI, AUTRE, { targetLevel: 'FRIEND' })],
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE', MOI === LOW ? { cooldownLowUntil: new Date(NOW.getTime() + 9 * DAY) } : { cooldownHighUntil: new Date(NOW.getTime() + 9 * DAY) })],
    });

    expect(status).toBe(200);
    expect(notifier.emitFriendRequestCancelled).not.toHaveBeenCalled();
    expect(cooldownOf(store.relations()[0], MOI)?.getTime()).toBe(NOW.getTime() + 9 * DAY);
  });

  it('annuler soi-même une demande EN ATTENTE prévient toujours le receveur (le geste de l’auteur, pas un refus)', async () => {
    const { notifier } = await agir(MOI, 'cancel', { demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'FRIEND' })] });

    expect(notifier.emitFriendRequestCancelled).toHaveBeenCalledTimes(1);
  });
});

describe('#13933 — accepter relève au niveau visé, et seulement s’il tient encore', () => {
  it.each([
    ['ACQUAINTANCE', null, 'ACQUAINTANCE'],
    ['FRIEND', lien('ACQUAINTANCE', 'ACQUAINTANCE'), 'FRIEND'],
    [undefined, lien('ACQUAINTANCE', 'ACQUAINTANCE'), 'FRIEND'],
  ])('une demande %s relève les DEUX accords à %s', async (targetLevel, row, attendu) => {
    const { status, store } = await agir(AUTRE, 'accept', {
      demandes: [demande(FR, 'pending', MOI, AUTRE, targetLevel ? { targetLevel } : {})], liens: row ? [row] : [],
    });

    expect(status).toBe(200);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: attendu, grantedByHigh: attendu });
  });

  it('Ami -> Proche accepté avec la série toujours tenue : les deux accords valent CLOSE', async () => {
    const { status, store } = await agir(AUTRE, 'accept', {
      demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'CLOSE' })], liens: [lien('FRIEND', 'FRIEND')], jours: jours(4),
    });

    expect(status).toBe(200);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
  });

  it('la série s’est brisée entre la demande et la réponse : RELATION_NOT_ELIGIBLE, rien n’est relevé, la demande reste', async () => {
    const { status, body, store } = await agir(AUTRE, 'accept', {
      demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'CLOSE' })], liens: [lien('FRIEND', 'FRIEND')], jours: jours(2),
    });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_NOT_ELIGIBLE');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
    expect(store.friendRequests()[0]).toMatchObject({ status: 'pending' });
  });

  it('le lien est retombé depuis la demande (saut de phase à la réponse) : RELATION_PHASE_SKIP, rien n’est relevé', async () => {
    const { status, body, store } = await agir(AUTRE, 'accept', {
      demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'CLOSE' })], liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')], jours: jours(6),
    });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_PHASE_SKIP');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' });
  });

  it('un Sang ne s’accepte PAS par PATCH : RELATION_RITUAL_REQUIRED, le rituel est le seul chemin', async () => {
    const { status, body, store } = await agir(AUTRE, 'accept', {
      demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'BLOOD' })],
      liens: [lien('CLOSE', 'CLOSE', { levelSince: new Date(NOW.getTime() - 300 * DAY) })], jours: jours(13),
    });

    expect(status).toBe(409);
    expect(body.code).toBe('RELATION_RITUAL_REQUIRED');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
    expect(store.friendRequests()[0]).toMatchObject({ status: 'pending' });
  });

  it('émet relation:level-raised aux DEUX, chacun avec l’identifiant de l’AUTRE', async () => {
    const { emissions } = await agir(AUTRE, 'accept', {
      demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'ACQUAINTANCE' })],
    });

    const raised = emissions.filter((e) => e.event === 'relation:level-raised');
    expect(raised.map((e) => e.room).sort()).toEqual([`user:${MOI}`, `user:${AUTRE}`].sort());
    expect(raised.find((e) => e.room === `user:${MOI}`)?.payload).toMatchObject({ userId: AUTRE, level: 'ACQUAINTANCE' });
    expect(raised.find((e) => e.room === `user:${AUTRE}`)?.payload).toMatchObject({ userId: MOI, level: 'ACQUAINTANCE' });
  });

  it('accepter une vieille demande sur un lien déjà plus haut la solde sans jamais le baisser', async () => {
    const { status, store, emissions } = await agir(AUTRE, 'accept', {
      demandes: [demande(FR, 'pending', MOI, AUTRE, { targetLevel: 'FRIEND' })], liens: [lien('CLOSE', 'CLOSE')],
    });

    expect(status).toBe(200);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE' });
    expect(store.friendRequests()[0]).toMatchObject({ status: 'accepted' });
    expect(emissions.filter((e) => e.event === 'relation:level-raised')).toEqual([]);
  });
});

describe('#13933 — défaire une demande acceptée est une baisse silencieuse', () => {
  it('une demande Proche acceptée, retirée : le lien tombe à Ami, pas à Public, sans notification', async () => {
    const { status, notifier, store } = await agir(MOI, 'dismiss', {
      demandes: [demande(FR, 'accepted', MOI, AUTRE, { targetLevel: 'CLOSE' }), demande('bbbbbbbbbbbbbbbbbbbbbbbb', 'accepted', MOI, AUTRE, { targetLevel: 'FRIEND' })],
      liens: [lien('CLOSE', 'CLOSE')],
    });

    expect(status).toBe(200);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
    expect(Object.entries(notifier).filter(([nom, fn]) => nom.startsWith('create') && fn.mock.calls.length > 0)).toEqual([]);
  });

  it('une demande d’Ami acceptée, retirée : sens historique, le lien revient à Public', async () => {
    const { store } = await agir(MOI, 'dismiss', { demandes: [demande(FR, 'accepted', MOI, AUTRE, {})], liens: [lien('FRIEND', 'FRIEND')] });

    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });

  it('pose le cool-down de 30 jours sur l’AUTRE : celui qui défait ne se le voit pas imposer', async () => {
    const { store } = await agir(MOI, 'dismiss', { demandes: [demande(FR, 'accepted', MOI, AUTRE, { targetLevel: 'CLOSE' })], liens: [lien('CLOSE', 'CLOSE')] });

    const row = store.relations()[0];
    expect(cooldownOf(row, AUTRE)?.getTime()).toBe(NOW.getTime() + COOLDOWN_JOURS * DAY);
    expect(cooldownOf(row, MOI)).toBeUndefined();
  });

  it('émet aucun relation:* — aucun événement de baisse vers le baissé', async () => {
    const { emissions } = await agir(AUTRE, 'dismiss', { demandes: [demande(FR, 'accepted', MOI, AUTRE, { targetLevel: 'CLOSE' })], liens: [lien('CLOSE', 'CLOSE')] });

    expect(emissions.filter((e) => e.event.startsWith('relation:'))).toEqual([]);
  });
});
