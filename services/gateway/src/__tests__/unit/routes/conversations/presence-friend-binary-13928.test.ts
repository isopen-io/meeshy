/**
 * #13928 — un AMI voit « en ligne » ou rien : jamais `lastActiveAt`, ni dans
 * un champ voisin, sur aucune route de conversation qui sert la présence d'un
 * participant.
 *
 * La loi est RÉELLE (`resolvePresenceVisibility`) : le double du service ne
 * fait que nommer le niveau du lien entre le lecteur et l'ami. Chaque route se
 * lit deux fois — en Ami (le témoin) et en Proche (le contrôle, qui prouve que
 * la donnée du fixture ARRIVE au porteur et que son absence n'est pas vide).
 *
 * L'assertion porte sur TOUTE la charge : la date de dernière activité de
 * l'ami, sous quelque clé qu'elle voyage, n'en sort pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const CONV_ID = '507f1f77bcf86cd799439a11';
const VIEWER_ID = '507f1f77bcf86cd799439a22';
const FRIEND_ID = '507f1f77bcf86cd799439a33';
const VIEWER_PARTICIPANT_ID = '507f1f77bcf86cd799439a44';
const FRIEND_PARTICIPANT_ID = '507f1f77bcf86cd799439a55';
const LAST_SEEN = new Date('2026-10-31T07:41:13.537Z');
const JOINED = new Date('2026-09-01T08:00:00.000Z');

type Level = 'FRIEND' | 'CLOSE';
type Viewer = { userId: string; role: string } | null;

const mockResolveForTargets = jest.fn<any>();
const mockResolveForTarget = jest.fn<any>();

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: unknown[]) => mockResolveForTargets(...args),
    resolveForTarget: (...args: unknown[]) => mockResolveForTarget(...args),
    acceptedFriendIds: async () => new Set([FRIEND_ID]),
  }),
}));

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: async () => CONV_ID,
  invalidateConversationIdCache: () => undefined,
}));

jest.mock('../../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    async () => true,
  ));

jest.mock('../../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCountsForUser() { return Promise.resolve(new Map()); }
    getUnreadCount() { return Promise.resolve(0); }
  },
}));

import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import { registerConversationListRoute } from '../../../../routes/conversations/core-list';
import { registerConversationDetailRoute } from '../../../../routes/conversations/core-detail';
import { registerUpdateConversationRoute } from '../../../../routes/conversations/core-lifecycle';
import { registerParticipantReadRoutes } from '../../../../routes/conversations/participants-reads';
import { registerParticipantRoleRoute } from '../../../../routes/conversations/participant-role';
import { registerInviteRoute } from '../../../../routes/conversations/sharing-invite';

const lawAt = (level: Level) => (viewer: Viewer, id: string) =>
  viewer
    ? resolvePresenceVisibility({
        isSelf: viewer.userId === id,
        viewerRole: viewer.role,
        relationLevel: id === FRIEND_ID ? level : 'PUBLIC',
        targetShowOnlineStatus: true,
        targetShowLastSeen: true,
        targetIsDeactivated: false,
        isBlockedEitherWay: false,
      })
    : { showOnline: false, showLastSeenTimestamp: false };

const linkedAt = (level: Level) => {
  const law = lawAt(level);
  mockResolveForTargets.mockImplementation(async (viewer: Viewer, ids: readonly string[]) =>
    new Map(ids.map((id) => [id, law(viewer, id)])));
  mockResolveForTarget.mockImplementation(async (viewer: Viewer, target: { id: string }) => law(viewer, target.id));
};

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;

const createFastify = (decorations: Record<string, unknown> = {}) => {
  const routes = new Map<string, Handler>();
  const on = (method: string) => (path: string, _options: unknown, handler: Handler) => {
    routes.set(`${method} ${path}`, handler);
  };
  const io = (): any => ({ to: () => io(), except: () => io(), emit: () => undefined });
  return {
    get: on('GET'),
    post: on('POST'),
    put: on('PUT'),
    patch: on('PATCH'),
    delete: on('DELETE'),
    route: (opts: { method: string | string[]; url: string; handler: Handler }) =>
      [opts.method].flat().forEach((method) => routes.set(`${method} ${opts.url}`, opts.handler)),
    socketIOHandler: {
      getManager: () => ({
        getIO: () => io(),
        joinUserToConversationRoom: async () => undefined,
        broadcastMessage: async () => undefined,
        invalidateParticipantCache: () => undefined,
      }),
    },
    notificationService: null,
    mentionService: null,
    presenceChecker: undefined,
    handler: (key: string): Handler => {
      const handler = routes.get(key);
      if (!handler) throw new Error(`route absente : ${key} (${[...routes.keys()].join(', ')})`);
      return handler;
    },
    ...decorations,
  };
};

const createReply = () => {
  const reply: any = { body: undefined, statusCode: 200 };
  reply.status = (code: number) => { reply.statusCode = code; return reply; };
  reply.code = reply.status;
  reply.header = () => reply;
  reply.send = (body: unknown) => { reply.body = body; return reply; };
  return reply;
};

const viewerRequest = (overrides: Record<string, unknown> = {}) => ({
  authContext: {
    type: 'user',
    isAuthenticated: true,
    isAnonymous: false,
    userId: VIEWER_ID,
    registeredUser: { id: VIEWER_ID, role: 'USER' },
    sessionToken: null,
  },
  params: { id: CONV_ID },
  query: {},
  body: {},
  headers: {},
  ...overrides,
});

const call = async (handler: Handler, request: unknown) => {
  const reply = createReply();
  await handler(request, reply);
  expect(reply.statusCode).toBe(200);
  return reply.body as { data: any };
};

const expectNoLastSeen = (payload: unknown) => {
  const wire = JSON.stringify(payload);
  expect(wire).not.toContain(LAST_SEEN.toISOString());
  expect(wire).not.toContain(String(LAST_SEEN.getTime()));
};

const expectLastSeenServed = (payload: unknown) => {
  expect(JSON.stringify(payload)).toContain(LAST_SEEN.toISOString());
};

const friendUser = (extra: Record<string, unknown> = {}) => ({
  id: FRIEND_ID,
  username: 'bob',
  displayName: 'Bob',
  firstName: 'Bob',
  lastName: 'Jones',
  avatar: null,
  ...extra,
});

describe('#13928 — un Ami voit « en ligne », jamais lastActiveAt, sur les routes de conversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /conversations — participant, user imbriqué et expéditeur du dernier message', () => {
    const listRow = () => ({
      id: CONV_ID,
      title: null,
      type: 'direct',
      identifier: 'conv-friend',
      isActive: true,
      createdAt: JOINED,
      updatedAt: JOINED,
      lastMessageAt: JOINED,
      banner: null,
      avatar: null,
      communityId: null,
      isAnnouncementChannel: false,
      _count: { participants: 2 },
      userPreferences: [],
      participants: [
        {
          id: VIEWER_PARTICIPANT_ID, userId: VIEWER_ID, conversationId: CONV_ID, type: 'user', displayName: 'Alice',
          avatar: null, role: 'creator', language: 'fr', nickname: null, joinedAt: JOINED, isActive: true,
          isOnline: true, lastActiveAt: null,
          user: { id: VIEWER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'Smith', isOnline: true, lastActiveAt: null },
        },
        {
          id: FRIEND_PARTICIPANT_ID, userId: FRIEND_ID, conversationId: CONV_ID, type: 'user', displayName: 'Bob',
          avatar: null, role: 'member', language: 'fr', nickname: null, joinedAt: JOINED, isActive: true,
          isOnline: true, lastActiveAt: LAST_SEEN,
          user: friendUser({ isOnline: true, lastActiveAt: LAST_SEEN }),
        },
      ],
      messages: [
        {
          id: 'msg-friend', content: 'yo', createdAt: JOINED, senderId: FRIEND_PARTICIPANT_ID, messageType: 'text',
          isBlurred: false, isViewOnce: false, effectFlags: 0, expiresAt: null, attachments: [], _count: { attachments: 0 },
          sender: {
            id: FRIEND_PARTICIPANT_ID, userId: FRIEND_ID, displayName: 'Bob', avatar: null, type: 'user',
            isOnline: true, lastActiveAt: LAST_SEEN,
            user: friendUser({ isOnline: true, lastActiveAt: LAST_SEEN }),
          },
        },
      ],
    });

    // `messages` est la colonne BRUTE du `select`, que le schéma de réponse ne
    // déclare pas (`conversationMinimalSchema`) : fast-json-stringify la retire
    // du fil. Ce qui part, ce sont les projections servies.
    const servedListCarriers = (row: any) => ({ participants: row.participants, lastMessage: row.lastMessage });

    const list = async () => {
      const prisma: any = {
        conversation: { findMany: jest.fn<any>().mockResolvedValue([listRow()]), count: jest.fn<any>().mockResolvedValue(1) },
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
        conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
        message: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
        user: { findMany: jest.fn<any>().mockResolvedValue([]), findUnique: jest.fn<any>().mockResolvedValue(null) },
        agentConversationSummary: { findUnique: jest.fn<any>().mockResolvedValue(null) },
        agentUserRole: { findMany: jest.fn<any>().mockResolvedValue([]) },
        agentAnalysisSnapshot: { findMany: jest.fn<any>().mockResolvedValue([]) },
        $transaction: jest.fn((ops: any) => Promise.all(ops)),
      };
      const fastify = createFastify();
      registerConversationListRoute(fastify as never, prisma, jest.fn());
      const body = await call(fastify.handler('GET /conversations'), viewerRequest({ params: {} }));
      return body.data[0];
    };

    it('Ami ⇒ isOnline vrai et lastActiveAt nul sur le participant, son user et l’expéditeur', async () => {
      linkedAt('FRIEND');

      const row = await list();
      const friend = row.participants.find((p: any) => p.userId === FRIEND_ID);

      expect(friend.isOnline).toBe(true);
      expect(friend.lastActiveAt).toBeNull();
      expect(friend.user.isOnline).toBe(true);
      expect(friend.user.lastActiveAt).toBeNull();
      expect(row.lastMessage.sender.isOnline).toBe(true);
      expect(row.lastMessage.sender.lastActiveAt).toBeNull();
      expectNoLastSeen(servedListCarriers(row));
    });

    it('Proche ⇒ la date part (contrôle du fixture)', async () => {
      linkedAt('CLOSE');

      const row = await list();

      expect(row.lastMessage.sender.lastActiveAt).toEqual(LAST_SEEN);
      expectLastSeenServed(row.participants);
    });
  });

  describe('GET /conversations/:id — participants du détail', () => {
    const friendDetailParticipant = () => ({
      id: FRIEND_PARTICIPANT_ID, userId: FRIEND_ID, type: 'user', displayName: 'Bob', avatar: null, role: 'member',
      permissions: null, isActive: true, isOnline: true, lastActiveAt: LAST_SEEN, joinedAt: JOINED,
      user: friendUser(),
    });

    const detail = async () => {
      const prisma: any = {
        conversation: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: CONV_ID, type: 'group', title: 'Le salon', identifier: 'mee_salon', isActive: true,
            createdAt: JOINED, updatedAt: JOINED, lastMessageAt: JOINED, banner: null, avatar: null, communityId: null,
            participants: [friendDetailParticipant()], userPreferences: [], _count: { participants: 2 },
          }),
        },
        participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: VIEWER_PARTICIPANT_ID, role: 'member' }) },
        user: { findUnique: jest.fn<any>().mockResolvedValue({ birthDate: null }) },
      };
      const fastify = createFastify({ notificationService: { markConversationNotificationsAsRead: async () => undefined } });
      registerConversationDetailRoute(fastify as never, prisma, jest.fn());
      const body = await call(fastify.handler('GET /conversations/:id'), viewerRequest());
      return body.data;
    };

    it('Ami ⇒ isOnline vrai et lastActiveAt nul', async () => {
      linkedAt('FRIEND');

      const served = await detail();
      const friend = served.participants.find((p: any) => p.userId === FRIEND_ID);

      expect(friend.isOnline).toBe(true);
      expect(friend.lastActiveAt).toBeNull();
      expectNoLastSeen(served);
    });

    it('Proche ⇒ la date part (contrôle du fixture)', async () => {
      linkedAt('CLOSE');

      expectLastSeenServed(await detail());
    });
  });

  describe('PUT et PATCH /conversations/:id — participants de la conversation mise à jour', () => {
    const updatedConversation = () => ({
      id: CONV_ID, identifier: 'mee_salon', type: 'group', title: 'Nouveau titre', avatar: null, banner: null,
      participants: [
        { id: FRIEND_PARTICIPANT_ID, userId: FRIEND_ID, isActive: true, isOnline: true, lastActiveAt: LAST_SEEN, user: friendUser() },
      ],
    });

    const update = async (method: 'PUT' | 'PATCH') => {
      const prisma: any = {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: VIEWER_PARTICIPANT_ID, userId: VIEWER_ID, role: 'admin', isActive: true, conversation: { type: 'group' },
          }),
        },
        conversation: { update: jest.fn<any>().mockResolvedValue(updatedConversation()), findUnique: jest.fn<any>() },
        conversationShareLink: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
        message: { create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'sys-1', ...data })) },
        $transaction: jest.fn((ops: any) => Promise.all(ops)),
      };
      const fastify = createFastify();
      registerUpdateConversationRoute(fastify as never, prisma, jest.fn());
      const body = await call(fastify.handler(`${method} /conversations/:id`), viewerRequest({ body: { title: 'Nouveau titre' } }));
      return body.data;
    };

    it.each(['PUT', 'PATCH'] as const)('%s — Ami ⇒ isOnline vrai et lastActiveAt nul', async (method) => {
      linkedAt('FRIEND');

      const served = await update(method);

      expect(served.participants[0].isOnline).toBe(true);
      expect(served.participants[0].lastActiveAt).toBeNull();
      expectNoLastSeen(served);
    });

    it('Proche ⇒ la date part (contrôle du fixture)', async () => {
      linkedAt('CLOSE');

      expectLastSeenServed(await update('PATCH'));
    });
  });

  const friendRow = (extra: Record<string, unknown> = {}) => ({
    id: FRIEND_PARTICIPANT_ID, conversationId: CONV_ID, userId: FRIEND_ID, type: 'user', displayName: 'Bob', avatar: null,
    role: 'member', language: 'fr', isActive: true, isOnline: true, lastActiveAt: LAST_SEEN, joinedAt: JOINED,
    permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true },
    user: friendUser({ role: 'USER', isOnline: true, lastActiveAt: LAST_SEEN, isActive: true, deactivatedAt: null, createdAt: JOINED, updatedAt: JOINED }),
    ...extra,
  });

  describe('GET /conversations/:id/participants — la liste des membres', () => {
    const participants = async () => {
      const prisma: any = {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: VIEWER_PARTICIPANT_ID, role: 'admin', userId: VIEWER_ID }),
          findMany: jest.fn<any>().mockResolvedValue([friendRow()]),
          count: jest.fn<any>().mockResolvedValue(2),
        },
        conversation: { findUnique: jest.fn<any>().mockResolvedValue({ communityId: null }) },
      };
      const fastify = createFastify();
      registerParticipantReadRoutes(fastify as never, prisma, jest.fn());
      const body = await call(fastify.handler('GET /conversations/:id/participants'), viewerRequest());
      return body.data;
    };

    it('Ami ⇒ isOnline vrai et lastActiveAt nul', async () => {
      linkedAt('FRIEND');

      const [friend] = await participants();

      expect(friend.isOnline).toBe(true);
      expect(friend.lastActiveAt).toBeNull();
      expectNoLastSeen(friend);
    });

    it('Proche ⇒ la date part (contrôle du fixture)', async () => {
      linkedAt('CLOSE');

      expectLastSeenServed(await participants());
    });
  });

  describe('GET /conversations/:id/participants/:participantId/profile — la fiche d’un membre', () => {
    const profile = async () => {
      const prisma: any = {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce(friendRow({ user: friendUser({ deactivatedAt: null }) }))
            .mockResolvedValueOnce({ role: 'member' }),
        },
        conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      };
      const fastify = createFastify();
      registerParticipantReadRoutes(fastify as never, prisma, jest.fn());
      const body = await call(
        fastify.handler('GET /conversations/:id/participants/:participantId/profile'),
        viewerRequest({ params: { id: CONV_ID, participantId: FRIEND_PARTICIPANT_ID } }),
      );
      return body.data;
    };

    it('Ami ⇒ isOnline vrai et lastActiveAt nul', async () => {
      linkedAt('FRIEND');

      const served = await profile();

      expect(served.isOnline).toBe(true);
      expect(served.lastActiveAt).toBeNull();
      expectNoLastSeen(served);
    });

    it('Proche ⇒ la date part (contrôle du fixture)', async () => {
      linkedAt('CLOSE');

      expectLastSeenServed(await profile());
    });
  });

  describe('PATCH /conversations/:id/participants/:userId/role — la promotion d’un membre', () => {
    const promote = async () => {
      const prisma: any = {
        participant: {
          findFirst: jest.fn<any>()
            .mockResolvedValueOnce({ id: VIEWER_PARTICIPANT_ID, userId: VIEWER_ID, role: 'creator', isActive: true, user: { id: VIEWER_ID, role: 'USER' } })
            .mockResolvedValueOnce(friendRow({ role: 'member' })),
          update: jest.fn<any>().mockResolvedValue({}),
          findUnique: jest.fn<any>().mockResolvedValue(friendRow({ role: 'admin' })),
        },
        conversation: { findUnique: jest.fn<any>().mockResolvedValue({ isActive: true, closedAt: null }) },
      };
      const fastify = createFastify();
      registerParticipantRoleRoute(fastify as never, prisma, jest.fn());
      const body = await call(
        fastify.handler('PATCH /conversations/:id/participants/:userId/role'),
        viewerRequest({ params: { id: CONV_ID, userId: FRIEND_ID }, body: { role: 'ADMIN' } }),
      );
      return body.data;
    };

    it('Ami ⇒ isOnline vrai et lastActiveAt nul', async () => {
      linkedAt('FRIEND');

      const served = await promote();

      expect(served.participant.isOnline).toBe(true);
      expect(served.participant.lastActiveAt).toBeNull();
      expectNoLastSeen(served);
    });

    it('Proche ⇒ la date part (contrôle du fixture)', async () => {
      linkedAt('CLOSE');

      expectLastSeenServed(await promote());
    });
  });

  describe('POST /conversations/:id/invite — l’ami invité', () => {
    const invite = async () => {
      const prisma: any = {
        conversation: {
          findUnique: jest.fn<any>().mockResolvedValue({
            id: CONV_ID, title: 'Le salon', type: 'group',
            participants: [{ id: VIEWER_PARTICIPANT_ID, userId: VIEWER_ID, role: 'admin', user: { id: VIEWER_ID, username: 'alice', role: 'USER' } }],
          }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
        user: { findUnique: jest.fn<any>().mockResolvedValue(friendUser()) },
        participant: {
          findMany: jest.fn<any>().mockResolvedValue([]),
          create: jest.fn<any>().mockResolvedValue(friendRow({ user: friendUser() })),
          update: jest.fn<any>(),
        },
        message: { create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'sys-1', ...data })) },
      };
      const fastify = createFastify({ prisma });
      registerInviteRoute(fastify as never, prisma, { recordActivity: async () => undefined } as never);
      const body = await call(
        fastify.handler('POST /conversations/:id/invite'),
        viewerRequest({ body: { userId: FRIEND_ID } }),
      );
      return body.data;
    };

    it('Ami ⇒ isOnline vrai et lastActiveAt nul', async () => {
      linkedAt('FRIEND');

      const served = await invite();

      expect(served.participant.isOnline).toBe(true);
      expect(served.participant.lastActiveAt).toBeNull();
      expectNoLastSeen(served);
    });

    it('Proche ⇒ la date part (contrôle du fixture)', async () => {
      linkedAt('CLOSE');

      expectLastSeenServed(await invite());
    });
  });
});
