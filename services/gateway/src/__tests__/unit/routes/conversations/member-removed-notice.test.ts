/**
 * #7593 — retirer ou bannir un membre ACTIF se lit « Demo a retiré Bob » dans la
 * liste : `DELETE /conversations/:id/participants/:userId` et le noyau de
 * `POST …/ban` écrivent un avis `member-removed` { actor, target } et le
 * diffusent par `broadcastMessage`. Bannir un ancien membre (déjà parti)
 * n'annonce rien : personne ne sort.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));
jest.mock('../../../../utils/participant-lookup-cache', () => ({ invalidateParticipantLookup: jest.fn<any>() }));
jest.mock('../../../../socketio/emitConversationMemberCount', () => ({ emitConversationMemberCountEvent: jest.fn<any>() }));
jest.mock('../../../../socketio/endConversationMembership', () => ({ endConversationMembership: jest.fn<any>().mockResolvedValue(undefined) }));

const quietLogger = () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }),
  },
});
jest.mock('../../../../utils/logger-enhanced', () => quietLogger());
jest.mock('../../../../utils/logger-enhanced.js', () => quietLogger());

import Fastify from 'fastify';
import { registerParticipantRemovalRoute } from '../../../../routes/conversations/participant-removal';
import { bannirParticipant } from '../../../../routes/conversations/participant-ban-core';
import { systemEventFromMessage } from '../../../../routes/conversations/utils/last-message-nature';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439022';
const BOB = '507f1f77bcf86cd799439033';

const EXPECTED = { key: 'system.member-removed', params: { actor: 'Demo', target: 'Bob' } };

const bobRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'p-bob', userId: BOB, role: 'member', isActive: true, leftAt: null, bannedAt: null, displayName: 'Bob', shareLinkId: null,
  ...overrides,
});

function socketDouble() {
  const chain: any = { emit: jest.fn<any>() };
  chain.to = jest.fn<any>(() => chain);
  const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
  const manager = {
    getIO: () => ({ to: chain.to, in: () => ({ fetchSockets: async () => [] }) }),
    invalidateParticipantCache: () => {},
    joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
    broadcastMessage,
  };
  return { gateway: { getManager: () => manager }, broadcastMessage };
}

function messagePrisma() {
  return {
    message: { create: jest.fn<any>(async ({ data }: any) => ({ id: 'sys-1', createdAt: new Date(), ...data })) },
    conversation: { update: jest.fn<any>().mockResolvedValue(undefined) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

describe('#7593 — DELETE /conversations/:id/participants/:userId', () => {
  async function monter() {
    const socket = socketDouble();
    const prisma: any = {
      ...messagePrisma(),
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce({ id: 'p-actor', userId: ACTOR, role: 'admin', displayName: 'Demo', user: { role: 'USER' } })
          .mockResolvedValueOnce(bobRow()),
        update: jest.fn<any>().mockResolvedValue({}),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    };
    const app = Fastify({ logger: false });
    (app as any).socketIOHandler = socket.gateway;
    const requiredAuth = async (req: any) => {
      req.authContext = { type: 'user', userId: ACTOR, isAuthenticated: true, registeredUser: { id: ACTOR, role: 'USER' } };
    };
    registerParticipantRemovalRoute(app as any, prisma, requiredAuth);
    await app.ready();
    return { app, prisma, broadcastMessage: socket.broadcastMessage };
  }

  it('écrit « Demo a retiré Bob » et le diffuse', async () => {
    const { app, prisma, broadcastMessage } = await monter();
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/participants/${BOB}` });
      expect(res.statusCode).toBe(200);
      const data = prisma.message.create.mock.calls[0][0].data;
      expect(data.senderId).toBe('p-actor');
      expect(systemEventFromMessage(data)).toEqual(EXPECTED);
      expect(broadcastMessage).toHaveBeenCalledWith(expect.objectContaining({ metadata: data.metadata }), CONV_ID);
    } finally {
      await app.close();
    }
  });
});

describe('#7593 — bannir un membre', () => {
  function prismaFor(target: Record<string, unknown>) {
    return {
      ...messagePrisma(),
      participant: {
        findFirst: jest.fn<any>()
          .mockResolvedValueOnce({ id: 'p-actor', role: 'admin', displayName: 'Demo' })
          .mockResolvedValueOnce(target),
        update: jest.fn<any>().mockResolvedValue({}),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      conversationShareLink: { update: jest.fn<any>().mockResolvedValue({}) },
    };
  }

  it('un membre ACTIF banni se lit « Demo a retiré Bob »', async () => {
    const prisma = prismaFor(bobRow());
    const socket = socketDouble();
    await bannirParticipant({
      prisma: prisma as never, conversationIdentifier: CONV_ID, targetKey: BOB,
      currentUserId: ACTOR, platformRole: 'USER', socketIO: socket.gateway as never,
    });
    const data = prisma.message.create.mock.calls[0][0].data;
    expect(systemEventFromMessage(data)).toEqual(EXPECTED);
    expect(socket.broadcastMessage).toHaveBeenCalledWith(expect.objectContaining({ metadata: data.metadata }), CONV_ID);
  });

  it("bannir un ancien membre n'annonce aucun retrait", async () => {
    const prisma = prismaFor(bobRow({ isActive: false, leftAt: new Date('2026-09-01') }));
    await bannirParticipant({
      prisma: prisma as never, conversationIdentifier: CONV_ID, targetKey: BOB,
      currentUserId: ACTOR, platformRole: 'USER', socketIO: socketDouble().gateway as never,
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
