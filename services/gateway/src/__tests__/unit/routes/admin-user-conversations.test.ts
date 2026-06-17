/**
 * admin-user-conversations.test.ts
 *
 * Tests GET /admin/users/:userId/conversations (admin view of a user's
 * conversations). Covers permission gating, 404 on unknown user, and the
 * pagination + membership-flattening shape of a successful response.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

type PrismaOpts = {
  userExists?: boolean;
  conversations?: Array<Record<string, unknown>>;
  total?: number;
};

function createMockPrisma(opts: PrismaOpts) {
  const conversations = opts.conversations ?? [];
  return {
    user: {
      findUnique: jest.fn(async () => (opts.userExists === false ? null : { id: TARGET_ID })),
    },
    conversation: {
      findMany: jest.fn(async () => conversations),
      count: jest.fn(async () => opts.total ?? conversations.length),
    },
  } as unknown as PrismaClient;
}

async function buildApp(prisma: PrismaClient, role: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  (app as unknown as { prisma: PrismaClient }).prisma = prisma;

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = role
      ? {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: ADMIN_ID,
          registeredUser: { id: ADMIN_ID, role },
          hasFullAccess: true,
        }
      : { isAuthenticated: false, isAnonymous: false };
  });

  const { userAdminRoutes } = await import('../../../routes/admin/users');
  await app.register(userAdminRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('GET /admin/users/:userId/conversations', () => {
  it('returns 403 for a role without canViewUsers (USER)', async () => {
    const app = await buildApp(createMockPrisma({}), 'USER');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/conversations`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when the target user does not exist', async () => {
    const app = await buildApp(createMockPrisma({ userExists: false }), 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/conversations`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns paginated conversations with the target user membership flattened', async () => {
    const prisma = createMockPrisma({
      conversations: [
        {
          id: 'c1',
          identifier: 'mshy_one',
          title: 'Team',
          type: 'group',
          avatar: null,
          isActive: true,
          memberCount: 4,
          communityId: null,
          createdAt: new Date('2026-01-01').toISOString(),
          lastMessageAt: new Date('2026-06-01').toISOString(),
          participants: [{ role: 'moderator', joinedAt: new Date('2026-01-02').toISOString(), isActive: true, nickname: null }],
        },
      ],
      total: 7,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/conversations?offset=0&limit=20`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].membership).toEqual({
      role: 'moderator',
      joinedAt: expect.any(String),
      isActive: true,
      nickname: null,
    });
    // raw participants array must not leak through
    expect(body.data[0].participants).toBeUndefined();
    expect(body.pagination).toMatchObject({ total: 7, offset: 0, limit: 20, hasMore: true });
    await app.close();
  });
});
