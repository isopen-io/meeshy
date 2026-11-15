/**
 * #9623 — un REJEU d'idempotence (même `X-Client-Mutation-Id`) d'une demande
 * d'ami ne RENOTIFIE pas, ne REPOUSSE pas, et ne rallonge pas le cool-down.
 *
 * `withMutationLog` rend le résultat sans dire s'il vient d'être PRODUIT ou
 * RELU. Les deux routes de demande d'ami posaient leurs effets APRÈS lui, sans
 * condition : le rejeu du même cmid — ce que fait l'outbox hors ligne d'iOS à
 * chaque reconnexion — créait une SECONDE ligne `Notification`, un second
 * toast et une seconde bannière push pour un geste unique. `createNotification`
 * n'a ni clé d'idempotence ni déduplication : rien en aval ne rattrape.
 *
 * Le REFUS portait un effet pire qu'un doublon : `startCooldown` écrit `until`
 * en ÉCRASANT, calculé depuis l'horloge du REJEU. Un drain qui arrive N heures
 * plus tard repoussait de N heures les 30 jours pendant lesquels l'émetteur ne
 * peut pas redemander — une punition rallongée par l'aléa du réseau.
 *
 * Le VRAI `withMutationLog` et le VRAI `MutationLogService` sur un journal en
 * mémoire qui tient son index unique : le verdict « rejoué » est celui de la
 * production. Mocker le helper rendrait cette suite verte que les gardes
 * existent ou non — c'est ce qui a laissé la dette vivre (cf.
 * `posts-create-replay-credit.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

/** Le cool-down est observé à la SOURCE : c'est son écriture qui porte l'écrasement. */
const mockStartCooldown = jest.fn<any>().mockResolvedValue(undefined);
/** Le crédit d'engagement est tir-et-oublie — observé pour ne pas le gater par accident. */
const mockRecordActivity = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/relations/userRelationWriter', () => ({
  ...(jest.requireActual('../../../../services/relations/userRelationWriter') as object),
  startCooldown: (...args: any[]) => mockStartCooldown(...args),
  recordLevel: jest.fn<any>().mockResolvedValue('created'),
}));
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: (...args: any[]) => mockRecordActivity(...args),
  })),
}));
jest.mock('../../../../services/relations/relationCaches', () => ({
  forgetFriends: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../../socketio/relationEvents', () => ({
  emitRelationLevelRaised: jest.fn(),
  relationIoOf: jest.fn(() => null),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';
import { inMemoryMutationLog } from '../../../helpers/inMemoryMutationLog';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const FR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CMID = 'cmid_550e8400-e29b-41d4-a716-446655449613';

const PARTIE = {
  id: AUTRE, username: 'alice', firstName: 'Alice', lastName: 'A', displayName: 'Alice', avatar: null,
  isOnline: false, lastActiveAt: null,
};

type Options = { readonly aRecevoir?: boolean };

/**
 * Chaque `create` rend un id DISTINCT : sans cela un doublon de ligne et un
 * rejeu correct se ressembleraient, et le témoin ne pourrait pas tomber.
 */
function prismaDouble(opts: Options = {}) {
  let creees = 0;
  /**
   * Les lignes créées sont RETENUES, et `findUnique` honore l'id qu'on lui
   * passe : c'est par cette lecture que `onDuplicate` resert le résultat
   * d'origine. Un double qui rend la même ligne quel que soit l'id laisserait
   * passer un rejeu qui resert la MAUVAISE demande.
   */
  const creeesParId = new Map<string, Record<string, unknown>>();
  return {
    user: {
      findMany: jest.fn<any>(async () => []),
      findFirst: jest.fn<any>(async () => null),
      findUnique: jest.fn<any>(async (args: any) => {
        if (args?.where?.id === MOI) return { id: MOI, blockedUserIds: [], displayName: 'Moi', username: 'moi', deactivatedAt: null };
        return { id: AUTRE, deactivatedAt: null, blockedUserIds: [], displayName: 'Alice', username: 'alice' };
      }),
    },
    friendRequest: {
      findFirst: jest.fn<any>(async () => null),
      findMany: jest.fn<any>(async () => []),
      findUnique: jest.fn<any>(async (args: any) => {
        const retenue = creeesParId.get(args?.where?.id);
        if (retenue) return args?.select ? retenue : { ...retenue, sender: PARTIE, receiver: PARTIE };
        const ligne = {
          id: FR_ID, senderId: AUTRE, receiverId: MOI, status: 'pending',
          targetLevel: 'FRIEND', message: null, createdAt: new Date('2026-11-01T10:00:00.000Z'),
          updatedAt: new Date('2026-11-01T10:00:00.000Z'), respondedAt: null,
        };
        return args?.select ? ligne : { ...ligne, sender: PARTIE, receiver: PARTIE };
      }),
      create: jest.fn<any>(async () => {
        creees += 1;
        const ligne = {
          id: `aaaaaaaaaaaaaaaaaaaa00${String(creees).padStart(2, '0')}`,
          senderId: MOI, receiverId: AUTRE, status: 'pending', targetLevel: 'FRIEND',
        };
        creeesParId.set(ligne.id, ligne);
        return { ...ligne, sender: PARTIE, receiver: PARTIE };
      }),
      update: jest.fn<any>(async (args: any) => ({
        id: FR_ID, senderId: AUTRE, receiverId: MOI, status: args?.data?.status ?? 'accepted',
        targetLevel: 'FRIEND', message: null, respondedAt: new Date(),
        createdAt: new Date('2026-11-01T10:00:00.000Z'), updatedAt: new Date(),
        sender: PARTIE, receiver: PARTIE,
      })),
      deleteMany: jest.fn<any>(async () => ({ count: 1 })),
    },
    userRelation: {
      findUnique: jest.fn<any>(async () => ({
        id: 'aa0000000000000000000099', userLowId: MOI, userHighId: AUTRE,
        grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', transitions: [],
      })),
      findMany: jest.fn<any>(async () => []),
      updateMany: jest.fn<any>(async () => ({ count: 1 })),
    },
    pairInteractionDay: { findMany: jest.fn<any>(async () => []) },
    conversation: {
      findFirst: jest.fn<any>(async () => ({ id: 'convid00000000000000001', identifier: 'abc', type: 'direct' })),
      create: jest.fn<any>(async () => ({ id: 'convid00000000000000001', identifier: 'abc', type: 'direct' })),
    },
    ...(opts.aRecevoir === undefined ? {} : {}),
  };
}

function notificationsDouble() {
  return {
    createFriendRequestNotification: jest.fn<any>().mockResolvedValue(undefined),
    emitFriendRequestNew: jest.fn<any>(),
    createFriendAcceptedNotification: jest.fn<any>().mockResolvedValue(undefined),
    emitFriendRequestAccepted: jest.fn<any>(),
    markFriendRequestNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
    retractFriendRequestNotifications: jest.fn<any>().mockResolvedValue(undefined),
  };
}

async function monter() {
  const prisma = prismaDouble();
  const notifications = notificationsDouble();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('notificationService', notifications as never);
  app.decorate('socialEvents', null);
  registerClientMutationIdHook(app);
  app.decorate('mutationLogService', inMemoryMutationLog().service as never);
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: MOI };
    req.authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  await app.register(directoryFriendRequestsRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, prisma, notifications };
}

const envoyer = (app: FastifyInstance, cmid: string) =>
  app.inject({
    method: 'POST',
    url: `${PREFIXE}/friend-requests`,
    headers: { 'content-type': 'application/json', 'x-client-mutation-id': cmid },
    body: JSON.stringify({ receiverId: AUTRE }),
  });

const repondre = (app: FastifyInstance, cmid: string, action: 'accept' | 'reject') =>
  app.inject({
    method: 'PATCH',
    url: `${PREFIXE}/friend-requests/${FR_ID}`,
    headers: { 'content-type': 'application/json', 'x-client-mutation-id': cmid },
    body: JSON.stringify({ action }),
  });

/** Les effets d'après-journal sont tir-et-oublie : laisser la boucle tourner. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  mockStartCooldown.mockClear();
  mockRecordActivity.mockClear();
});

describe('POST /friend-requests — un rejeu n’annonce ni ne pousse une seconde fois (#9623)', () => {
  it('la première exécution notifie et émet — une fois', async () => {
    const { app, notifications } = await monter();

    const res = await envoyer(app, CMID);
    await settled();
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(notifications.createFriendRequestNotification).toHaveBeenCalledTimes(1);
    expect(notifications.emitFriendRequestNew).toHaveBeenCalledTimes(1);
  });

  it('le rejeu resert la demande, sans seconde notification ni seconde émission', async () => {
    const { app, prisma, notifications } = await monter();

    const first = await envoyer(app, CMID);
    await settled();
    const rejeu = await envoyer(app, CMID);
    await settled();
    await app.close();

    expect(rejeu.statusCode).toBe(201);
    expect(prisma.friendRequest.create).toHaveBeenCalledTimes(1);
    expect(rejeu.json().data.id).toBe(first.json().data.id);
    expect(notifications.createFriendRequestNotification).toHaveBeenCalledTimes(1);
    expect(notifications.emitFriendRequestNew).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /friend-requests/:id accept — un rejeu n’annonce ni ne pousse une seconde fois (#9623)', () => {
  it('la première acceptation notifie l’émetteur et émet — une fois', async () => {
    const { app, notifications } = await monter();

    const res = await repondre(app, CMID, 'accept');
    await settled();
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(notifications.createFriendAcceptedNotification).toHaveBeenCalledTimes(1);
    expect(notifications.emitFriendRequestAccepted).toHaveBeenCalledTimes(1);
  });

  it('le rejeu resert l’acceptation et sa conversation, sans seconde notification ni seconde émission', async () => {
    const { app, notifications } = await monter();

    const first = await repondre(app, CMID, 'accept');
    await settled();
    const rejeu = await repondre(app, CMID, 'accept');
    await settled();
    await app.close();

    expect(rejeu.statusCode).toBe(200);
    expect(rejeu.json().data.conversation?.id).toBe(first.json().data.conversation?.id);
    expect(notifications.createFriendAcceptedNotification).toHaveBeenCalledTimes(1);
    expect(notifications.emitFriendRequestAccepted).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /friend-requests/:id reject — un rejeu ne rallonge pas le cool-down (#9623)', () => {
  it('le premier refus ouvre le cool-down — une fois', async () => {
    const { app } = await monter();

    const res = await repondre(app, CMID, 'reject');
    await settled();
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(mockStartCooldown).toHaveBeenCalledTimes(1);
  });

  it('le rejeu ne REÉCRIT pas `until` depuis son horloge — 30 jours restent 30 jours', async () => {
    const { app } = await monter();

    await repondre(app, CMID, 'reject');
    await settled();
    await repondre(app, CMID, 'reject');
    await settled();
    await app.close();

    expect(mockStartCooldown).toHaveBeenCalledTimes(1);
  });
});
