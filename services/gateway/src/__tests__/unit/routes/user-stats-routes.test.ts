/**
 * userStatsRoutes — HTTP handler tests
 *
 * Covers the three `/users/me/stats*` route handlers via Fastify inject:
 *   GET /users/me/stats
 *   GET /users/me/stats/timeline
 *   GET /users/me/stats/achievements
 *
 * The pure `computeUserStats` helper is tested in user-stats.test.ts.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439011';
const AUTH = { authorization: 'Bearer valid-token' };

// ─── Prisma mock factory ──────────────────────────────────────────────────────

type PrismaOverrides = {
  messageCount?: number;
  translationCount?: number;
  conversationCount?: number;
  friendCount?: number;
  languages?: string[];
  createdAt?: Date | null;
  messages?: Array<{ createdAt: Date }>;
};

function makePrisma(overrides: PrismaOverrides = {}): PrismaClient {
  const {
    messageCount = 0,
    translationCount = 0,
    conversationCount = 0,
    friendCount = 0,
    languages = [],
    createdAt = new Date(),
    messages = [],
  } = overrides;

  return {
    message: {
      count: jest.fn((args: { where?: { NOT?: unknown } }) =>
        Promise.resolve(args?.where?.NOT ? translationCount : messageCount)
      ),
      groupBy: jest.fn(() =>
        Promise.resolve(languages.map((l) => ({ originalLanguage: l })))
      ),
      findMany: jest.fn(() => Promise.resolve(messages)),
    },
    participant: { count: jest.fn(() => Promise.resolve(conversationCount)) },
    friendRequest: { count: jest.fn(() => Promise.resolve(friendCount)) },
    user: { findUnique: jest.fn(() => Promise.resolve(createdAt ? { createdAt } : null)) },
  } as unknown as PrismaClient;
}

// ─── App builder ─────────────────────────────────────────────────────────────

async function buildApp(prisma: PrismaClient, authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const token = req.headers.authorization;
      if (!token || !authenticated) {
        await reply.code(401).send({ success: false, error: 'Unauthorized' });
        return;
      }
      (req as unknown as Record<string, unknown>).user = { userId: USER_ID };
    }
  );
  const { userStatsRoutes } = await import('../../../routes/user-stats');
  await app.register(userStatsRoutes);
  await app.ready();
  return app;
}

// ─── GET /users/me/stats ──────────────────────────────────────────────────────

describe('GET /users/me/stats', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(
      makePrisma({
        messageCount: 42,
        conversationCount: 5,
        translationCount: 10,
        friendCount: 3,
        languages: ['fr', 'en'],
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      })
    );
  });
  afterAll(() => app.close());

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with aggregated stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data.totalMessages).toBe(42);
    expect(body.data.totalConversations).toBe(5);
    expect(body.data.totalTranslations).toBe(10);
    expect(body.data.friendRequestsReceived).toBe(3);
    expect(body.data.languages).toEqual(['fr', 'en']);
    expect(body.data.languagesUsed).toBe(2);
    expect(body.data.memberDays).toBe(7);
  });

  it('includes achievements array in response', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats', headers: AUTH });
    const body = JSON.parse(res.body) as { success: boolean; data: { achievements: unknown[] } };
    expect(Array.isArray(body.data.achievements)).toBe(true);
    expect(body.data.achievements.length).toBeGreaterThan(0);
  });
});

describe('GET /users/me/stats — error path', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const prisma = {
      message: {
        count: jest.fn(() => Promise.reject(new Error('db error'))),
        groupBy: jest.fn(() => Promise.reject(new Error('db error'))),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      participant: { count: jest.fn(() => Promise.reject(new Error('db error'))) },
      friendRequest: { count: jest.fn(() => Promise.reject(new Error('db error'))) },
      user: { findUnique: jest.fn(() => Promise.reject(new Error('db error'))) },
    } as unknown as PrismaClient;
    app = await buildApp(prisma);
  });
  afterAll(() => app.close());

  it('returns 500 on prisma failure', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats', headers: AUTH });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /users/me/stats/timeline ────────────────────────────────────────────

describe('GET /users/me/stats/timeline', () => {
  let app: FastifyInstance;
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    app = await buildApp(
      makePrisma({ messages: [{ createdAt: now }, { createdAt: yesterday }] })
    );
  });
  afterAll(() => app.close());

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/timeline' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with timeline array', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/timeline', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect((body.data as Array<{ date: string; messages: number }>).every((e) => 'date' in e && 'messages' in e)).toBe(true);
  });

  it('returns 30 days by default', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/timeline', headers: AUTH });
    const body = JSON.parse(res.body) as { data: unknown[] };
    expect(body.data).toHaveLength(30);
  });

  it('respects custom ?days parameter', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/timeline?days=7', headers: AUTH });
    const body = JSON.parse(res.body) as { data: unknown[] };
    expect(body.data).toHaveLength(7);
  });
});

describe('GET /users/me/stats/timeline — error path', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const prisma = makePrisma();
    (prisma.message.findMany as ReturnType<typeof jest.fn>).mockRejectedValue(new Error('timeout'));
    app = await buildApp(prisma);
  });
  afterAll(() => app.close());

  it('returns 500 on db failure', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/timeline', headers: AUTH });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /users/me/stats/achievements ────────────────────────────────────────

describe('GET /users/me/stats/achievements', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(
      makePrisma({
        messageCount: 1500,
        conversationCount: 15,
        translationCount: 200,
        friendCount: 60,
        languages: ['fr', 'en', 'es', 'de', 'zh'],
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      })
    );
  });
  afterAll(() => app.close());

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/achievements' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with achievements array', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/achievements', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('marks achievements as unlocked when thresholds are met', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/achievements', headers: AUTH });
    const body = JSON.parse(res.body) as { data: Array<{ id: string; isUnlocked: boolean }> };
    const bavard = body.data.find((a) => a.id === 'bavard');
    const polyglotte = body.data.find((a) => a.id === 'polyglotte');
    const fidele = body.data.find((a) => a.id === 'fidele');
    expect(bavard?.isUnlocked).toBe(true);
    expect(polyglotte?.isUnlocked).toBe(true);
    expect(fidele?.isUnlocked).toBe(true);
  });
});

describe('GET /users/me/stats/achievements — error path', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const prisma = {
      message: {
        count: jest.fn(() => Promise.reject(new Error('db error'))),
        groupBy: jest.fn(() => Promise.reject(new Error('db error'))),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      participant: { count: jest.fn(() => Promise.reject(new Error('db error'))) },
      friendRequest: { count: jest.fn(() => Promise.reject(new Error('db error'))) },
      user: { findUnique: jest.fn(() => Promise.reject(new Error('db error'))) },
    } as unknown as PrismaClient;
    app = await buildApp(prisma);
  });
  afterAll(() => app.close());

  it('returns 500 on prisma failure', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/stats/achievements', headers: AUTH });
    expect(res.statusCode).toBe(500);
  });
});
