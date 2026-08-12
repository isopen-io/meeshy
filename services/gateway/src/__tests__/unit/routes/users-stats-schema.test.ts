/**
 * Regression test for the `GET /users/:userId/stats` response schema.
 *
 * The handler computes totalMessages / totalConversations / totalTranslations /
 * friendRequestsReceived / languagesUsed / memberDays / languages / achievements,
 * but a restrictive `properties` whitelist on the response schema made Fastify
 * SILENTLY STRIP every field whose name wasn't declared — only `totalConversations`
 * survived, so the iOS profile sheet showed 0 everywhere. The fix is
 * `data: { additionalProperties: true }`. This test fails (only totalConversations
 * present) against the old schema and passes once the fields are allowed through.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getUserStats } from '../../../routes/users/preferences';

function buildPrisma(): PrismaClient {
  const prisma = {
    user: {
      findFirst: jest.fn(() =>
        Promise.resolve({ id: 'real-id', createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) })
      ),
    },
    message: {
      count: jest.fn(() => Promise.resolve(1000)),
      groupBy: jest.fn(() =>
        Promise.resolve([{ originalLanguage: 'fr' }, { originalLanguage: 'en' }])
      ),
    },
    participant: {
      count: jest.fn(() => Promise.resolve(11)),
    },
    friendRequest: {
      count: jest.fn(() => Promise.resolve(50)),
    },
    $runCommandRaw: jest.fn(() => Promise.resolve({ n: 100 })),
  };
  return prisma as unknown as PrismaClient;
}

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, registeredUser: { id: 'me-id' }, userId: 'me-id' };
  });
  await getUserStats(app);
  await app.ready();
  return app;
}

describe('GET /users/:userId/stats — response schema does not strip stat fields', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns every computed stat field, not just totalConversations', async () => {
    app = await buildApp(buildPrisma());
    const res = await app.inject({ method: 'GET', url: '/users/someuser/stats' });

    expect(res.statusCode).toBe(200);
    const { data } = res.json() as { data: Record<string, unknown> };

    // These all survived stripping ONLY after the additionalProperties fix.
    expect(data.totalMessages).toBe(1000);
    expect(data.totalConversations).toBe(11);
    expect(data.totalTranslations).toBe(100);
    expect(data.friendRequestsReceived).toBe(50);
    expect(data.languagesUsed).toBe(2);
    expect(data.languages).toEqual(['fr', 'en']);
    expect(typeof data.memberDays).toBe('number');
    expect(Array.isArray(data.achievements)).toBe(true);
    expect((data.achievements as unknown[]).length).toBe(6);
  });
});
