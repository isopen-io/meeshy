import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll, jest, beforeEach } from '@jest/globals';

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

import { agentTopicsRoutes } from '../../../../routes/admin/agent-topics';

const { __cacheStoreMock: cacheStoreMock } = jest.requireMock('../../../../services/CacheStore') as {
  __cacheStoreMock: { publish: jest.Mock };
};

function adminEventsPublished(): Array<{ kind: string; conversationId?: string }> {
  return cacheStoreMock.publish.mock.calls
    .filter(([channel]) => channel === 'agent:admin-event')
    .map(([, message]) => JSON.parse(message as string));
}

const mockPrisma: any = {
  agentTopicCatalog: {
    findMany: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    create: jest.fn<any>(),
    update: jest.fn<any>(),
    delete: jest.fn<any>(),
  },
};

const adminUser = {
  id: '507f1f77bcf86cd799439011',
  role: 'ADMIN',
  username: 'admin',
  email: 'admin@test.com',
};

function buildApp(user = adminUser): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });

  app.register(agentTopicsRoutes);
  return app;
}

const validTopicBody = {
  slug: 'cinema',
  label: 'Cinéma',
  keywordPatterns: ['\\bfilm\\b'],
  instructionTemplate: 'Lance une discussion sur le cinéma récent.',
  searchHintTemplate: 'actualité cinéma',
};

const storedTopic = {
  id: '507f1f77bcf86cd799439099',
  ...validTopicBody,
  description: null,
  examples: [],
  cooldownMinutes: 60,
  isActive: true,
};

describe('Agent Topics Routes — admin dashboard push', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (cacheStoreMock.publish as jest.Mock<any>).mockResolvedValue(1);
  });

  it('POST /topics publishes {kind:"topics"} on agent:admin-event', async () => {
    mockPrisma.agentTopicCatalog.create.mockResolvedValueOnce(storedTopic);

    const res = await app.inject({ method: 'POST', url: '/topics', payload: validTopicBody });

    expect(res.statusCode).toBe(200);
    expect(adminEventsPublished()).toEqual([{ kind: 'topics' }]);
  });

  it('PATCH /topics/:id publishes {kind:"topics"} on agent:admin-event', async () => {
    mockPrisma.agentTopicCatalog.update.mockResolvedValueOnce(storedTopic);

    const res = await app.inject({
      method: 'PATCH',
      url: `/topics/${storedTopic.id}`,
      payload: { label: 'Cinéma & séries' },
    });

    expect(res.statusCode).toBe(200);
    expect(adminEventsPublished()).toEqual([{ kind: 'topics' }]);
  });

  it('DELETE /topics/:id (soft) publishes {kind:"topics"} on agent:admin-event', async () => {
    mockPrisma.agentTopicCatalog.update.mockResolvedValueOnce({ ...storedTopic, isActive: false });

    const res = await app.inject({ method: 'DELETE', url: `/topics/${storedTopic.id}` });

    expect(res.statusCode).toBe(200);
    expect(adminEventsPublished()).toEqual([{ kind: 'topics' }]);
  });

  it('does not publish admin event when the mutation fails', async () => {
    mockPrisma.agentTopicCatalog.update.mockRejectedValueOnce({ code: 'P2025' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/topics/${storedTopic.id}`,
      payload: { label: 'X' },
    });

    expect(res.statusCode).toBe(404);
    expect(adminEventsPublished()).toEqual([]);
  });

  it('GET /topics does not publish admin events', async () => {
    mockPrisma.agentTopicCatalog.findMany.mockResolvedValueOnce([storedTopic]);

    const res = await app.inject({ method: 'GET', url: '/topics' });

    expect(res.statusCode).toBe(200);
    expect(adminEventsPublished()).toEqual([]);
  });
});
