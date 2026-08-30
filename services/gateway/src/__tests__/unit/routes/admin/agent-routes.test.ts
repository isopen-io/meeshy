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

import { agentAdminRoutes } from '../../../../routes/admin/agent';

const { __cacheStoreMock: cacheStoreMock } = jest.requireMock('../../../../services/CacheStore') as {
  __cacheStoreMock: { publish: jest.Mock; set: jest.Mock; get: jest.Mock; del: jest.Mock };
};

function adminEventsPublished(): Array<{ kind: string; conversationId?: string }> {
  return cacheStoreMock.publish.mock.calls
    .filter(([channel]) => channel === 'agent:admin-event')
    .map(([, message]) => JSON.parse(message as string));
}

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
  agentAnalytic: {
    aggregate: jest.fn<any>(),
    findMany: jest.fn<any>(),
  },
  // #4157 — `PUT /llm` (S6) écrit sa trace ici.
  adminAuditLog: {
    create: jest.fn<any>(),
  },
};

const adminUser = {
  id: '507f1f77bcf86cd799439011',
  role: 'ADMIN',
  username: 'admin',
  email: 'admin@test.com',
};

// #4157 — `PUT /llm` monte en S6 (souverain) : ADMIN n'y suffit plus.
const bigbossUser = {
  id: '507f1f77bcf86cd799439098',
  role: 'BIGBOSS',
  username: 'bigboss',
  email: 'bigboss@test.com',
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
      mockPrisma.agentUserRole.findMany.mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]);
      mockPrisma.agentAnalytic.aggregate.mockResolvedValueOnce({
        _sum: { messagesSent: 0, totalWordsSent: 0 },
        _avg: { avgConfidence: 0 },
      });
      mockPrisma.agentAnalytic.findMany.mockResolvedValueOnce([]);

      const res = await app.inject({ method: 'GET', url: '/stats' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(expect.objectContaining({
        totalConfigs: 10,
        activeConfigs: 3,
        totalRoles: 25,
      }));
      expect(body.data.totalArchetypes).toBeGreaterThan(0);
    });
  });

  describe('GET /configs', () => {
    it('returns paginated configs aggregated by conversation', async () => {
      const configs = [{ id: '1', conversationId: 'c1', enabled: true, manualUserIds: [] }];
      // #4165 — `GET /configs` ne fait plus DEUX appels à chacun de ces trois
      // `findMany` (un pour rassembler l'univers des conversationIds via
      // `select: {conversationId}`, un pour la page) : le premier est
      // retiré, remplacé par le `where` relationnel de `conversation.findMany`
      // ci-dessous (`agentConfig`/`agentAnalytic`/`agentUserRoles` — voir
      // `admin/agent.ts`). Un seul appel désormais par `findMany` : une seule
      // valeur mockée, celle de l'ancien SECOND appel (la donnée de détail).
      // Laisser les deux `mockResolvedValueOnce` chaînés serait pire qu'une
      // valeur fausse pour CE test : `jest.clearAllMocks()` (le `beforeEach`
      // ci-dessus) ne VIDE PAS la queue d'un `mockResolvedValueOnce` non
      // consommé — la valeur en trop fuit alors dans le PROCHAIN test qui
      // rappelle le même mock (mesuré : c'est exactement ce qui faisait
      // échouer le test `GET /configs/:conversationId` juste en dessous).
      mockPrisma.agentConfig.findMany.mockResolvedValueOnce(configs);
      mockPrisma.agentUserRole.findMany.mockResolvedValueOnce([
        { conversationId: 'c1', userId: 'u1' },
        { conversationId: 'c1', userId: 'u2' },
      ]);
      mockPrisma.agentAnalytic.findMany.mockResolvedValueOnce([]);
      mockPrisma.conversation = {
        findMany: jest.fn<any>().mockResolvedValueOnce([
          { id: 'c1', title: 'Conv 1', type: 'group' },
        ]),
        count: jest.fn<any>().mockResolvedValueOnce(1),
      };

      const res = await app.inject({ method: 'GET', url: '/configs?page=1&limit=20' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ conversationId: 'c1', enabled: true });
      expect(body.pagination).toEqual({ total: 1, page: 1, limit: 20, hasMore: false });
    });
  });

  describe('GET /configs/:conversationId', () => {
    it('returns config for conversation with controlledUserIds', async () => {
      const config = { id: '1', conversationId: '507f1f77bcf86cd799439099', enabled: true };
      mockPrisma.agentConfig.findUnique.mockResolvedValue(config);
      mockPrisma.agentUserRole.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u3' },
      ]);

      const res = await app.inject({ method: 'GET', url: '/configs/507f1f77bcf86cd799439099' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data).toEqual({ ...config, controlledUserIds: ['u1', 'u3'] });
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
      expect(adminEventsPublished()).toContainEqual({ kind: 'config', conversationId: '507f1f77bcf86cd799439099' });
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
      expect(body.data.length).toBeGreaterThanOrEqual(5);
      expect(body.data.find((a: { id: string }) => a.id === 'curious')).toHaveProperty('name', 'Le Curieux');
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
    // #4157 — ANTI-TÉMOIN corrigé. Ce test appelait `/llm` sur l'app partagée
    // (ADMIN) sans aucun motif, et attestait un `200` : `baseUrl` étant LIBRE,
    // ADMIN pouvait rediriger tout le trafic LLM — donc le CONTENU des
    // conversations envoyé en contexte — vers un hôte arbitraire, sans laisser
    // de trace. La route monte désormais en S6 (souverain, BIGBOSS seul) et
    // exige un motif écrit, consigné dans AdminAuditLog.
    it('updates LLM config — BIGBOSS avec motif écrit', async () => {
      const existing = { id: '1', provider: 'openai' };
      const updated = { ...existing, model: 'gpt-4o', apiKeyEncrypted: 'k', fallbackApiKeyEncrypted: null };
      mockPrisma.agentLlmConfig.findFirst.mockResolvedValue(existing);
      mockPrisma.agentLlmConfig.update.mockResolvedValue(updated);
      mockPrisma.adminAuditLog.create.mockResolvedValue({});

      const bigbossApp = buildApp(bigbossUser);
      await bigbossApp.ready();

      const res = await bigbossApp.inject({
        method: 'PUT',
        url: '/llm',
        payload: { model: 'gpt-4o', reason: 'Migration vers un modèle plus récent' },
      });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.success).toBe(true);
      // `reason` ne doit JAMAIS atteindre Prisma — `AgentLlmConfig` n'a pas
      // cette colonne, et `withAudit` la porte ailleurs (AdminAuditLog).
      expect(mockPrisma.agentLlmConfig.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { model: 'gpt-4o' },
      });
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
      const auditData = mockPrisma.adminAuditLog.create.mock.calls[0][0].data;
      expect(auditData.action).toBe('AGENT_LLM_CONFIG_UPDATED');
      expect(JSON.parse(auditData.metadata).reason).toBe('Migration vers un modèle plus récent');

      await bigbossApp.close();
    });

    it('refuse ADMIN — le rang souverain (BIGBOSS) est requis (#4157)', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/llm',
        payload: { model: 'gpt-4o', reason: 'Migration vers un modèle plus récent' },
      });
      expect(res.statusCode).toBe(403);
      expect(mockPrisma.agentLlmConfig.update).not.toHaveBeenCalled();
      expect(mockPrisma.agentLlmConfig.create).not.toHaveBeenCalled();
    });

    it('refuse BIGBOSS sans motif écrit — 400 avant toute écriture (#4157)', async () => {
      const bigbossApp = buildApp(bigbossUser);
      await bigbossApp.ready();

      const sansMotif = await bigbossApp.inject({ method: 'PUT', url: '/llm', payload: { model: 'gpt-4o' } });
      expect(sansMotif.statusCode).toBe(400);

      const motifCourt = await bigbossApp.inject({
        method: 'PUT',
        url: '/llm',
        payload: { model: 'gpt-4o', reason: 'court' }, // 5 caractères < minLength: 10
      });
      expect(motifCourt.statusCode).toBe(400);

      expect(mockPrisma.agentLlmConfig.update).not.toHaveBeenCalled();
      await bigbossApp.close();
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
      expect(adminEventsPublished()).toContainEqual({ kind: 'config', conversationId: '507f1f77bcf86cd799439099' });
    });
  });

  describe('POST /configs/:conversationId/trigger', () => {
    it('publishes a scan admin event alongside the trigger', async () => {
      mockPrisma.agentConfig.findUnique.mockResolvedValue({ id: '1', conversationId: '507f1f77bcf86cd799439099' });

      const res = await app.inject({ method: 'POST', url: '/configs/507f1f77bcf86cd799439099/trigger' });
      const body = JSON.parse(res.body);

      expect(res.statusCode).toBe(200);
      expect(body.data.triggered).toBe(true);
      expect(cacheStoreMock.publish).toHaveBeenCalledWith('agent:trigger-scan', JSON.stringify({ conversationId: '507f1f77bcf86cd799439099' }));
      expect(adminEventsPublished()).toContainEqual({ kind: 'scan', conversationId: '507f1f77bcf86cd799439099' });
    });
  });
});
