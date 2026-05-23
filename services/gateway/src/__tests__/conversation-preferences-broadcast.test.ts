/**
 * Route-level emission tests for conversation preference endpoints.
 *
 * Phase 0 state: these are RED. The routes don't emit yet. Phase 1
 * will add the `broadcastToUser` calls and turn them GREEN.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import conversationPreferencesRoutes from '../routes/conversation-preferences';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const TEST_USER_ID = '507f1f77bcf86cd799439011';
const TEST_CONV_ID = '507f1f77bcf86cd799439abc';

type EmitCall = { event: string; payload: unknown };

const buildPrismaMock = () => ({
  userConversationPreferences: {
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
    upsert: jest.fn<any>(),
    delete: jest.fn<any>(),
    updateMany: jest.fn<any>(),
  },
});

const buildApp = async (prisma: ReturnType<typeof buildPrismaMock>) => {
  const emits: EmitCall[] = [];
  const rooms: string[] = [];
  const fakeIO = {
    to: (room: string) => {
      rooms.push(room);
      return {
        emit: (event: string, payload: unknown) => {
          emits.push({ event, payload });
        },
      };
    },
  };

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('socketIOHandler', { getManager: () => ({ io: fakeIO }) } as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: TEST_USER_ID, role: 'USER' },
      userId: TEST_USER_ID,
    };
  });

  await app.register(conversationPreferencesRoutes);
  await app.ready();
  return { app, emits, rooms };
};

describe('conversation-preferences routes — socket emissions (Phase 1 contract)', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  it('PUT /user-preferences/conversations/:id increments version and emits USER_PREFERENCES_UPDATED', async () => {
    const upsertedRow = {
      id: 'pref-1',
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      isPinned: true,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      categoryId: null,
      orderInCategory: null,
      customName: null,
      reaction: null,
      deletedForUserAt: null,
      clearHistoryBefore: null,
      version: 4,
      createdAt: new Date('2026-05-22T00:00:00Z'),
      updatedAt: new Date('2026-05-22T00:01:00Z'),
      category: null,
    };
    prisma.userConversationPreferences.upsert.mockResolvedValue(upsertedRow);

    const res = await env.app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${TEST_CONV_ID}`,
      payload: { isPinned: true },
    });

    expect(res.statusCode).toBe(200);

    // Prisma upsert was called with version increment on update, and with
    // an explicit version: 1 on create (so the first emitted version is >= 1,
    // preventing clients from confusing a fresh row with the schema default 0).
    const upsertCall = prisma.userConversationPreferences.upsert.mock.calls[0]?.[0] as any;
    expect(upsertCall?.update?.version).toEqual({ increment: 1 });
    expect(upsertCall?.create?.version).toBe(1);

    // Socket emission to user room with full payload + version
    expect(env.rooms).toContain(ROOMS.user(TEST_USER_ID));
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      version: 4,
      reset: false,
      preferences: expect.objectContaining({
        isPinned: true,
        isMuted: false,
        mentionsOnly: false,
        isArchived: false,
      }),
    });
  });

  it('DELETE /user-preferences/conversations/:id emits USER_PREFERENCES_UPDATED with reset:true and version > local', async () => {
    // Simulate a row that has already been edited a few times.
    prisma.userConversationPreferences.findUnique.mockResolvedValue({ version: 7 } as any);
    prisma.userConversationPreferences.delete.mockResolvedValue({} as any);

    const res = await env.app.inject({
      method: 'DELETE',
      url: `/user-preferences/conversations/${TEST_CONV_ID}`,
    });

    expect(res.statusCode).toBe(200);

    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      reset: true,
      // Must be strictly greater than the previous row version so clients
      // applying `incoming.version <= local -> drop` don't silently discard
      // the reset on every multi-device tab/app.
      version: 8,
      preferences: null,
    });
  });

  it('DELETE on a never-customized conversation still emits version >= 1', async () => {
    prisma.userConversationPreferences.findUnique.mockResolvedValue(null);
    prisma.userConversationPreferences.delete.mockResolvedValue({} as any);

    const res = await env.app.inject({
      method: 'DELETE',
      url: `/user-preferences/conversations/${TEST_CONV_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission?.payload).toMatchObject({ reset: true, version: 1, preferences: null });
  });

  it('POST /user-preferences/reorder emits USER_PREFERENCES_REORDERED with updates', async () => {
    prisma.userConversationPreferences.updateMany.mockResolvedValue({ count: 1 } as any);

    const updates = [
      { conversationId: TEST_CONV_ID, orderInCategory: 0 },
      { conversationId: '507f1f77bcf86cd799439def', orderInCategory: 1 },
    ];

    const res = await env.app.inject({
      method: 'POST',
      url: '/user-preferences/reorder',
      payload: { updates },
    });

    expect(res.statusCode).toBe(200);

    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_REORDERED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      updates,
    });
  });
});
