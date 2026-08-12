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

const { AgentUnavailableError } = jest.requireMock('../../../../services/AgentHttpClient') as {
  AgentUnavailableError: new (msg: string) => Error;
};

const { __cacheStoreMock: cacheStoreMock } = jest.requireMock('../../../../services/CacheStore') as {
  __cacheStoreMock: {
    publish: jest.Mock;
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    keys: jest.Mock;
  };
};

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
      findMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      upsert: jest.fn<any>(),
      delete: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
      updateMany: jest.fn<any>(),
    },
    agentUserRole: {
      count: jest.fn<any>(),
      findMany: jest.fn<any>(),
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
      findMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
    },
    agentScanLog: {
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
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
    message: {
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
    },
    user: {
      findMany: jest.fn<any>(),
    },
    $transaction: jest.fn<any>().mockImplementation(async (promises: Promise<any>[]) =>
      Promise.all(promises)
    ),
  };
}

const CONV_ID = '507f1f77bcf86cd799439099';
const USER_ID = '507f1f77bcf86cd799439012';

function buildApp(prisma: any, user = adminUser): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: user };
  });
  app.register(agentAdminRoutes);
  return app;
}

function buildAppWithAgent(prisma: any, user = adminUser): FastifyInstance {
  process.env.AGENT_HOST = 'localhost';
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: user };
  });
  app.register(agentAdminRoutes);
  return app;
}

describe('Agent Admin Routes — extra coverage', () => {
  let app: FastifyInstance;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AGENT_HOST;
    prisma = makePrisma();
  });

  afterEach(async () => {
    await app?.close();
    delete process.env.AGENT_HOST;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // broadcastInvalidation status variants via PUT /configs/:conversationId
  // Note: cacheInvalidation is stripped by Fastify's response serializer
  // (not in successDataResponse schema). We verify behavior via publish mock.
  // ──────────────────────────────────────────────────────────────────────────
  describe('broadcastInvalidation status variants via PUT /configs/:conversationId', () => {
    it('succeeds and calls publish when Redis returns 0 subscribers and no agentClient', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({ id: '1', conversationId: CONV_ID, enabled: true });
      prisma.user.findMany.mockResolvedValue([]);
      // publish returns 0 → anyChannelSucceeded = false (triggers log.warn)
      cacheStoreMock.publish.mockResolvedValue(0);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { enabled: true },
      });

      expect(res.statusCode).toBe(200);
      // publish is called: once for admin-event, once for config-invalidated
      expect(cacheStoreMock.publish).toHaveBeenCalledWith(
        'agent:config-invalidated',
        expect.stringContaining(CONV_ID),
      );
    });

    it('succeeds and publish is called when Redis returns 1+ subscribers', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({ id: '1', conversationId: CONV_ID, enabled: true });
      prisma.user.findMany.mockResolvedValue([]);
      cacheStoreMock.publish.mockResolvedValue(2);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { enabled: true },
      });

      expect(res.statusCode).toBe(200);
      const invalidateCall = cacheStoreMock.publish.mock.calls.find(
        ([ch]) => ch === 'agent:config-invalidated',
      );
      expect(invalidateCall).toBeDefined();
    });

    it('calls agentClient.invalidateCache when AGENT_HOST is set', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({ id: '1', conversationId: CONV_ID, enabled: true });
      prisma.user.findMany.mockResolvedValue([]);
      cacheStoreMock.publish.mockResolvedValue(0);
      mockAgentClient.invalidateCache.mockResolvedValue({ invalidated: true });

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { enabled: true },
      });

      expect(res.statusCode).toBe(200);
      expect(mockAgentClient.invalidateCache).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: CONV_ID }),
      );
    });

    it('still returns 200 when AGENT_HOST set and HTTP invalidate fails', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({ id: '1', conversationId: CONV_ID, enabled: true });
      prisma.user.findMany.mockResolvedValue([]);
      cacheStoreMock.publish.mockResolvedValue(0);
      mockAgentClient.invalidateCache.mockRejectedValue(new Error('HTTP fail'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { enabled: true },
      });

      // Route should still succeed even when HTTP invalidation fails
      expect(res.statusCode).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs — early return when no conversations
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs', () => {
    it('returns empty pagination when allConvIds.length === 0', async () => {
      prisma.agentConfig.findMany.mockResolvedValue([]);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentAnalytic.findMany.mockResolvedValue([]);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/configs' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('returns 500 when DB throws', async () => {
      prisma.agentConfig.findMany.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/configs' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /stats — DB error
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /stats', () => {
    it('returns 500 when DB throws', async () => {
      prisma.agentConfig.count.mockRejectedValue(new Error('DB error'));

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/summary
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/summary', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns summary when found', async () => {
      const summary = { id: '1', conversationId: CONV_ID, summary: 'Test summary' };
      prisma.agentConversationSummary.findUnique.mockResolvedValue(summary);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/summary` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.summary).toBe('Test summary');
    });

    it('returns 404 when not found', async () => {
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/summary` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid objectId', async () => {
      const res = await app.inject({ method: 'GET', url: '/configs/not-an-id/summary' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/live
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/live', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns live state with cached profiles and analytics', async () => {
      const profiles = { [USER_ID]: { tone: 'neutre' } };
      cacheStoreMock.get
        .mockResolvedValueOnce(JSON.stringify(profiles)) // profiles
        .mockResolvedValueOnce('Summary text')           // summary
        .mockResolvedValueOnce(JSON.stringify([{ id: 'm1' }])); // messages

      prisma.agentAnalytic.findUnique.mockResolvedValue({
        messagesSent: 10,
        totalWordsSent: 100,
        avgConfidence: 0.9,
        lastResponseAt: new Date('2024-01-01'),
        conversationId: CONV_ID,
      });
      prisma.agentConversationSummary.findUnique.mockResolvedValue({
        summary: 'conv summary',
        currentTopics: ['topic1'],
        overallTone: 'positif',
        messageCount: 50,
      });
      prisma.agentUserRole.findMany.mockResolvedValue([
        { userId: USER_ID, confidence: 0.8, locked: false },
      ]);
      prisma.agentConfig.findUnique.mockResolvedValue({ scanStartedAt: null, currentNode: null });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Alice', username: 'alice', systemLanguage: 'fr' },
      ]);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/live` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.toneProfiles).toEqual(profiles);
      expect(body.data.cachedMessageCount).toBe(1);
      expect(body.data.analytics.messagesSent).toBe(10);
      expect(body.data.summaryRecord.overallTone).toBe('positif');
      expect(body.data.controlledUsers[0].displayName).toBe('Alice');
      expect(body.data.controlledUsers[0].systemLanguage).toBe('fr');
    });

    it('returns live state with null profiles (empty toneProfiles)', async () => {
      cacheStoreMock.get.mockResolvedValue(null);
      prisma.agentAnalytic.findUnique.mockResolvedValue(null);
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([]);
      prisma.agentConfig.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/live` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.toneProfiles).toEqual({});
      expect(body.data.analytics).toBeNull();
      expect(body.data.summaryRecord).toBeNull();
      expect(body.data.controlledUsers).toEqual([]);
    });

    it('falls back to userId string when user not in userMap', async () => {
      cacheStoreMock.get.mockResolvedValue(null);
      prisma.agentAnalytic.findUnique.mockResolvedValue(null);
      prisma.agentConversationSummary.findUnique.mockResolvedValue(null);
      prisma.agentUserRole.findMany.mockResolvedValue([
        { userId: USER_ID, confidence: 0.5, locked: true },
      ]);
      prisma.agentConfig.findUnique.mockResolvedValue(null);
      // user not found in DB
      prisma.user.findMany.mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/live` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.controlledUsers[0].displayName).toBe(USER_ID);
      expect(body.data.controlledUsers[0].systemLanguage).toBe('fr');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/schedule
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/schedule', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns 404 when no config', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/schedule` });
      expect(res.statusCode).toBe(404);
    });

    it('returns schedule with defaults when no cache data', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue({
        conversationId: CONV_ID,
        scanIntervalMinutes: 3,
        weekdayMaxMessages: 10,
        weekendMaxMessages: 25,
        burstEnabled: true,
        quietIntervalMinutes: 90,
        minDelayMinutes: null,
        maxDelayMinutes: null,
        spreadOverDayEnabled: true,
        maxMessagesPerUserPer10Min: null,
      });
      cacheStoreMock.get.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/schedule` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.scanIntervalMinutes).toBe(3);
      expect(body.data.budget.messagesUsed).toBe(0);
      expect(body.data.burst.enabled).toBe(true);
      expect(body.data.delay.minDelayMinutes).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/roles
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/roles', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns roles array', async () => {
      const roles = [{ id: '1', userId: USER_ID, conversationId: CONV_ID }];
      prisma.agentUserRole.findMany.mockResolvedValue(roles);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/roles` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toHaveLength(1);
    });

    it('returns 400 for invalid objectId', async () => {
      const res = await app.inject({ method: 'GET', url: '/configs/bad-id/roles' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /configs/:conversationId/messages
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /configs/:conversationId/messages', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns 404 when config not found', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/messages` });
      expect(res.statusCode).toBe(404);
    });

    it('returns paginated messages with success', async () => {
      prisma.agentConfig.findUnique.mockResolvedValue({ id: '1', conversationId: CONV_ID });
      prisma.message.findMany.mockResolvedValue([{ id: 'm1', content: 'Hello' }]);
      prisma.message.count.mockResolvedValue(1);

      const res = await app.inject({ method: 'GET', url: `/configs/${CONV_ID}/messages` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.pagination.total).toBe(1);
    });

    it('returns 400 for invalid objectId', async () => {
      const res = await app.inject({ method: 'GET', url: '/configs/bad-id/messages' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /reset/conversation/:conversationId
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /reset/conversation/:conversationId', () => {
    it('returns counts and deletes Redis keys', async () => {
      prisma.$transaction.mockImplementation(async (promises: Promise<any>[]) =>
        Promise.all(promises)
      );
      prisma.agentConfig.deleteMany.mockResolvedValue({ count: 1 });
      prisma.agentUserRole.deleteMany.mockResolvedValue({ count: 3 });
      prisma.agentConversationSummary.deleteMany.mockResolvedValue({ count: 1 });
      prisma.agentAnalytic.deleteMany.mockResolvedValue({ count: 1 });
      cacheStoreMock.keys.mockResolvedValue([`agent:cooldown:${CONV_ID}:user1`]);
      cacheStoreMock.publish.mockResolvedValue(1);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: `/reset/conversation/${CONV_ID}` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.deleted.configs).toBe(1);
      expect(body.data.deleted.roles).toBe(3);
      expect(body.data.deleted.redisKeys).toBeGreaterThanOrEqual(5); // 4 fixed + 1 cooldown
    });

    it('returns 400 for invalid objectId', async () => {
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/reset/conversation/bad-id' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /reset/user/:userId
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /reset/user/:userId', () => {
    it('cleans Redis profile keys and cooldowns', async () => {
      prisma.$transaction.mockImplementation(async (promises: Promise<any>[]) =>
        Promise.all(promises)
      );
      prisma.agentUserRole.deleteMany.mockResolvedValue({ count: 2 });
      prisma.agentGlobalProfile.deleteMany.mockResolvedValue({ count: 1 });
      // profiles key has the user
      cacheStoreMock.keys
        .mockResolvedValueOnce(['agent:profiles:conv1'])     // profileKeys
        .mockResolvedValueOnce([`agent:cooldown:conv1:${USER_ID}`]); // cooldownKeys
      cacheStoreMock.get.mockResolvedValue(
        JSON.stringify({ [USER_ID]: { tone: 'neutre' }, other: { tone: 'cool' } })
      );
      cacheStoreMock.publish.mockResolvedValue(1);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: `/reset/user/${USER_ID}` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.deleted.roles).toBe(2);
      expect(body.data.deleted.redisProfilesCleaned).toBe(1);
      expect(cacheStoreMock.set).toHaveBeenCalledWith(
        'agent:profiles:conv1',
        JSON.stringify({ other: { tone: 'cool' } })
      );
    });

    it('skips malformed profile JSON gracefully', async () => {
      prisma.$transaction.mockImplementation(async (promises: Promise<any>[]) =>
        Promise.all(promises)
      );
      prisma.agentUserRole.deleteMany.mockResolvedValue({ count: 0 });
      prisma.agentGlobalProfile.deleteMany.mockResolvedValue({ count: 0 });
      cacheStoreMock.keys
        .mockResolvedValueOnce(['agent:profiles:conv1'])
        .mockResolvedValueOnce([]);
      cacheStoreMock.get.mockResolvedValue('not-json{{{');
      cacheStoreMock.publish.mockResolvedValue(0);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: `/reset/user/${USER_ID}` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.deleted.redisProfilesCleaned).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /reset (nuclear)
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /reset', () => {
    it('deletes all agent data and Redis agent:* keys', async () => {
      prisma.$transaction.mockImplementation(async (promises: Promise<any>[]) =>
        Promise.all(promises)
      );
      prisma.agentConfig.deleteMany.mockResolvedValue({ count: 5 });
      prisma.agentUserRole.deleteMany.mockResolvedValue({ count: 10 });
      prisma.agentConversationSummary.deleteMany.mockResolvedValue({ count: 3 });
      prisma.agentAnalytic.deleteMany.mockResolvedValue({ count: 4 });
      prisma.agentGlobalProfile.deleteMany.mockResolvedValue({ count: 2 });
      cacheStoreMock.keys.mockResolvedValue(['agent:config:c1', 'agent:profiles:c2']);
      cacheStoreMock.publish.mockResolvedValue(1);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/reset' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.deleted.configs).toBe(5);
      expect(body.data.deleted.roles).toBe(10);
      expect(body.data.deleted.globalProfiles).toBe(2);
      expect(body.data.deleted.redisKeys).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /recent-activity
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /recent-activity', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns recent activity list', async () => {
      prisma.agentAnalytic.findMany.mockResolvedValue([
        {
          conversationId: CONV_ID,
          messagesSent: 5,
          totalWordsSent: 50,
          avgConfidence: 0.8,
          lastResponseAt: new Date('2024-01-01'),
          conversation: { id: CONV_ID, title: 'Conv 1', type: 'group' },
        },
      ]);
      prisma.agentConfig.findMany.mockResolvedValue([{ conversationId: CONV_ID, enabled: true }]);
      prisma.agentUserRole.findMany.mockResolvedValue([{ conversationId: CONV_ID, userId: USER_ID, confidence: 0.8, locked: false }]);

      const res = await app.inject({ method: 'GET', url: '/recent-activity' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].enabled).toBe(true);
      expect(body.data[0].controlledUsersCount).toBe(1);
    });

    it('returns empty list when no analytics', async () => {
      prisma.agentAnalytic.findMany.mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url: '/recent-activity' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('applies search param', async () => {
      prisma.agentAnalytic.findMany.mockResolvedValue([]);

      await app.inject({ method: 'GET', url: '/recent-activity?search=test' });

      const callArg = prisma.agentAnalytic.findMany.mock.calls[0][0];
      expect(callArg.where.conversation).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /scan-logs
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /scan-logs', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns paginated scan logs', async () => {
      const logs = [{ id: 'log1', conversationId: CONV_ID, trigger: 'timeout', outcome: 'success' }];
      prisma.agentScanLog.findMany.mockResolvedValue(logs);
      prisma.agentScanLog.count.mockResolvedValue(1);

      const res = await app.inject({ method: 'GET', url: '/scan-logs' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toHaveLength(1);
    });

    it('applies conversationId, trigger, outcome, from, to filters', async () => {
      prisma.agentScanLog.findMany.mockResolvedValue([]);
      prisma.agentScanLog.count.mockResolvedValue(0);

      await app.inject({
        method: 'GET',
        url: `/scan-logs?conversationId=${CONV_ID}&trigger=timeout&outcome=success&from=2024-01-01&to=2024-12-31`,
      });

      const where = prisma.agentScanLog.findMany.mock.calls[0][0].where;
      expect(where.conversationId).toBe(CONV_ID);
      expect(where.trigger).toBe('timeout');
      expect(where.outcome).toBe('success');
      expect(where.startedAt).toBeDefined();
    });

    it('returns 500 when DB throws', async () => {
      prisma.agentScanLog.findMany.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/scan-logs' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /scan-logs/stats
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /scan-logs/stats', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('aggregates by day bucket', async () => {
      const startedAt = new Date('2024-06-01T10:00:00Z');
      prisma.agentScanLog.findMany.mockResolvedValue([
        {
          startedAt,
          conversationId: CONV_ID,
          outcome: 'success',
          messagesSent: 3,
          reactionsSent: 1,
          userIdsUsed: [USER_ID],
          estimatedCostUsd: 0.01,
          configChangedAt: null,
        },
      ]);

      const res = await app.inject({ method: 'GET', url: '/scan-logs/stats?bucket=day' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.buckets).toHaveLength(1);
      expect(body.data.buckets[0].scans).toBe(1);
      expect(body.data.buckets[0].messagesSent).toBe(3);
    });

    it('aggregates by week bucket', async () => {
      const startedAt = new Date('2024-06-05T10:00:00Z');
      prisma.agentScanLog.findMany.mockResolvedValue([
        {
          startedAt,
          conversationId: CONV_ID,
          outcome: 'success',
          messagesSent: 2,
          reactionsSent: 0,
          userIdsUsed: [],
          estimatedCostUsd: 0.005,
          configChangedAt: startedAt,
        },
      ]);

      const res = await app.inject({ method: 'GET', url: '/scan-logs/stats?bucket=week' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.buckets).toHaveLength(1);
      expect(body.data.buckets[0].configChanges).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /scan-logs/:logId
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /scan-logs/:logId', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns scan log when found', async () => {
      const logId = '507f1f77bcf86cd799439001';
      prisma.agentScanLog.findUnique.mockResolvedValue({ id: logId, conversationId: CONV_ID, outcome: 'success' });

      const res = await app.inject({ method: 'GET', url: `/scan-logs/${logId}` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.id).toBe(logId);
    });

    it('returns 404 when not found', async () => {
      prisma.agentScanLog.findUnique.mockResolvedValue(null);
      const logId = '507f1f77bcf86cd799439001';

      const res = await app.inject({ method: 'GET', url: `/scan-logs/${logId}` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid objectId', async () => {
      const res = await app.inject({ method: 'GET', url: '/scan-logs/not-valid' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /global-config
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /global-config', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns existing config', async () => {
      const config = { id: 'gc1', enabled: true, systemPrompt: 'Be helpful' };
      prisma.agentGlobalConfig.findFirst.mockResolvedValue(config);

      const res = await app.inject({ method: 'GET', url: '/global-config' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.enabled).toBe(true);
    });

    it('creates default config when none exists', async () => {
      prisma.agentGlobalConfig.findFirst.mockResolvedValue(null);
      prisma.agentGlobalConfig.create.mockResolvedValue({ id: 'gc-new', enabled: true });

      const res = await app.inject({ method: 'GET', url: '/global-config' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(prisma.agentGlobalConfig.create).toHaveBeenCalled();
      expect(body.data.id).toBe('gc-new');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PUT /global-config
  // ──────────────────────────────────────────────────────────────────────────
  describe('PUT /global-config', () => {
    beforeEach(async () => {
      cacheStoreMock.publish.mockResolvedValue(1);
    });

    it('updates existing config', async () => {
      const existing = { id: 'gc1', enabled: true };
      const updated = { id: 'gc1', enabled: false, systemPrompt: 'updated' };
      prisma.agentGlobalConfig.findFirst.mockResolvedValue(existing);
      prisma.agentGlobalConfig.update.mockResolvedValue(updated);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: '/global-config',
        payload: { enabled: false, systemPrompt: 'updated' },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(prisma.agentGlobalConfig.update).toHaveBeenCalled();
      expect(body.data.enabled).toBe(false);
    });

    it('creates new config when none exists', async () => {
      prisma.agentGlobalConfig.findFirst.mockResolvedValue(null);
      prisma.agentGlobalConfig.create.mockResolvedValue({ id: 'gc-new', enabled: true });

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: '/global-config',
        payload: { enabled: true },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(prisma.agentGlobalConfig.create).toHaveBeenCalled();
      expect(body.data.id).toBe('gc-new');
    });

    it('returns 400 for invalid data (globalDailyBudgetUsd > 1000)', async () => {
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PUT',
        url: '/global-config',
        payload: { globalDailyBudgetUsd: 9999 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Zod refine violation: minResponsesPerCycle > maxResponsesPerCycle
  // ──────────────────────────────────────────────────────────────────────────
  describe('PUT /configs/:conversationId — Zod refine', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns 400 when minResponsesPerCycle > maxResponsesPerCycle', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/configs/${CONV_ID}`,
        payload: { minResponsesPerCycle: 10, maxResponsesPerCycle: 5 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /delivery-queue
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /delivery-queue', () => {
    it('returns 503 when agentClient is null (no AGENT_HOST)', async () => {
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/delivery-queue' });
      expect(res.statusCode).toBe(503);
    });

    it('returns queue items when agentClient succeeds', async () => {
      mockAgentClient.getQueue.mockResolvedValue([{ id: '1', content: 'msg' }]);

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/delivery-queue' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toHaveLength(1);
    });

    it('returns 502 on AgentUnavailableError', async () => {
      mockAgentClient.getQueue.mockRejectedValue(new AgentUnavailableError('down'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/delivery-queue' });
      expect(res.statusCode).toBe(502);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /delivery-queue/:id
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /delivery-queue/:id', () => {
    it('returns 503 when no agentClient', async () => {
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/delivery-queue/item1' });
      expect(res.statusCode).toBe(503);
    });

    it('returns success when item deleted', async () => {
      mockAgentClient.deleteQueueItem.mockResolvedValue({ deleted: true });

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/delivery-queue/item1' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.deleted).toBe(true);
    });

    it('returns 502 on AgentUnavailableError', async () => {
      mockAgentClient.deleteQueueItem.mockRejectedValue(new AgentUnavailableError('down'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/delivery-queue/item1' });
      expect(res.statusCode).toBe(502);
    });

    it('returns 404 when statusCode=404', async () => {
      const err = Object.assign(new Error('not found'), { statusCode: 404 });
      mockAgentClient.deleteQueueItem.mockRejectedValue(err);

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/delivery-queue/item1' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 500 on generic error', async () => {
      mockAgentClient.deleteQueueItem.mockRejectedValue(new Error('unexpected'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'DELETE', url: '/delivery-queue/item1' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /delivery-queue/:id
  // ──────────────────────────────────────────────────────────────────────────
  describe('PATCH /delivery-queue/:id', () => {
    it('returns 503 when no agentClient', async () => {
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/delivery-queue/item1',
        payload: { content: 'new content' },
      });
      expect(res.statusCode).toBe(503);
    });

    it('returns updated item on success', async () => {
      mockAgentClient.editQueueItem.mockResolvedValue({ id: 'item1', content: 'new content' });

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/delivery-queue/item1',
        payload: { content: 'new content' },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.content).toBe('new content');
    });

    it('returns 502 on AgentUnavailableError', async () => {
      mockAgentClient.editQueueItem.mockRejectedValue(new AgentUnavailableError('down'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/delivery-queue/item1',
        payload: { content: 'x' },
      });
      expect(res.statusCode).toBe(502);
    });

    it('returns 404 when statusCode=404', async () => {
      const err = Object.assign(new Error('not found'), { statusCode: 404 });
      mockAgentClient.editQueueItem.mockRejectedValue(err);

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/delivery-queue/item1',
        payload: { content: 'x' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when statusCode=400', async () => {
      const err = Object.assign(new Error('reaction'), { statusCode: 400 });
      mockAgentClient.editQueueItem.mockRejectedValue(err);

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/delivery-queue/item1',
        payload: { content: 'x' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 on generic error', async () => {
      mockAgentClient.editQueueItem.mockRejectedValue(new Error('unexpected'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/delivery-queue/item1',
        payload: { content: 'x' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /configs/:conversationId/stop
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /configs/:conversationId/stop', () => {
    it('returns agentUnavailable=true when no agentClient', async () => {
      prisma.agentConfig.updateMany.mockResolvedValue({ count: 1 });
      cacheStoreMock.publish.mockResolvedValue(1);

      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'POST', url: `/configs/${CONV_ID}/stop` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.agentUnavailable).toBe(true);
      expect(body.data.stopped).toBe(true);
    });

    it('returns stopped=true when agentClient.stopScan succeeds', async () => {
      prisma.agentConfig.updateMany.mockResolvedValue({ count: 1 });
      cacheStoreMock.publish.mockResolvedValue(1);
      mockAgentClient.stopScan.mockResolvedValue(undefined);

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'POST', url: `/configs/${CONV_ID}/stop` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.stopped).toBe(true);
      expect(body.data.agentUnavailable).toBeUndefined();
    });

    it('returns agentUnavailable=true on AgentUnavailableError from stopScan', async () => {
      prisma.agentConfig.updateMany.mockResolvedValue({ count: 1 });
      cacheStoreMock.publish.mockResolvedValue(1);
      mockAgentClient.stopScan.mockRejectedValue(new AgentUnavailableError('down'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'POST', url: `/configs/${CONV_ID}/stop` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.agentUnavailable).toBe(true);
    });

    it('returns 500 on other error from stopScan', async () => {
      prisma.agentConfig.updateMany.mockResolvedValue({ count: 1 });
      cacheStoreMock.publish.mockResolvedValue(1);
      mockAgentClient.stopScan.mockRejectedValue(new Error('unexpected'));

      app = buildAppWithAgent(prisma);
      await app.ready();

      const res = await app.inject({ method: 'POST', url: `/configs/${CONV_ID}/stop` });
      expect(res.statusCode).toBe(500);
    });

    it('returns 400 for invalid objectId', async () => {
      app = buildApp(prisma);
      await app.ready();

      const res = await app.inject({ method: 'POST', url: '/configs/bad-id/stop' });
      expect(res.statusCode).toBe(400);
    });
  });
});
