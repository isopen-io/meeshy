/**
 * Route-level emission test for `DELETE /conversations/:id/delete-for-me`.
 *
 * Contract: a per-user "delete for me" must broadcast `CONVERSATION_DELETED`
 * to the caller's user room so their other devices drop the conversation
 * locally (consumed iOS-side by ConversationStore.applyConversationDeleted).
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { registerDeleteForMeRoutes } from '../routes/conversations/delete-for-me';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const TEST_USER_ID = '507f1f77bcf86cd799439011';
const TEST_CONV_ID = '507f1f77bcf86cd799439abc'; // 24-hex → resolveConversationId returns as-is

type EmitCall = { event: string; payload: unknown; room: string };

const buildPrismaMock = () => ({
  participant: {
    findFirst: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  conversation: {
    update: jest.fn<any>(),
  },
});

const buildApp = async (prisma: ReturnType<typeof buildPrismaMock>) => {
  const emits: EmitCall[] = [];
  const fakeIO = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ event, payload, room });
      },
    }),
    in: (_room: string) => ({
      fetchSockets: async () => [] as Array<{ leave: (r: string) => void }>,
    }),
  };

  const app = Fastify({ logger: false });
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => fakeIO }) } as any);

  const requiredAuth = async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: TEST_USER_ID, role: 'USER' },
      userId: TEST_USER_ID,
    };
  };

  registerDeleteForMeRoutes(app, prisma as any, requiredAuth, requiredAuth);
  await app.ready();
  return { app, emits };
};

describe('delete-for-me route — conversation:deleted broadcast', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  it('broadcasts CONVERSATION_DELETED to the caller user room on delete-for-me', async () => {
    prisma.participant.findFirst.mockResolvedValue({
      id: 'p1',
      role: 'member',
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      isActive: true,
    });
    prisma.participant.update.mockResolvedValue({});

    const res = await env.app.inject({
      method: 'DELETE',
      url: `/conversations/${TEST_CONV_ID}/delete-for-me`,
    });

    expect(res.statusCode).toBe(200);
    const deletedEmit = env.emits.find((e) => e.event === SERVER_EVENTS.CONVERSATION_DELETED);
    expect(deletedEmit).toBeDefined();
    expect(deletedEmit?.room).toBe(ROOMS.user(TEST_USER_ID));
    expect(deletedEmit?.payload).toEqual({ userId: TEST_USER_ID, conversationId: TEST_CONV_ID });
  });

  it('does not emit when the caller is not a participant', async () => {
    prisma.participant.findFirst.mockResolvedValue(null);

    const res = await env.app.inject({
      method: 'DELETE',
      url: `/conversations/${TEST_CONV_ID}/delete-for-me`,
    });

    expect(res.statusCode).toBe(404);
    expect(env.emits.find((e) => e.event === SERVER_EVENTS.CONVERSATION_DELETED)).toBeUndefined();
  });
});
