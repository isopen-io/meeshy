/**
 * #7593 — `POST /conversations/:id/invite` est l'autre porte d'ajout par un
 * tiers : son avis se lit « Demo a ajouté Bob » comme celui de
 * `POST …/participants`, et part par `broadcastMessage`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>().mockResolvedValue('507f1f77bcf86cd799439011'),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: jest.fn<any>(async () => ({ showOnline: false, showLastSeenTimestamp: false })),
  }),
}));

import { registerSharingRoutes } from '../../../../routes/conversations/sharing';
import { systemEventFromMessage } from '../../../../routes/conversations/utils/last-message-nature';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439022';
const BOB = '507f1f77bcf86cd799439033';

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

function monter() {
  const routes: Array<{ method: string; path: string; handler: Handler }> = [];
  const register = (method: string) => jest.fn<any>((path: string, _options: unknown, handler: Handler) => {
    routes.push({ method, path, handler });
  });
  const bob = { id: BOB, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', deactivatedAt: null };
  const prisma = {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: CONV_ID, title: 'Groupe', type: 'group', isActive: true, closedAt: null,
        participants: [{ id: 'p-actor', userId: ACTOR, role: 'admin', displayName: 'Demo', user: { id: ACTOR, username: 'demo', role: 'USER' } }],
      }),
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue(bob) },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>().mockResolvedValue({ id: 'p-bob', userId: BOB, displayName: 'Bob', user: bob }),
      update: jest.fn<any>(),
    },
    message: { create: jest.fn<any>(async ({ data }: any) => ({ id: 'sys-1', createdAt: new Date(), ...data })) },
  };
  const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
  const fastify = {
    prisma,
    notificationService: {
      createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
      createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    },
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined), broadcastMessage }),
    },
    get: register('GET'),
    post: register('POST'),
    patch: register('PATCH'),
  };
  registerSharingRoutes(fastify as never, prisma as never, jest.fn());
  const route = routes.find((r) => r.method === 'POST' && r.path.includes('invite'));
  if (!route) throw new Error('route invite absente');
  const reply: Record<string, unknown> = {};
  reply.status = jest.fn<any>(() => reply);
  reply.code = jest.fn<any>(() => reply);
  reply.send = jest.fn<any>(() => reply);
  const request = {
    params: { id: CONV_ID },
    body: { userId: BOB },
    authContext: { type: 'user', userId: ACTOR, isAuthenticated: true, registeredUser: { id: ACTOR, role: 'USER' } },
  };
  return { route, reply, request, prisma, broadcastMessage };
}

describe('#7593 — inviter un membre écrit « Demo a ajouté Bob »', () => {
  it("l'avis porte l'inviteur et part par broadcastMessage", async () => {
    const { route, reply, request, prisma, broadcastMessage } = monter();
    await route.handler(request, reply);

    const data = prisma.message.create.mock.calls[0][0].data;
    expect(systemEventFromMessage(data)).toEqual({ key: 'system.member-added', params: { actor: 'Demo', target: 'Bob' } });
    expect(broadcastMessage).toHaveBeenCalledWith(expect.objectContaining({ metadata: data.metadata }), CONV_ID);
  });

  it("la lecture de l'inviteur demande son nom affiché", async () => {
    const { route, reply, request, prisma } = monter();
    await route.handler(request, reply);
    const select = prisma.conversation.findUnique.mock.calls[0][0].include.participants.select;
    expect(select.displayName).toBe(true);
  });
});
