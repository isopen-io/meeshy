/**
 * #13926 — le lien entre deux personnes suit la demande d'amitié.
 *
 * - accepter écrit la ligne `UserRelation` FRIEND/FRIEND (depuis Connaissance : aucun
 *   saut de cran, même pour une demande sans niveau, #13933) ;
 * - supprimer une demande ACCEPTÉE (`dismiss`/`cancel` y mènent) est la
 *   rupture : les deux accords reviennent à PUBLIC, sans notification de plus ;
 * - supprimer une demande EN ATTENTE ne touche pas au lien ;
 * - tant qu'une AUTRE demande acceptée relie la paire, l'amitié tient.
 *
 * Le double garde l'ÉTAT (demandes ET liens) : on lit la paire après coup.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

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
const mockFeedCacheDel = jest.fn(async (_key: string) => undefined);
jest.mock('../../../../services/CacheStore', () => ({
  ...(jest.requireActual('../../../../services/CacheStore') as object),
  getCacheStore: () => ({ del: (key: string) => mockFeedCacheDel(key) }),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import { relationStore } from '../../../helpers/user-relation-store';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const FR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTRE_FR_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const PARTIE = { id: AUTRE, username: 'alice', firstName: 'Alice', lastName: 'A', displayName: 'Alice', avatar: null, isOnline: false, lastActiveAt: null };

const demande = (id: string, status: string, senderId = AUTRE, receiverId = MOI) => ({ id, senderId, receiverId, status });

const lien = (grantedByLow: string, grantedByHigh: string) => ({
  id: 'aa0000000000000000000099', userLowId: MOI, userHighId: AUTRE, grantedByLow, grantedByHigh, origin: 'request', transitions: [],
});

async function repondre(params: {
  action: 'accept' | 'dismiss' | 'cancel';
  demandes: ReadonlyArray<Record<string, unknown>>;
  liens?: ReadonlyArray<Record<string, unknown>>;
  notifier?: boolean;
  userRelation?: unknown;
  lectureDemande?: Record<string, unknown>;
  socialEvents?: { invalidateFriendsCache: (userId: string) => void };
}) {
  const store = relationStore({ friendRequests: params.demandes, relations: params.liens ?? [] });
  const notificationService = {
    emitFriendRequestCancelled: jest.fn(),
    retractFriendRequestNotifications: jest.fn(async () => undefined),
    markFriendRequestNotificationsAsRead: jest.fn(async () => undefined),
    createFriendAcceptedNotification: jest.fn(async () => undefined),
    emitFriendRequestAccepted: jest.fn(),
  };
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ id: MOI, blockedUserIds: [], deactivatedAt: null })), findFirst: jest.fn(async () => null) },
    friendRequest: {
      ...store.prisma.friendRequest,
      ...(params.lectureDemande ? { findUnique: jest.fn(async () => params.lectureDemande) } : {}),
      update: jest.fn(async (args: Parameters<typeof store.prisma.friendRequest.update>[0]) => ({ ...(await store.prisma.friendRequest.update(args)), sender: PARTIE, receiver: PARTIE })),
    },
    userRelation: params.userRelation ?? store.prisma.userRelation,
    conversation: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'convid00000000000000001', identifier: 'abc', type: 'direct' })),
    },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('notificationService', (params.notifier === false ? null : notificationService) as never);
  app.decorate('socialEvents', (params.socialEvents ?? null) as never);
  app.decorate('authenticate', async (req: object) => {
    Object.assign(req, {
      user: { userId: MOI },
      authContext: { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } },
    });
  });
  await app.register(directoryFriendRequestsRoutes, { prefix: PREFIXE });
  await app.ready();
  const res = await app.inject({
    method: 'PATCH',
    url: `${PREFIXE}/friend-requests/${FR_ID}`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: params.action }),
  });
  await app.close();
  return { status: res.statusCode, store, notificationService };
}

describe('#13926 — accepter une demande écrit le lien FRIEND/FRIEND', () => {
  it('crée la ligne de la paire, origine « request »', async () => {
    const { status, store } = await repondre({ action: 'accept', demandes: [demande(FR_ID, 'pending')], liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });

    expect(status).toBe(200);
    expect(store.relations()).toHaveLength(1);
    expect(store.relations()[0]).toMatchObject({
      userLowId: MOI, userHighId: AUTRE, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND', origin: 'request',
    });
  });

  it('oublie les amis des DEUX comptes dans les caches du temps réel social et du fil (feed:friends:, 300 s, jamais invalidé avant #13927)', async () => {
    mockFeedCacheDel.mockClear();
    const socialEvents = { invalidateFriendsCache: jest.fn((_userId: string) => undefined) };

    await repondre({ action: 'accept', demandes: [demande(FR_ID, 'pending')], liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')], socialEvents });

    expect(socialEvents.invalidateFriendsCache.mock.calls.map(([id]) => id).sort()).toEqual([MOI, AUTRE].sort());
    expect(mockFeedCacheDel.mock.calls.map(([key]) => key).sort()).toEqual([`feed:friends:${MOI}`, `feed:friends:${AUTRE}`].sort());
  });

  it('ne fait pas échouer l’acceptation quand l’écriture du lien échoue — la demande acceptée reste la vérité de repli', async () => {
    const down = {
      ...relationStore({ relations: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] }).prisma.userRelation,
      create: jest.fn(async () => { throw new Error('mongo down'); }),
      updateMany: jest.fn(async () => { throw new Error('mongo down'); }),
    };

    const { status } = await repondre({ action: 'accept', demandes: [demande(FR_ID, 'pending')], userRelation: down });

    expect(status).toBe(200);
  });
});

describe('#13926 — supprimer une demande ACCEPTÉE rompt le lien, en silence', () => {
  it('ramène les deux accords à PUBLIC quand l’amitié est défaite (dismiss)', async () => {
    const { status, store } = await repondre({
      action: 'dismiss', demandes: [demande(FR_ID, 'accepted')], liens: [lien('CLOSE', 'FRIEND')],
    });

    expect(status).toBe(200);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });

  it('oublie les amis des DEUX comptes dans les caches du temps réel social et du fil (#13927)', async () => {
    mockFeedCacheDel.mockClear();
    const socialEvents = { invalidateFriendsCache: jest.fn((_userId: string) => undefined) };

    await repondre({ action: 'dismiss', demandes: [demande(FR_ID, 'accepted')], liens: [lien('FRIEND', 'FRIEND')], socialEvents });

    expect(socialEvents.invalidateFriendsCache.mock.calls.map(([id]) => id).sort()).toEqual([MOI, AUTRE].sort());
    expect(mockFeedCacheDel.mock.calls.map(([key]) => key).sort()).toEqual([`feed:friends:${MOI}`, `feed:friends:${AUTRE}`].sort());
  });

  it('garde l’amitié quand une AUTRE demande acceptée relie encore la paire', async () => {
    const { store } = await repondre({
      action: 'dismiss',
      demandes: [demande(FR_ID, 'accepted'), demande(AUTRE_FR_ID, 'accepted', MOI, AUTRE)],
      liens: [lien('FRIEND', 'FRIEND')],
    });

    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
  });

  it('ne touche pas au lien quand la demande supprimée n’était qu’EN ATTENTE', async () => {
    const { store } = await repondre({
      action: 'dismiss', demandes: [demande(FR_ID, 'pending')], liens: [lien('FRIEND', 'FRIEND')],
    });

    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
  });

  it('ne notifie rien de plus que le retrait de la notification d’origine : aucune notification, aucun événement de baisse (RG-07)', async () => {
    const { notificationService } = await repondre({
      action: 'dismiss', demandes: [demande(FR_ID, 'accepted')], liens: [lien('FRIEND', 'FRIEND')],
    });

    const appeles = Object.entries(notificationService)
      .filter(([, fn]) => (fn as jest.Mock).mock.calls.length > 0)
      .map(([nom]) => nom)
      .sort();
    expect(appeles).toEqual(['retractFriendRequestNotifications']);
  });
});

describe('[audit #13926] une amitié ne survit jamais à sa demande', () => {
  it('rupture dont l’écriture du lien échoue : la demande reste, ou le lien ne vaut plus FRIEND', async () => {
    const liens = relationStore({ relations: [lien('FRIEND', 'FRIEND')] });
    const panne = { ...liens.prisma.userRelation, updateMany: jest.fn(async () => { throw new Error('mongo down'); }) };

    const { store } = await repondre({ action: 'dismiss', demandes: [demande(FR_ID, 'accepted')], userRelation: panne });

    const demandeSurvit = store.friendRequests().some((r) => r.id === FR_ID && r.status === 'accepted');
    const lienAmi = liens.relations().some((r) => r.grantedByLow !== 'PUBLIC' || r.grantedByHigh !== 'PUBLIC');
    expect(demandeSurvit || !lienAmi).toBe(true);
  });

  it('annulation lue « pending » mais acceptée entre-temps : le statut SUPPRIMÉ gouverne la rupture', async () => {
    const { store } = await repondre({
      action: 'cancel',
      demandes: [demande(FR_ID, 'accepted', MOI, AUTRE)],
      liens: [lien('FRIEND', 'FRIEND')],
      lectureDemande: demande(FR_ID, 'pending', MOI, AUTRE),
    });

    expect(store.friendRequests()).toHaveLength(0);
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });

  it('acceptation lue « pending » mais refusée entre-temps : le refus tient, aucun lien ne naît', async () => {
    const { status, store } = await repondre({
      action: 'accept',
      demandes: [demande(FR_ID, 'rejected')],
      lectureDemande: demande(FR_ID, 'pending'),
      liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')],
    });

    expect(status).toBe(404);
    expect(store.friendRequests()[0]).toMatchObject({ status: 'rejected' });
    expect(store.relations()).toEqual([expect.objectContaining({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' })]);
  });

  it('rupture dont l’écriture du lien échoue : la suppression échoue aussi, rien n’est supprimé', async () => {
    const liens = relationStore({ relations: [lien('FRIEND', 'FRIEND')] });
    const panne = { ...liens.prisma.userRelation, updateMany: jest.fn(async () => { throw new Error('mongo down'); }) };

    const { status, store, notificationService } = await repondre({ action: 'dismiss', demandes: [demande(FR_ID, 'accepted')], userRelation: panne });

    expect(status).toBe(500);
    expect(store.friendRequests()).toHaveLength(1);
    expect(notificationService.emitFriendRequestCancelled).not.toHaveBeenCalled();
  });

  it('accepter grave respondedAt : la date d’acceptation du rattrapage ne repose pas sur updatedAt', async () => {
    const { store } = await repondre({ action: 'accept', demandes: [demande(FR_ID, 'pending')], liens: [lien('ACQUAINTANCE', 'ACQUAINTANCE')] });

    expect(store.friendRequests()[0].respondedAt).toBeInstanceOf(Date);
  });
});
