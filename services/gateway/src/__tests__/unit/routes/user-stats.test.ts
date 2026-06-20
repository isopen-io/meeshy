/**
 * Tests for user-stats routes.
 *
 * - Pure unit tests on the extracted `computeUserStats` helper (mock prisma).
 * - Integration tests on the public `GET /users/:id/stats` route via app.inject.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { computeUserStats, userStatsRoutes } from '../../../routes/user-stats';

type StatsPrismaOverrides = {
  totalMessages?: number;
  totalConversations?: number;
  totalTranslations?: number;
  friendRequestsReceived?: number;
  languages?: Array<string | null>;
  createdAt?: Date | null;
  resolvedId?: string | null;
};

/**
 * Minimal prisma double covering exactly the methods computeUserStats /
 * resolveUserId call. message.count returns different values based on the
 * `where` clause shape (translations filter ⇒ translations count).
 */
function buildPrisma(overrides: StatsPrismaOverrides = {}): PrismaClient {
  const {
    totalMessages = 0,
    totalConversations = 0,
    totalTranslations = 0,
    friendRequestsReceived = 0,
    languages = [],
    createdAt = new Date(),
    resolvedId = 'resolved-user-id',
  } = overrides;

  const prisma = {
    message: {
      count: jest.fn((args: { where?: { NOT?: unknown } }) =>
        Promise.resolve(args?.where?.NOT ? totalTranslations : totalMessages)
      ),
      groupBy: jest.fn(() =>
        Promise.resolve(languages.map((originalLanguage) => ({ originalLanguage })))
      ),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    participant: {
      count: jest.fn(() => Promise.resolve(totalConversations)),
    },
    friendRequest: {
      count: jest.fn(() => Promise.resolve(friendRequestsReceived)),
    },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve(createdAt ? { createdAt } : null)
      ),
      findFirst: jest.fn(() =>
        Promise.resolve(resolvedId ? { id: resolvedId } : null)
      ),
    },
  };

  return prisma as unknown as PrismaClient;
}

describe('computeUserStats', () => {
  it('aggregates counts, languages and member days into the iOS shape', async () => {
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const prisma = buildPrisma({
      totalMessages: 1200,
      totalConversations: 12,
      totalTranslations: 150,
      friendRequestsReceived: 60,
      languages: ['fr', 'en', 'es'],
      createdAt,
    });

    const stats = await computeUserStats(prisma, 'u1');

    expect(stats.totalMessages).toBe(1200);
    expect(stats.totalConversations).toBe(12);
    expect(stats.totalTranslations).toBe(150);
    expect(stats.friendRequestsReceived).toBe(60);
    expect(stats.languages).toEqual(['fr', 'en', 'es']);
    expect(stats.languagesUsed).toBe(3);
    expect(stats.memberDays).toBe(10);
  });

  it('returns the exact iOS UserStats keys', async () => {
    const stats = await computeUserStats(buildPrisma(), 'u1');
    expect(Object.keys(stats).sort()).toEqual(
      [
        'achievements',
        'friendRequestsReceived',
        'languages',
        'languagesUsed',
        'memberDays',
        'totalConversations',
        'totalMessages',
        'totalTranslations',
      ].sort()
    );
  });

  it('computes achievement unlock state and progress against thresholds', async () => {
    const stats = await computeUserStats(
      buildPrisma({ totalMessages: 1000, totalConversations: 5 }),
      'u1'
    );

    const bavard = stats.achievements.find((a) => a.id === 'bavard');
    const connecteur = stats.achievements.find((a) => a.id === 'connecteur');

    expect(bavard).toMatchObject({
      isUnlocked: true,
      progress: 1,
      threshold: 1000,
      current: 1000,
    });
    expect(connecteur).toMatchObject({
      isUnlocked: false,
      progress: 0.5,
      threshold: 10,
      current: 5,
    });
    // every achievement carries the full shape iOS decodes
    for (const a of stats.achievements) {
      expect(a).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          icon: expect.any(String),
          color: expect.any(String),
          isUnlocked: expect.any(Boolean),
          progress: expect.any(Number),
          threshold: expect.any(Number),
          current: expect.any(Number),
        })
      );
    }
  });

  it('preserves legacy behavior: languagesUsed counts groupBy rows including a null group, languages drops nulls', async () => {
    const stats = await computeUserStats(
      buildPrisma({ languages: ['fr', 'en', null] }),
      'u1'
    );
    expect(stats.languages).toEqual(['fr', 'en']);
    expect(stats.languagesUsed).toBe(3);
  });

  it('treats a missing user as zero member days', async () => {
    const stats = await computeUserStats(buildPrisma({ createdAt: null }), 'u1');
    expect(stats.memberDays).toBe(0);
  });
});

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  // stats helper-only routes also register authenticated /users/me/stats*
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: 'me-id' };
  });
  await app.register(userStatsRoutes);
  await app.ready();
  return app;
}

describe('GET /users/:id/stats', () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 404 when the user cannot be resolved', async () => {
    app = await buildApp(buildPrisma({ resolvedId: null }));
    const res = await app.inject({ method: 'GET', url: '/users/507f1f77bcf86cd799439011/stats' });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
    await app.close();
  });

  it('returns the public stats payload for a resolvable user', async () => {
    const createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    app = await buildApp(
      buildPrisma({
        resolvedId: 'real-id',
        totalMessages: 1000,
        totalConversations: 11,
        totalTranslations: 100,
        friendRequestsReceived: 50,
        languages: ['fr', 'en'],
        createdAt,
      })
    );

    const res = await app.inject({ method: 'GET', url: '/users/someuser/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalMessages).toBe(1000);
    expect(body.data.languagesUsed).toBe(2);
    expect(body.data.memberDays).toBe(40);
    expect(Array.isArray(body.data.achievements)).toBe(true);
    expect(body.data.achievements.length).toBe(6);
    await app.close();
  });

  it('resolves a 24-hex id as a MongoDB ObjectId lookup', async () => {
    const prisma = buildPrisma({ resolvedId: 'real-id', totalMessages: 3 });
    app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/users/507f1f77bcf86cd799439011/stats' });
    expect(res.statusCode).toBe(200);
    const findFirst = (prisma as unknown as { user: { findFirst: jest.Mock } }).user.findFirst;
    const whereArg = (findFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(whereArg).toEqual({ id: '507f1f77bcf86cd799439011' });
    await app.close();
  });
});
