/**
 * Route-level emission tests for /me/preferences/categories.
 * Phase 0 state: RED. Phase 1 adds emissions and turns these GREEN.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const TEST_USER_ID = '507f1f77bcf86cd799439011';
const TEST_CATEGORY_ID = '507f1f77bcf86cd799439aaa';

// The categories route registers `createUnifiedAuthMiddleware(prisma, ...)`
// inside the plugin. We replace it with a no-op that injects `request.auth`.
jest.mock('../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.auth = { userId: TEST_USER_ID };
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: TEST_USER_ID, role: 'USER' },
      userId: TEST_USER_ID,
    };
  },
}));

type EmitCall = { event: string; payload: unknown };

const buildPrismaMock = () => ({
  userConversationCategory: {
    findFirst: jest.fn<any>(),
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
    delete: jest.fn<any>(),
    updateMany: jest.fn<any>(),
  },
  // categories.ts uses prisma.conversationPreference.updateMany on DELETE
  // (pre-existing) — keep the surface so the route doesn't crash.
  conversationPreference: {
    updateMany: jest.fn<any>(),
  },
  // Real model name (in case Phase 1 fixes the surface).
  userConversationPreferences: {
    updateMany: jest.fn<any>(),
  },
  $transaction: jest.fn<any>(),
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

  // Late require so the jest.mock above is active.
  const { categoriesRoutes } = await import('../routes/me/preferences/categories');
  await app.register(categoriesRoutes);
  await app.ready();
  return { app, emits, rooms };
};

describe('category routes — socket emissions (Phase 1 contract)', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  it('POST /me/preferences/categories emits CATEGORY_CREATED', async () => {
    const created = {
      id: TEST_CATEGORY_ID,
      userId: TEST_USER_ID,
      name: 'Family',
      color: '#FFCC00',
      icon: 'house',
      order: 0,
      isExpanded: true,
      createdAt: new Date('2026-05-22T00:00:00Z'),
      updatedAt: new Date('2026-05-22T00:00:00Z'),
    };
    prisma.userConversationCategory.findFirst.mockResolvedValue(null);
    prisma.userConversationCategory.create.mockResolvedValue(created);

    const res = await env.app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'Family', color: '#FFCC00', icon: 'house' },
    });

    expect(res.statusCode).toBe(200);
    expect(env.rooms).toContain(ROOMS.user(TEST_USER_ID));
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.CATEGORY_CREATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      category: expect.objectContaining({ id: TEST_CATEGORY_ID, name: 'Family' }),
    });
  });

  it('PATCH /me/preferences/categories/:id emits CATEGORY_UPDATED', async () => {
    const existing = {
      id: TEST_CATEGORY_ID,
      userId: TEST_USER_ID,
      name: 'Family',
      color: '#FFCC00',
      icon: 'house',
      order: 0,
      isExpanded: true,
      createdAt: new Date('2026-05-22T00:00:00Z'),
      updatedAt: new Date('2026-05-22T00:00:00Z'),
    };
    const updated = { ...existing, name: 'Famille', updatedAt: new Date('2026-05-22T01:00:00Z') };
    prisma.userConversationCategory.findFirst.mockResolvedValue(existing);
    prisma.userConversationCategory.update.mockResolvedValue(updated);

    const res = await env.app.inject({
      method: 'PATCH',
      url: `/${TEST_CATEGORY_ID}`,
      payload: { name: 'Famille' },
    });

    expect(res.statusCode).toBe(200);
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.CATEGORY_UPDATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      category: expect.objectContaining({ id: TEST_CATEGORY_ID, name: 'Famille' }),
    });
  });

  it('DELETE /me/preferences/categories/:id emits CATEGORY_DELETED', async () => {
    prisma.userConversationCategory.findFirst.mockResolvedValue({
      id: TEST_CATEGORY_ID,
      userId: TEST_USER_ID,
    });
    prisma.$transaction.mockResolvedValue([{ count: 0 }, {}] as any);

    const res = await env.app.inject({
      method: 'DELETE',
      url: `/${TEST_CATEGORY_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.CATEGORY_DELETED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      categoryId: TEST_CATEGORY_ID,
    });
  });

  it('POST /me/preferences/categories/reorder emits CATEGORIES_REORDERED', async () => {
    prisma.userConversationCategory.updateMany.mockResolvedValue({ count: 1 } as any);

    const updates = [
      { categoryId: TEST_CATEGORY_ID, order: 0 },
      { categoryId: '507f1f77bcf86cd799439bbb', order: 1 },
    ];

    const res = await env.app.inject({
      method: 'POST',
      url: '/reorder',
      payload: { updates },
    });

    expect(res.statusCode).toBe(200);
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.CATEGORIES_REORDERED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      updates,
    });
  });
});
