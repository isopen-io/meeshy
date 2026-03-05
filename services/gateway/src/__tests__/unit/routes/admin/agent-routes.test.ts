import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll, jest, beforeEach } from '@jest/globals';
import { agentAdminRoutes } from '../../../../routes/admin/agent';

const mockPrisma: any = {
  agentConfig: {
    count: jest.fn<any>(),
    findMany: jest.fn<any>(),
    findUnique: jest.fn<any>(),
    upsert: jest.fn<any>(),
    delete: jest.fn<any>(),
  },
  agentUserRole: {
    count: jest.fn<any>(),
    findMany: jest.fn<any>(),
    upsert: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  agentLlmConfig: {
    findFirst: jest.fn<any>(),
    update: jest.fn<any>(),
    create: jest.fn<any>(),
  },
  agentConversationSummary: {
    findUnique: jest.fn<any>(),
  },
};

const adminUser = {
  id: '507f1f77bcf86cd799439011',
  role: 'ADMIN',
  username: 'admin',
  email: 'admin@test.com',
};

const regularUser = {
  id: '507f1f77bcf86cd799439012',
  role: 'USER',
  username: 'user',
  email: 'user@test.com',
};

function buildApp(user = adminUser): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: user,
    };
  });

  app.register(agentAdminRoutes);
  return app;
}

describe('Agent Admin Routes', () => {
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
  });

  describe('GET /stats', () => {
    it('returns agent stats', async () => {
      mockPrisma.agentConfig.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3);
      mockPrisma.agentUserRole.count.mockResolvedValueOnce(25);

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        totalConfigs: 10,
        activeConfigs: 3,
        totalRoles: 25,
        totalArchetypes: 5,
      });
    });
  });

  describe('GET /configs', () => {
    it('returns paginated configs', async () => {
      const configs = [{ id: '1', conversationId: 'c1', enabled: true }];
      mockPrisma.agentConfig.findMany.mockResolvedValue(configs);
      mockPrisma.agentConfig.count.mockResolvedValue(1);

      const res = await app.inject({ method: 'GET', url: '/configs?page=1&limit=20' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(configs);
      expect(body.pagination).toEqual({ total: 1, page: 1, limit: 20, hasMore: false });
    });
  });

  describe('GET /configs/:conversationId', () => {
    it('returns config for conversation', async () => {
      const config = { id: '1', conversationId: '507f1f77bcf86cd799439099', enabled: true };
      mockPrisma.agentConfig.findUnique.mockResolvedValue(config);

      const res = await app.inject({ method: 'GET', url: '/configs/507f1f77bcf86cd799439099' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toEqual(config);
    });

    it('returns 404 when not found', async () => {
      mockPrisma.agentConfig.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/configs/507f1f77bcf86cd799439099' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /configs/:conversationId', () => {
    it('upserts config with valid data', async () => {
      const config = { id: '1', conversationId: '507f1f77bcf86cd799439099', enabled: true };
      mockPrisma.agentConfig.upsert.mockResolvedValue(config);

      const res = await app.inject({
        method: 'PUT',
        url: '/configs/507f1f77bcf86cd799439099',
        payload: { enabled: true, timeoutSeconds: 600 },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });

    it('returns 400 for invalid data', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/configs/507f1f77bcf86cd799439099',
        payload: { timeoutSeconds: -1 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /configs/:conversationId', () => {
    it('deletes config', async () => {
      mockPrisma.agentConfig.delete.mockResolvedValue({});

      const res = await app.inject({ method: 'DELETE', url: '/configs/507f1f77bcf86cd799439099' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /archetypes', () => {
    it('returns archetype catalog', async () => {
      const res = await app.inject({ method: 'GET', url: '/archetypes' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(5);
      expect(body.data[0]).toHaveProperty('id', 'curious');
      expect(body.data[0]).toHaveProperty('name', 'Le Curieux');
    });
  });

  describe('GET /llm', () => {
    it('returns LLM config without API key', async () => {
      const config = {
        id: '1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKeyEncrypted: 'secret',
        fallbackApiKeyEncrypted: null,
        maxTokens: 1024,
        temperature: 0.7,
        dailyBudgetUsd: 20,
        maxCostPerCall: 0.05,
      };
      mockPrisma.agentLlmConfig.findFirst.mockResolvedValue(config);

      const res = await app.inject({ method: 'GET', url: '/llm' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.hasApiKey).toBe(true);
      expect(body.data).not.toHaveProperty('apiKeyEncrypted');
    });

    it('returns null when no config exists', async () => {
      mockPrisma.agentLlmConfig.findFirst.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/llm' });
      const body = JSON.parse(res.body);

      expect(body.data).toBeNull();
    });
  });

  describe('PUT /llm', () => {
    it('updates LLM config', async () => {
      const existing = { id: '1', provider: 'openai' };
      const updated = { ...existing, model: 'gpt-4o', apiKeyEncrypted: 'k', fallbackApiKeyEncrypted: null };
      mockPrisma.agentLlmConfig.findFirst.mockResolvedValue(existing);
      mockPrisma.agentLlmConfig.update.mockResolvedValue(updated);

      const res = await app.inject({
        method: 'PUT',
        url: '/llm',
        payload: { model: 'gpt-4o' },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('Permission check', () => {
    it('returns 403 for regular USER', async () => {
      const userApp = buildApp(regularUser);
      await userApp.ready();

      const res = await userApp.inject({ method: 'GET', url: '/stats' });
      expect(res.statusCode).toBe(403);

      await userApp.close();
    });
  });

  describe('POST /roles/:conversationId/:userId/assign', () => {
    it('assigns archetype to user', async () => {
      const role = { id: '1', userId: '507f1f77bcf86cd799439012', origin: 'archetype', archetypeId: 'curious' };
      mockPrisma.agentUserRole.upsert.mockResolvedValue(role);

      const res = await app.inject({
        method: 'POST',
        url: '/roles/507f1f77bcf86cd799439099/507f1f77bcf86cd799439012/assign',
        payload: { archetypeId: 'curious' },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.archetypeId).toBe('curious');
    });

    it('returns 404 for unknown archetype', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/roles/507f1f77bcf86cd799439099/507f1f77bcf86cd799439012/assign',
        payload: { archetypeId: 'nonexistent' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /roles/:conversationId/:userId/unlock', () => {
    it('unlocks role', async () => {
      const role = { id: '1', locked: false, confidence: 0 };
      mockPrisma.agentUserRole.update.mockResolvedValue(role);

      const res = await app.inject({
        method: 'POST',
        url: '/roles/507f1f77bcf86cd799439099/507f1f77bcf86cd799439012/unlock',
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.locked).toBe(false);
    });
  });
});
