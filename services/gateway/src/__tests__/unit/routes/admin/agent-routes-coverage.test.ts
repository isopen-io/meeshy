import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// AgentHttpClient mock must be declared before import
const mockAgentClient = {
  invalidateCache: jest.fn<any>().mockResolvedValue({ invalidated: true }),
  getQueue: jest.fn<any>().mockResolvedValue([]),
  deleteQueueItem: jest.fn<any>().mockResolvedValue({ deleted: true }),
  editQueueItem: jest.fn<any>().mockResolvedValue({ id: '1', content: 'edited' }),
  stopScan: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../services/AgentHttpClient', () => ({
  AgentUnavailableError: class AgentUnavailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AgentUnavailableError';
    }
  },
  AgentHttpClient: jest.fn().mockImplementation(() => mockAgentClient),
}));

jest.mock('../../../../services/CacheStore', () => {
  const publish = jest.fn<any>().mockResolvedValue(1);
  const store = {
    publish,
    set: jest.fn<any>().mockResolvedValue(undefined),
    get: jest.fn<any>().mockResolvedValue(null),
    del: jest.fn<any>().mockResolvedValue(undefined),
    keys: jest.fn<any>().mockResolvedValue([]),
  };
  return { getCacheStore: () => store, __cacheStoreMock: store };
});

import { agentAdminRoutes } from '../../../../routes/admin/agent';

const { __cacheStoreMock: cacheStoreMock } = jest.requireMock('../../../../services/CacheStore') as {
  __cacheStoreMock: {
    publish: jest.Mock;
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    keys: jest.Mock;
  };
};

const CONV_ID = '507f1f77bcf86cd799439099';
const USER_ID = '507f1f77bcf86cd799439012';

const adminUser = {
  id: '507f1f77bcf86cd799439011',
  role: 'ADMIN',
  username: 'admin',
  email: 'admin@test.com',
};

function makePrisma(): any {
  return {
    agentConfig: {
      count: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      upsert: jest.fn<any>(),
      delete: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
      updateMany: jest.fn<any>(),
    },
    agentUserRole: {
      count: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
      upsert: jest.fn<any>(),
      update: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
    },
    agentLlmConfig: {
      findFirst: jest.fn<any>(),
      update: jest.fn<any>(),
      create: jest.fn<any>(),
    },
    agentConversationSummary: {
      findUnique: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
    },
    agentAnalytic: {
      aggregate: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
    },
    agentScanLog: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      findUnique: jest.fn<any>(),
    },
    agentGlobalConfig: {
      findFirst: jest.fn<any>(),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
    },
    agentGlobalProfile: {
      deleteMany: jest.fn<any>(),
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    message: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    $transaction: jest.fn<any>().mockImplementation(async (promises: Promise<any>[]) =>
      Promise.all(promises)
    ),
  };
}

function buildApp(prisma: any, user = adminUser): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: user };
  });
  app.register(agentAdminRoutes);
  return app;
}

function buildAppNoAuth(prisma: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: false, registeredUser: null };
  });
  app.register(agentAdminRoutes);
  return app;
}

function buildAppWithAgent(prisma: any): FastifyInstance {
  process.env.AGENT_HOST = 'localhost';
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: adminUser };
  });
  app.register(agentAdminRoutes);
  return app;
}

describe('Agent Admin Routes — coverage gap tests', () => {
  let app: FastifyInstance;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AGENT_HOST;
    prisma = makePrisma();
    cacheStoreMock.publish.mockResolvedValue(1);
  });

  afterEach(async () => {
    await app?.close();
    delete process.env.AGENT_HOST;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // requireAgentAdmin — unauthenticated path (lines 26-27)
  // ──────────────────────────────────────────────────────────────────────────
  describe('requireAgentAdmin middleware', () => {
    it('returns 401 when authContext.isAuthenticated is false', async () => {
      app = buildAppNoAuth(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Zod refine violations (lines 95, 100)
  // ──────────────────────────────────────────────────────────────────────────
  describe('PUT /configs/:conversationId — Zod refine violations', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns 400 when minWordsPerMessage > maxWordsPerMessage', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { minWordsPerMessage: 200, maxWordsPerMessage: 50 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when minDelayMinutes > maxDelayMinutes', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { minDelayMinutes: 100, maxDelayMinutes: 10 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // notifyAdminDashboards — publish reject invokes .catch() (line 267)
  // ──────────────────────────────────────────────────────────────────────────
  describe('notifyAdminDashboards — publish failure', () => {
    it('handles publish rejection gracefully without crashing the route', async () => {
      cacheStoreMock.publish.mockRejectedValue(new Error('pub fail'));
      prisma.agentConfig.upsert.mockResolvedValue({ id: '1', conversationId: CONV_ID, enabled: true });
      prisma.user.findMany.mockResolvedValue([]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { enabled: true },
      });

      expect(res.statusCode).toBe(200);
      // Drain microtask queue so the .catch() callback on notifyAdminDashboards runs (line 267)
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /stats — avgConfidence null fallback (line 311)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /stats', () => {
    it('returns 0 for avgConfidence when aggregate _avg.avgConfidence is null', async () => {
      prisma.agentConfig.count.mockResolvedValue(2);
      prisma.agentUserRole.count.mockResolvedValue(1);
      prisma.agentUserRole.findMany.mockResolvedValue([{ userId: USER_ID }]);
      prisma.agentAnalytic.aggregate.mockResolvedValue({
        _sum: { messagesSent: 10, totalWordsSent: 100 },
        _avg: { avgConfidence: null },
      });
      prisma.agentAnalytic.findMany.mockResolvedValue([]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.avgConfidence).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs — analyticConvIds map callback (line 363)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs — full path with analytics', () => {
    it('invokes analyticConvIds.map callback when analytics has items', async () => {
      // agentConfig.findMany: first call (conv IDs) returns [], second call (page data) returns []
      prisma.agentConfig.findMany.mockResolvedValue([]);
      // agentUserRole.findMany returns [] for both calls
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      // agentAnalytic.findMany: first call returns item (triggers map callback on line 363)
      prisma.agentAnalytic.findMany
        .mockResolvedValueOnce([{ conversationId: CONV_ID }])
        .mockResolvedValue([]);
      // conversation mock returns empty (no matching conversations after search)
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count.mockResolvedValue(0);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/configs' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId — error catch (lines 520-521)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentConfig.findUnique.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /configs/:conversationId — inactivityDaysThreshold sync (line 552)
  // and manualUserIds loop (lines 564-571)
  // and error catch (lines 609-610)
  // ──────────────────────────────────────────────────────────────────────────
  describe('PUT /configs/:conversationId', () => {
    it('syncs inactivityDaysThreshold when inactivityThresholdHours is provided', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({ id: '1', conversationId: CONV_ID, enabled: true });
      prisma.user.findMany.mockResolvedValue([]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { inactivityThresholdHours: 48 },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.agentConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ inactivityDaysThreshold: 2 }),
        })
      );
    });

    it('syncs manualUserIds to AgentUserRole entries when users have no global profile', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({ id: '1', conversationId: CONV_ID, enabled: true });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', agentGlobalProfile: null },
      ]);
      prisma.agentUserRole.upsert.mockResolvedValue({ userId: USER_ID, conversationId: CONV_ID });

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { manualUserIds: [USER_ID] },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.agentUserRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_conversationId: { userId: USER_ID, conversationId: CONV_ID } },
          create: expect.objectContaining({ origin: 'archetype' }),
        })
      );
    });

    it('syncs manualUserIds with origin=observed when user has agentGlobalProfile', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({ id: '1', conversationId: CONV_ID, enabled: true });
      const globalProfile = {
        personaSummary: 'Helpful person',
        tone: 'positif',
        vocabularyLevel: 'soutenu',
        typicalLength: 'long',
        emojiUsage: 'rare',
        topicsOfExpertise: ['tech'],
        topicsAvoided: [],
        catchphrases: [],
        commonEmojis: [],
        reactionPatterns: [],
        messagesAnalyzed: 20,
        confidence: 0.8,
      };
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Bob', username: 'bob', agentGlobalProfile: globalProfile },
      ]);
      prisma.agentUserRole.upsert.mockResolvedValue({ userId: USER_ID, conversationId: CONV_ID });

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { manualUserIds: [USER_ID] },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.agentUserRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ origin: 'observed' }),
        })
      );
    });

    it('returns 500 when DB throws during upsert', async () => {
      prisma.agentConfig.upsert.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { enabled: true },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /configs/:conversationId — error catch (lines 636-637)
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /configs/:conversationId', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentConfig.delete.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: `/configs/${CONV_ID}` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/roles — error catch (lines 659-660)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/roles', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentUserRole.findMany.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/roles` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /roles/:conversationId/:userId/assign — error catch (lines 734-735)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /roles/:conversationId/:userId/assign', () => {
    it('returns 500 when DB throws during upsert', async () => {
      prisma.agentUserRole.upsert.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: `/roles/${CONV_ID}/${USER_ID}/assign`,
        payload: { archetypeId: 'curious' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /roles/:conversationId/:userId/unlock — error catch (lines 762-763)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /roles/:conversationId/:userId/unlock', () => {
    it('returns 500 when DB throws during update', async () => {
      prisma.agentUserRole.update.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: `/roles/${CONV_ID}/${USER_ID}/unlock`,
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /llm — error catch (lines 804-805)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /llm', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentLlmConfig.findFirst.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/llm' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /llm — validation fail (line 824), create path (line 837), error catch (lines 861-862)
  // ──────────────────────────────────────────────────────────────────────────
  describe('PUT /llm', () => {
    it('returns 400 when Zod validation fails (invalid baseUrl)', async () => {
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: '/llm',
        payload: { baseUrl: 'not-a-valid-url' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('creates new LLM config when none exists (line 837)', async () => {
      prisma.agentLlmConfig.findFirst.mockResolvedValue(null);
      prisma.agentLlmConfig.create.mockResolvedValue({
        id: 'llm1',
        provider: 'openai',
        model: 'gpt-4',
        apiKeyEncrypted: 'enc',
        fallbackApiKeyEncrypted: null,
      });

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: '/llm',
        payload: { provider: 'openai', model: 'gpt-4', apiKeyEncrypted: 'enc-key' },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.agentLlmConfig.create).toHaveBeenCalled();
      expect(prisma.agentLlmConfig.update).not.toHaveBeenCalled();
    });

    it('returns 500 when DB throws', async () => {
      prisma.agentLlmConfig.findFirst.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: '/llm',
        payload: { provider: 'openai' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /reset/conversation/:conversationId — error catch (lines 926-927)
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /reset/conversation/:conversationId', () => {
    it('returns 500 when transaction throws', async () => {
      prisma.$transaction.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: `/reset/conversation/${CONV_ID}` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /reset/user/:userId — error catch (lines 998-999)
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /reset/user/:userId', () => {
    it('returns 500 when transaction throws', async () => {
      prisma.$transaction.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: `/reset/user/${USER_ID}` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /reset — error catch (lines 1052-1053)
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /reset', () => {
    it('returns 500 when transaction throws', async () => {
      prisma.$transaction.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/reset' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/summary — error catch (lines 1078-1079)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/summary', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentConversationSummary.findUnique.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/summary` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/live — error catch (lines 1164-1165)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/live', () => {
    it('returns 500 when DB throws', async () => {
      cacheStoreMock.get.mockRejectedValue(new Error('cache error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/live` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /recent-activity — error catch (lines 1253-1254)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /recent-activity', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentAnalytic.findMany.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/recent-activity' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/schedule — error catch (lines 1356-1357)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/schedule', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentConfig.findUnique.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/schedule` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /configs/:conversationId/trigger — error catch (lines 1436-1437)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /configs/:conversationId/trigger', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentConfig.findUnique.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'POST', url: `/configs/${CONV_ID}/trigger` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/messages — error catch (lines 1494-1495)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/messages', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentConfig.findUnique.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/messages` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /scan-logs/stats — error catch (lines 1642-1643)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /scan-logs/stats', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentScanLog.findMany.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/scan-logs/stats' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /scan-logs/:logId — error catch (lines 1671-1672)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /scan-logs/:logId', () => {
    it('returns 500 when DB throws', async () => {
      const logId = '507f1f77bcf86cd799439001';
      prisma.agentScanLog.findUnique.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/scan-logs/${logId}` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /global-config — error catch (lines 1694-1695)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /global-config', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentGlobalConfig.findFirst.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/global-config' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /global-config — warn when anyChannelSucceeded=false (line 1730)
  // and error catch (lines 1738-1739)
  // ──────────────────────────────────────────────────────────────────────────
  describe('PUT /global-config', () => {
    it('logs warning when both Redis and HTTP invalidation fail (anyChannelSucceeded=false)', async () => {
      cacheStoreMock.publish.mockResolvedValue(0);
      const existing = { id: 'gc1', enabled: true };
      prisma.agentGlobalConfig.findFirst.mockResolvedValue(existing);
      prisma.agentGlobalConfig.update.mockResolvedValue({ ...existing, enabled: false });

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: '/global-config',
        payload: { enabled: false },
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 500 when DB throws', async () => {
      prisma.agentGlobalConfig.findFirst.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: '/global-config',
        payload: { enabled: true },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /delivery-queue — generic error catch (lines 1781-1782)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /delivery-queue', () => {
    it('returns 500 on generic error from getQueue', async () => {
      mockAgentClient.getQueue.mockRejectedValue(new Error('unexpected error'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/delivery-queue' });
      expect(res.statusCode).toBe(500);
    });

    it('returns empty array when getQueue returns a non-array value', async () => {
      mockAgentClient.getQueue.mockResolvedValue({ items: [] });

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/delivery-queue' });
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // broadcastInvalidation — publish returns non-number (line 244)
  // ──────────────────────────────────────────────────────────────────────────
  describe('broadcastInvalidation — non-number publish return', () => {
    it('uses 0 for redisSubscribersNotified when publish resolves to undefined', async () => {
      cacheStoreMock.publish.mockResolvedValue(undefined as any);
      prisma.agentConfig.delete.mockResolvedValue({ conversationId: CONV_ID });

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: `/configs/${CONV_ID}` });
      expect(res.statusCode).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /stats — null _sum + recentAnalytics with null/non-null conversation
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /stats — _sum null branches and recentAnalytics callback', () => {
    it('falls back to 0 when _sum.messagesSent and _sum.totalWordsSent are null', async () => {
      prisma.agentConfig.count.mockResolvedValue(0);
      prisma.agentUserRole.count.mockResolvedValue(0);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalytic.aggregate.mockResolvedValue({
        _sum: { messagesSent: null, totalWordsSent: null },
        _avg: { avgConfidence: 0.5 },
      });
      prisma.agentAnalytic.findMany.mockResolvedValue([]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.totalMessagesSent).toBe(0);
      expect(body.data.totalWordsSent).toBe(0);
    });

    it('maps recentAnalytics with null conversation and null lastResponseAt', async () => {
      prisma.agentConfig.count.mockResolvedValue(1);
      prisma.agentUserRole.count.mockResolvedValue(0);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalytic.aggregate.mockResolvedValue({
        _sum: { messagesSent: 5, totalWordsSent: 50 },
        _avg: { avgConfidence: 0.6 },
      });
      prisma.agentAnalytic.findMany.mockResolvedValue([
        {
          conversationId: CONV_ID,
          conversation: null,
          messagesSent: 5,
          totalWordsSent: 50,
          avgConfidence: 0.6,
          lastResponseAt: null,
        },
      ]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.recentActivity[0].conversation).toBeNull();
      expect(body.data.recentActivity[0].lastResponseAt).toBeNull();
    });

    it('maps recentAnalytics with non-null conversation and non-null lastResponseAt', async () => {
      prisma.agentConfig.count.mockResolvedValue(1);
      prisma.agentUserRole.count.mockResolvedValue(0);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalytic.aggregate.mockResolvedValue({
        _sum: { messagesSent: 10, totalWordsSent: 100 },
        _avg: { avgConfidence: 0.7 },
      });
      const ts = new Date('2024-06-01T10:00:00.000Z');
      prisma.agentAnalytic.findMany.mockResolvedValue([
        {
          conversationId: CONV_ID,
          conversation: { id: CONV_ID, title: 'Chat', type: 'PRIVATE' },
          messagesSent: 10,
          totalWordsSent: 100,
          avgConfidence: 0.7,
          lastResponseAt: ts,
        },
      ]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.recentActivity[0].conversation).not.toBeNull();
      expect(body.data.recentActivity[0].lastResponseAt).toBe(ts.toISOString());
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs — search filter + enrichedConfigs.map callback
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs — enrichedConfigs.map callback', () => {
    it('applies search filter when query param provided', async () => {
      prisma.agentConfig.findMany.mockResolvedValueOnce([{ conversationId: CONV_ID }]).mockResolvedValueOnce([]);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalytic.findMany.mockResolvedValue([]);
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.count.mockResolvedValue(0);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/configs?search=mygroup' });
      expect(res.statusCode).toBe(200);
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ title: expect.anything() }) })
      );
    });

    it('runs enrichedConfigs.map with config and analytics (all ?? left branches)', async () => {
      const now = new Date('2024-07-01T08:00:00.000Z');
      const configItem = {
        id: 'cfg1',
        conversationId: CONV_ID,
        configuredBy: adminUser.id,
        enabled: true,
        agentType: 'personal',
        autoPickupEnabled: true,
        inactivityThresholdHours: 72,
        maxControlledUsers: 5,
        manualUserIds: [USER_ID],
        excludedRoles: ['MODERATOR'],
        excludedUserIds: [],
        triggerOnTimeout: true,
        timeoutSeconds: 300,
        triggerOnUserMessage: false,
        triggerFromUserIds: [],
        triggerOnReplyTo: true,
        contextWindowSize: 50,
        useFullHistory: false,
        scanIntervalMinutes: 3,
        minResponsesPerCycle: 2,
        maxResponsesPerCycle: 12,
        reactionsEnabled: true,
        maxReactionsPerCycle: 4,
        agentInstructions: 'Be helpful',
        webSearchEnabled: true,
        minWordsPerMessage: 1,
        maxWordsPerMessage: 500,
        minHistoricalMessages: 0,
        generationTemperature: 0.8,
        qualityGateEnabled: true,
        qualityGateMinScore: 0.5,
        weekdayMaxMessages: 10,
        weekendMaxMessages: 25,
        weekdayMaxUsers: 4,
        weekendMaxUsers: 6,
        burstEnabled: true,
        burstSize: 4,
        burstIntervalMinutes: 5,
        quietIntervalMinutes: 90,
        inactivityDaysThreshold: 3,
        prioritizeTaggedUsers: true,
        prioritizeRepliedUsers: true,
        reactionBoostFactor: 1.5,
        minDelayMinutes: 2,
        maxDelayMinutes: 10,
        spreadOverDayEnabled: true,
        maxMessagesPerUserPer10Min: 3,
        scanStartedAt: null,
        currentNode: null,
        createdAt: now,
        updatedAt: now,
      };
      const analyticsItem = {
        conversationId: CONV_ID,
        messagesSent: 10,
        totalWordsSent: 100,
        avgConfidence: 0.7,
        lastResponseAt: now,
      };
      prisma.agentConfig.findMany
        .mockResolvedValueOnce([{ conversationId: CONV_ID }])
        .mockResolvedValueOnce([configItem]);
      prisma.agentUserRole.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ conversationId: CONV_ID, userId: USER_ID }]);
      prisma.agentAnalytic.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([analyticsItem]);
      prisma.conversation.findMany.mockResolvedValue([{ id: CONV_ID, title: 'Room', type: 'GROUP' }]);
      prisma.conversation.count.mockResolvedValue(1);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/configs' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].enabled).toBe(true);
      expect(body.data[0].analytics.lastResponseAt).toBe(now.toISOString());
    });

    it('runs enrichedConfigs.map without config — covers ?? default branches', async () => {
      prisma.agentConfig.findMany
        .mockResolvedValueOnce([{ conversationId: CONV_ID }])
        .mockResolvedValueOnce([]);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalytic.findMany.mockResolvedValue([]);
      prisma.conversation.findMany.mockResolvedValue([{ id: CONV_ID, title: 'Room', type: 'GROUP' }]);
      prisma.conversation.count.mockResolvedValue(1);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/configs' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].enabled).toBe(false);
      expect(body.data[0].analytics).toBeNull();
    });

    it('covers analytics with null lastResponseAt in enrichedConfigs.map', async () => {
      const analyticsItemNoDate = {
        conversationId: CONV_ID,
        messagesSent: 3,
        totalWordsSent: 30,
        avgConfidence: 0.5,
        lastResponseAt: null,
      };
      prisma.agentConfig.findMany
        .mockResolvedValueOnce([{ conversationId: CONV_ID }])
        .mockResolvedValueOnce([]);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalytic.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([analyticsItemNoDate]);
      prisma.conversation.findMany.mockResolvedValue([{ id: CONV_ID, title: 'Room', type: 'GROUP' }]);
      prisma.conversation.count.mockResolvedValue(1);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/configs' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data[0].analytics.lastResponseAt).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /recent-activity — null conversation + null lastResponseAt in map
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /recent-activity — analytics map branches', () => {
    it('covers null conversation and null lastResponseAt', async () => {
      prisma.agentAnalytic.findMany.mockResolvedValue([
        {
          conversationId: CONV_ID,
          conversation: null,
          messagesSent: 3,
          totalWordsSent: 30,
          avgConfidence: 0.5,
          lastResponseAt: null,
        },
      ]);
      prisma.agentConfig.findMany.mockResolvedValue([]);
      prisma.agentUserRole.findMany.mockResolvedValue([]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/recent-activity' });
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data[0].conversation).toBeNull();
      expect(body.data[0].lastResponseAt).toBeNull();
    });

    it('covers non-null conversation and non-null lastResponseAt', async () => {
      const ts = new Date('2024-06-15T09:00:00.000Z');
      prisma.agentAnalytic.findMany.mockResolvedValue([
        {
          conversationId: CONV_ID,
          conversation: { id: CONV_ID, title: 'Room', type: 'GROUP' },
          messagesSent: 5,
          totalWordsSent: 50,
          avgConfidence: 0.8,
          lastResponseAt: ts,
        },
      ]);
      prisma.agentConfig.findMany.mockResolvedValue([{ conversationId: CONV_ID, enabled: true }]);
      prisma.agentUserRole.findMany.mockResolvedValue([
        { conversationId: CONV_ID, userId: USER_ID, confidence: 0.9, locked: false },
        { conversationId: CONV_ID, userId: adminUser.id, confidence: 0.7, locked: true },
      ]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/recent-activity' });
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data[0].conversation).not.toBeNull();
      expect(body.data[0].lastResponseAt).toBe(ts.toISOString());
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/schedule — non-zero lastScan + lastBurst
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/schedule — cache cache branches', () => {
    it('covers non-zero lastScan and non-zero lastBurst paths', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue({
        conversationId: CONV_ID,
        scanIntervalMinutes: 5,
        weekdayMaxMessages: 10,
        weekendMaxMessages: 25,
        burstEnabled: true,
        quietIntervalMinutes: 60,
        spreadOverDayEnabled: true,
      });

      const pastScan = Date.now() - 3 * 60 * 1000;
      const pastBurst = Date.now() - 30 * 60 * 1000;
      cacheStoreMock.get
        .mockResolvedValueOnce(String(pastScan))
        .mockResolvedValueOnce('3')
        .mockResolvedValueOnce('2')
        .mockResolvedValueOnce(String(pastBurst));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/schedule` });
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.data.lastScan).toBe(pastScan);
      expect(body.data.burst.lastBurst).toBe(pastBurst);
      expect(body.data.burst.cooldownEndsAt).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /scan-logs/stats — conversationId filter (line 1591)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /scan-logs/stats — conversationId filter', () => {
    it('filters by conversationId when query param provided', async () => {
      prisma.agentScanLog.findMany.mockResolvedValue([]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: `/scan-logs/stats?conversationId=${CONV_ID}` });
      expect(res.statusCode).toBe(200);
      expect(prisma.agentScanLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ conversationId: CONV_ID }) })
      );
    });
  });
});
