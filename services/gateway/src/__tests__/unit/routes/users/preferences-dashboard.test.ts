/**
 * Unit tests for getDashboardStats route (preferences.ts)
 * Tests GET /users/me/dashboard-stats.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getDashboardStats } from '../../../../routes/users/preferences';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const mockConversation = {
  id: 'conv-1',
  identifier: 'conv-identifier',
  title: 'Test Chat',
  type: 'group',
  avatar: null,
  updatedAt: new Date('2026-01-01'),
  messages: [{ id: 'msg-1', content: 'Hello', createdAt: new Date('2026-01-01'), sender: { userId: USER_ID, displayName: 'Alice', user: { username: 'alice' } } }],
  participants: [{ user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null } }],
};

const mockCommunity = {
  id: 'comm-1',
  name: 'Test Community',
  description: 'A community',
  avatar: null,
  isPrivate: false,
  updatedAt: new Date('2026-01-01'),
  _count: { members: 5, Conversation: 2 },
  members: [{ user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null } }],
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(
  auth: 'authenticated' | 'unauthenticated' = 'authenticated',
  prismaOverrides: Record<string, any> = {}
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const prisma = {
    participant: {
      count: jest.fn().mockResolvedValue(3),
    },
    conversation: {
      findMany: jest.fn().mockResolvedValue([mockConversation]),
    },
    communityMember: {
      count: jest.fn().mockResolvedValue(2),
    },
    community: {
      findMany: jest.fn().mockResolvedValue([mockCommunity]),
    },
    message: {
      count: jest.fn().mockResolvedValue(42),
    },
    conversationShareLink: {
      count: jest.fn().mockResolvedValue(5),
    },
    ...prismaOverrides,
  };

  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await getDashboardStats(app);
  await app.ready();
  return app;
}

// ─── GET /users/me/dashboard-stats ───────────────────────────────────────────

describe('GET /users/me/dashboard-stats (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('unauthenticated'); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /users/me/dashboard-stats (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with dashboard stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.stats).toBeDefined();
    expect(typeof body.data.stats.totalConversations).toBe('number');
    expect(Array.isArray(body.data.recentConversations)).toBe(true);
    expect(Array.isArray(body.data.recentCommunities)).toBe(true);
  });

  it('returns correct stats values', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    const body = res.json();
    expect(body.data.stats.totalConversations).toBe(3);
    expect(body.data.stats.totalCommunities).toBe(2);
    expect(body.data.stats.totalLinks).toBe(5);
    expect(body.data.recentConversations).toHaveLength(1);
    expect(body.data.recentCommunities).toHaveLength(1);
  });
});

describe('GET /users/me/dashboard-stats (direct conversation without title)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const directConv = {
      ...mockConversation,
      title: '',
      type: 'direct',
      participants: [
        { user: { id: 'other-user', username: 'bob', displayName: 'Bob', avatar: null } },
        { user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null } },
      ],
    };
    app = await buildApp('authenticated', {
      conversation: { findMany: jest.fn().mockResolvedValue([directConv]) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and resolves title from other participant', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].title).toBe('Bob');
  });
});

describe('GET /users/me/dashboard-stats (conversation without messages)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const convNoMessages = { ...mockConversation, messages: [] };
    app = await buildApp('authenticated', {
      conversation: { findMany: jest.fn().mockResolvedValue([convNoMessages]) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with null lastMessage when no messages', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.recentConversations[0].lastMessage).toBeNull();
  });
});

describe('GET /users/me/dashboard-stats (last-message preview excludes soft-deleted)', () => {
  it('gates the nested recent-conversation messages preview with deletedAt: null', async () => {
    const findMany = jest.fn().mockResolvedValue([mockConversation]);
    const app = await buildApp('authenticated', {
      conversation: { findMany },
    });
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(200);

    const queryArg = (findMany.mock.calls[0] as any[])[0];
    expect(queryArg.select.messages.where).toEqual({ deletedAt: null });
    await app.close();
  });
});

describe('GET /users/me/dashboard-stats (DB error)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp('authenticated', {
      participant: { count: jest.fn().mockRejectedValue(new Error('DB error')) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on database error', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });
    expect(res.statusCode).toBe(500);
  });
});
