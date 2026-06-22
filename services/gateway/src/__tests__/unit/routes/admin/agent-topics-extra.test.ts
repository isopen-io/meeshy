import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../../services/CacheStore', () => {
  const publish = jest.fn<any>().mockResolvedValue(1);
  const store = {
    publish,
    set: jest.fn<any>().mockResolvedValue(undefined),
    get: jest.fn<any>().mockResolvedValue(null),
    del: jest.fn<any>().mockResolvedValue(undefined),
  };
  return { getCacheStore: () => store, __cacheStoreMock: store };
});

// AgentHttpClient: broadcastTopicsInvalidation creates a new instance each call
jest.mock('../../../../services/AgentHttpClient', () => ({
  AgentHttpClient: jest.fn().mockImplementation(() => ({
    invalidateCache: jest.fn<any>().mockResolvedValue({}),
  })),
}));

import { agentTopicsRoutes } from '../../../../routes/admin/agent-topics';

const { __cacheStoreMock: cacheStoreMock } = jest.requireMock('../../../../services/CacheStore') as {
  __cacheStoreMock: { publish: jest.Mock; set: jest.Mock; get: jest.Mock; del: jest.Mock };
};

const TOPIC_ID = '507f1f77bcf86cd799439099';
const INVALID_ID = 'not-an-id';

const validTopicBody = {
  slug: 'cinema',
  label: 'Cinéma',
  keywordPatterns: ['\\bfilm\\b', '\\bsérie\\b'],
  instructionTemplate: 'Lance une discussion sur le cinéma récent.',
  searchHintTemplate: 'actualité cinéma',
};

const storedTopic: any = {
  id: TOPIC_ID,
  ...validTopicBody,
  description: null,
  examples: [],
  cooldownMinutes: 60,
  isActive: true,
};

function makePrisma(): any {
  return {
    agentTopicCatalog: {
      findMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      delete: jest.fn<any>(),
    },
  };
}

const adminUser = { id: '507f1f77bcf86cd799439011', role: 'ADMIN' };
const bigbossUser = { id: '507f1f77bcf86cd799439022', role: 'BIGBOSS' };
const regularUser = { id: '507f1f77bcf86cd799439033', role: 'USER' };

function buildApp(prisma: any, user: { id: string; role: string } = adminUser): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  app.register(agentTopicsRoutes);
  return app;
}

function buildAppNoUser(prisma: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (_request: any) => {
    // sets no user
  });
  app.register(agentTopicsRoutes);
  return app;
}

describe('Agent Topics Routes — extra coverage', () => {
  let app: FastifyInstance;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (cacheStoreMock.publish as jest.Mock<any>).mockResolvedValue(1);
    prisma = makePrisma();
  });

  afterEach(async () => {
    await app?.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Auth guards
  // ──────────────────────────────────────────────────────────────────────────
  describe('Auth guards', () => {
    it('returns 401 when no user is set', async () => {
      app = buildAppNoUser(prisma);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/topics' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for USER role', async () => {
      app = buildApp(prisma, regularUser);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/topics' });
      expect(res.statusCode).toBe(403);
    });

    it('allows BIGBOSS role', async () => {
      prisma.agentTopicCatalog.findMany.mockResolvedValue([]);
      app = buildApp(prisma, bigbossUser);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/topics' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /topics — active filter variants
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /topics — active filter', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('filters where.isActive=true when ?active=true', async () => {
      prisma.agentTopicCatalog.findMany.mockResolvedValue([storedTopic]);

      const res = await app.inject({ method: 'GET', url: '/topics?active=true' });

      expect(res.statusCode).toBe(200);
      const where = prisma.agentTopicCatalog.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
    });

    it('filters where.isActive=false when ?active=false', async () => {
      prisma.agentTopicCatalog.findMany.mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url: '/topics?active=false' });

      expect(res.statusCode).toBe(200);
      const where = prisma.agentTopicCatalog.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(false);
    });

    it('uses empty where when ?active=all', async () => {
      prisma.agentTopicCatalog.findMany.mockResolvedValue([storedTopic]);

      const res = await app.inject({ method: 'GET', url: '/topics?active=all' });

      expect(res.statusCode).toBe(200);
      const where = prisma.agentTopicCatalog.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBeUndefined();
    });

    it('returns 500 on DB error', async () => {
      prisma.agentTopicCatalog.findMany.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: '/topics' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /topics/:id
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /topics/:id', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns topic when found', async () => {
      prisma.agentTopicCatalog.findUnique.mockResolvedValue(storedTopic);

      const res = await app.inject({ method: 'GET', url: `/topics/${TOPIC_ID}` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.id).toBe(TOPIC_ID);
    });

    it('returns 404 when not found', async () => {
      prisma.agentTopicCatalog.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: `/topics/${TOPIC_ID}` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid objectId', async () => {
      const res = await app.inject({ method: 'GET', url: `/topics/${INVALID_ID}` });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 on DB error', async () => {
      prisma.agentTopicCatalog.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({ method: 'GET', url: `/topics/${TOPIC_ID}` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /topics/:id?hard=true
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /topics/:id — hard delete', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('calls .delete() when hard=true and returns {id, deleted:"hard"}', async () => {
      prisma.agentTopicCatalog.delete.mockResolvedValue({ id: TOPIC_ID });

      const res = await app.inject({ method: 'DELETE', url: `/topics/${TOPIC_ID}?hard=true` });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(prisma.agentTopicCatalog.delete).toHaveBeenCalledWith({ where: { id: TOPIC_ID } });
      expect(prisma.agentTopicCatalog.update).not.toHaveBeenCalled();
      expect(body.data.deleted).toBe('hard');
    });

    it('returns 404 on P2025 during delete', async () => {
      prisma.agentTopicCatalog.delete.mockRejectedValue({ code: 'P2025' });

      const res = await app.inject({ method: 'DELETE', url: `/topics/${TOPIC_ID}?hard=true` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid objectId', async () => {
      const res = await app.inject({ method: 'DELETE', url: `/topics/${INVALID_ID}` });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 on non-P2025 error during hard delete', async () => {
      prisma.agentTopicCatalog.delete.mockRejectedValue(new Error('DB crash'));

      const res = await app.inject({ method: 'DELETE', url: `/topics/${TOPIC_ID}?hard=true` });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /topics — error paths
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /topics', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns 400 for invalid keywordPatterns containing invalid regex', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/topics',
        payload: {
          ...validTopicBody,
          keywordPatterns: ['[invalid-regex'],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 with "Slug déjà existant" on P2002 error', async () => {
      prisma.agentTopicCatalog.create.mockRejectedValue({ code: 'P2002' });

      const res = await app.inject({
        method: 'POST',
        url: '/topics',
        payload: validTopicBody,
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(400);
      expect(body.error?.message ?? body.message).toContain('Slug déjà existant');
    });

    it('returns 500 on other DB error', async () => {
      prisma.agentTopicCatalog.create.mockRejectedValue(new Error('DB error'));

      const res = await app.inject({
        method: 'POST',
        url: '/topics',
        payload: validTopicBody,
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /topics/:id — error paths
  // ──────────────────────────────────────────────────────────────────────────
  describe('PATCH /topics/:id', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns 400 for invalid objectId', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/topics/${INVALID_ID}`,
        payload: { label: 'Updated' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid body (regex field)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/topics/${TOPIC_ID}`,
        payload: { keywordPatterns: ['[bad-regex'] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 500 on non-P2025 DB error', async () => {
      prisma.agentTopicCatalog.update.mockRejectedValue(new Error('DB crash'));

      const res = await app.inject({
        method: 'PATCH',
        url: `/topics/${TOPIC_ID}`,
        payload: { label: 'Updated' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /topics/:id/test
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /topics/:id/test', () => {
    beforeEach(async () => {
      app = buildApp(prisma);
      await app.ready();
    });

    it('returns match counts for each keyword pattern', async () => {
      prisma.agentTopicCatalog.findUnique.mockResolvedValue(storedTopic);

      const res = await app.inject({
        method: 'POST',
        url: `/topics/${TOPIC_ID}/test`,
        payload: { sampleText: 'Ce film est un grand film, meilleure série.' },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.matches['\\bfilm\\b']).toBe(2);
      expect(body.data.matches['\\bsérie\\b']).toBe(1);
    });

    it('returns 0 matches when text does not match', async () => {
      prisma.agentTopicCatalog.findUnique.mockResolvedValue(storedTopic);

      const res = await app.inject({
        method: 'POST',
        url: `/topics/${TOPIC_ID}/test`,
        payload: { sampleText: 'Aucun rapport avec le sujet.' },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.matches['\\bfilm\\b']).toBe(0);
    });

    it('sets match count to -1 for invalid regex stored in DB', async () => {
      const topicWithBadRegex = { ...storedTopic, keywordPatterns: ['['] };
      prisma.agentTopicCatalog.findUnique.mockResolvedValue(topicWithBadRegex);

      const res = await app.inject({
        method: 'POST',
        url: `/topics/${TOPIC_ID}/test`,
        payload: { sampleText: 'Sample text for testing.' },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.matches['[']).toBe(-1);
    });

    it('returns 404 when topic not found', async () => {
      prisma.agentTopicCatalog.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: `/topics/${TOPIC_ID}/test`,
        payload: { sampleText: 'Sample text.' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid objectId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/topics/${INVALID_ID}/test`,
        payload: { sampleText: 'Sample text.' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when sampleText is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/topics/${TOPIC_ID}/test`,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
