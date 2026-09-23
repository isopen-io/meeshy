/**
 * #7593 — `POST /conversations/:id/participants` : l'ajout par un membre se lit
 * « Demo a ajouté Bob », jamais « Bob a rejoint la conversation ». L'avis écrit
 * porte l'acteur (`metadata.addedBy`) et part par la diffusion d'un message
 * ordinaire (`broadcastMessage` → `message:new` + `conversation:updated`).
 *
 * La VRAIE route sur une VRAIE instance Fastify ; seuls la base et le socket
 * sont doublés. `postJoinSystemMessage` n'est PAS mocké : c'est son écriture
 * qu'on lit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn<any>(),
}));

jest.mock('../../../../socketio/emitConversationMemberCount', () => ({
  emitConversationMemberCountEvent: jest.fn<any>(),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

import Fastify from 'fastify';
import { registerParticipantWriteRoutes } from '../../../../routes/conversations/participants-writes';
import { systemEventFromMessage } from '../../../../routes/conversations/utils/last-message-nature';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439022';
const BOB = '507f1f77bcf86cd799439033';

function rowsMatching(rows: any[], where: any) {
  return rows.filter((row) => {
    if (where?.id !== undefined && where.id !== row.id) return false;
    if (where?.conversationId !== undefined && where.conversationId !== row.conversationId) return false;
    if (where?.isActive !== undefined && where.isActive !== row.isActive) return false;
    if (where?.type !== undefined && where.type !== row.type) return false;
    if (where?.NOT?.userId !== undefined && where.NOT.userId === row.userId) return false;
    if (typeof where?.userId === 'string' && where.userId !== row.userId) return false;
    if (where?.userId?.notIn && where.userId.notIn.includes(row.userId)) return false;
    return true;
  });
}

async function monterApp() {
  const rows: any[] = [{
    id: 'p-actor', conversationId: CONV_ID, userId: ACTOR, role: 'admin', isActive: true,
    bannedAt: null, type: 'user', displayName: 'Demo', joinedAt: new Date('2026-01-01'),
  }];
  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any>(async () => ({
        id: CONV_ID, type: 'group', title: 'T', createdAt: new Date('2025-01-01'), isActive: true, closedAt: null,
      })),
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    participant: {
      findFirst: jest.fn<any>(async (a: any) => rowsMatching(rows, a?.where)[0] ?? null),
      findMany: jest.fn<any>(async (a: any) => rowsMatching(rows, a?.where)),
      create: jest.fn<any>(async (a: any) => {
        const row = { isActive: true, bannedAt: null, type: 'user', ...a?.data, id: 'p-bob' };
        rows.push(row);
        return row;
      }),
      update: jest.fn<any>(async (a: any) => ({ id: a?.where?.id, ...a?.data })),
    },
    user: {
      findFirst: jest.fn<any>(async () => ({
        id: BOB, username: 'bob', displayName: 'Bob', firstName: null, lastName: null, avatar: null, systemLanguage: 'fr',
      })),
    },
    message: { create: jest.fn<any>(async (a: any) => ({ id: 'sys-1', createdAt: new Date(), ...a?.data })) },
  };
  const chainable: any = { emit: jest.fn<any>() };
  chainable.to = jest.fn<any>(() => chainable);
  const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);

  const app = Fastify({ logger: false });
  (app as any).prisma = prisma;
  (app as any).notificationService = {
    createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
  };
  (app as any).socketIOHandler = {
    getManager: jest.fn<any>().mockReturnValue({
      getIO: jest.fn<any>().mockReturnValue(chainable),
      joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      broadcastMessage,
    }),
  };
  const requiredAuth = async (req: any) => {
    req.authContext = { type: 'user', userId: ACTOR, isAuthenticated: true, registeredUser: { id: ACTOR, role: 'USER' } };
  };
  registerParticipantWriteRoutes(app as any, prisma, requiredAuth);
  await app.ready();
  return { app, prisma, broadcastMessage };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

describe('#7593 — ajouter un membre écrit « Demo a ajouté Bob »', () => {
  it("l'avis porte l'acteur et se lit system.member-added { actor, target }", async () => {
    const { app, prisma } = await monterApp();
    try {
      const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
      expect(res.statusCode).toBe(200);

      const data = prisma.message.create.mock.calls[0][0].data;
      expect(data.metadata).toMatchObject({ kind: 'member-joined', displayName: 'Bob', addedBy: { participantId: 'p-actor', displayName: 'Demo' } });
      expect(systemEventFromMessage(data)).toEqual({ key: 'system.member-added', params: { actor: 'Demo', target: 'Bob' } });
      expect(data.content).toBe('Demo a ajouté Bob');
    } finally {
      await app.close();
    }
  });

  it('socket : l’avis part par broadcastMessage (message:new + conversation:updated)', async () => {
    const { app, broadcastMessage } = await monterApp();
    try {
      await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
      expect(broadcastMessage).toHaveBeenCalledTimes(1);
      const [message, conversationId] = broadcastMessage.mock.calls[0] as [Record<string, unknown>, string];
      expect(conversationId).toBe(CONV_ID);
      expect(systemEventFromMessage(message)?.key).toBe('system.member-added');
    } finally {
      await app.close();
    }
  });
});
