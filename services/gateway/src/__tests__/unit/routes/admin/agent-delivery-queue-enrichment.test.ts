/**
 * `GET /admin/agent/delivery-queue` nomme ce que la file ne porte qu'en
 * identifiants : la conversation (`conversation: { id, title }` + l'aperçu des
 * membres pour une conversation sans titre) et le membre joué
 * (`persona: { id, username, displayName }`). Lecture GROUPÉE : une requête par
 * collection pour toute la file, jamais une par élément.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockAgentClient = {
  invalidateCache: jest.fn<any>().mockResolvedValue({ invalidated: true }),
  getQueue: jest.fn<any>().mockResolvedValue([]),
  deleteQueueItem: jest.fn<any>(),
  editQueueItem: jest.fn<any>(),
  stopScan: jest.fn<any>(),
};

jest.mock('../../../../services/AgentHttpClient', () => ({
  AgentUnavailableError: class AgentUnavailableError extends Error {},
  AgentHttpClient: jest.fn().mockImplementation(() => mockAgentClient),
}));

jest.mock('../../../../services/CacheStore', () => {
  const store = {
    publish: jest.fn<any>().mockResolvedValue(1),
    set: jest.fn<any>().mockResolvedValue(undefined),
    get: jest.fn<any>().mockResolvedValue(null),
    del: jest.fn<any>().mockResolvedValue(undefined),
    keys: jest.fn<any>().mockResolvedValue([]),
  };
  return { getCacheStore: () => store };
});

import { agentAdminRoutes } from '../../../../routes/admin/agent';

const CONV_TITREE = '507f1f77bcf86cd799439a01';
const CONV_DIRECTE = '507f1f77bcf86cd799439a02';
const PERSONA_A = '507f1f77bcf86cd799439b01';
const PERSONA_B = '507f1f77bcf86cd799439b02';

const adminUser = { id: '507f1f77bcf86cd799439011', role: 'ADMIN', username: 'admin', email: 'a@test.com' };

const item = (id: string, conversationId: string, asUserId: string) => ({
  id,
  conversationId,
  scheduledAt: 1_700_000_000_000,
  remainingMs: 60_000,
  mergeCount: 0,
  action: { type: 'message', asUserId, content: 'Bonjour', originalLanguage: 'fr' },
});

function makePrisma() {
  return {
    conversation: {
      findMany: jest.fn<any>().mockImplementation(async (args: any) => {
        // Deux appels : les titres (select.title), puis l'aperçu des membres
        // des conversations sans titre (select.participants).
        if (args.select?.participants) {
          return [
            {
              id: CONV_DIRECTE,
              _count: { participants: 2 },
              participants: [
                { displayName: null, user: { username: 'awa', displayName: 'Awa Diop' } },
                { displayName: null, user: { username: 'jean', displayName: null } },
              ],
            },
          ];
        }
        return [
          { id: CONV_TITREE, title: 'Famille' },
          { id: CONV_DIRECTE, title: null },
        ];
      }),
    },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: PERSONA_A, username: 'persona_a', displayName: 'Persona A', avatar: null },
        { id: PERSONA_B, username: 'persona_b', displayName: null, avatar: null },
      ]),
    },
    agentGlobalConfig: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  process.env.AGENT_HOST = 'localhost';
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: adminUser };
  });
  app.register(agentAdminRoutes);
  await app.ready();
  return app;
}

describe('GET /delivery-queue — la file nomme sa conversation et son membre joué', () => {
  let app: FastifyInstance | null = null;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
  });

  afterEach(async () => {
    if (app) await app.close();
    app = null;
    delete process.env.AGENT_HOST;
  });

  it('sert conversation { id, title } et persona { id, username, displayName } sur chaque élément', async () => {
    mockAgentClient.getQueue.mockResolvedValue([
      item('q1', CONV_TITREE, PERSONA_A),
      item('q2', CONV_DIRECTE, PERSONA_B),
    ]);
    app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/delivery-queue' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    const [q1, q2] = body.data;
    // Les champs d'origine restent servis tels quels.
    expect(q1.id).toBe('q1');
    expect(q1.conversationId).toBe(CONV_TITREE);
    expect(q1.action.asUserId).toBe(PERSONA_A);
    expect(q1.action.content).toBe('Bonjour');

    expect(q1.conversation).toEqual({ id: CONV_TITREE, title: 'Famille' });
    expect(q1.persona).toEqual({ id: PERSONA_A, username: 'persona_a', displayName: 'Persona A' });

    expect(q2.conversation).toEqual({
      id: CONV_DIRECTE,
      title: null,
      participants: [
        { displayName: 'Awa Diop', username: 'awa' },
        { displayName: null, username: 'jean' },
      ],
      total: 2,
    });
    expect(q2.persona).toEqual({ id: PERSONA_B, username: 'persona_b', displayName: null });
  });

  it('lecture groupée : une requête de comptes et deux de conversations au plus, quelle que soit la taille de la file', async () => {
    mockAgentClient.getQueue.mockResolvedValue([
      item('q1', CONV_TITREE, PERSONA_A),
      item('q2', CONV_TITREE, PERSONA_A),
      item('q3', CONV_DIRECTE, PERSONA_B),
      item('q4', CONV_DIRECTE, PERSONA_B),
      item('q5', CONV_TITREE, PERSONA_B),
    ]);
    app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: '/delivery-queue' });

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany.mock.calls[0][0].where.id.in.sort()).toEqual([PERSONA_A, PERSONA_B].sort());
    expect(prisma.conversation.findMany.mock.calls.length).toBeLessThanOrEqual(2);
    expect(prisma.conversation.findMany.mock.calls[0][0].where.id.in.sort()).toEqual([CONV_TITREE, CONV_DIRECTE].sort());
  });

  it('une conversation ou un compte introuvable donne null, sans retirer l\'élément', async () => {
    const ABSENT = '507f1f77bcf86cd799439c09';
    mockAgentClient.getQueue.mockResolvedValue([item('q1', ABSENT, ABSENT)]);
    prisma.conversation.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    app = await buildApp(prisma);

    const body = JSON.parse((await app.inject({ method: 'GET', url: '/delivery-queue' })).body);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('q1');
    expect(body.data[0].conversation).toBeNull();
    expect(body.data[0].persona).toBeNull();
  });

  it('file vide : aucune requête en base', async () => {
    mockAgentClient.getQueue.mockResolvedValue([]);
    app = await buildApp(prisma);

    const body = JSON.parse((await app.inject({ method: 'GET', url: '/delivery-queue' })).body);

    expect(body.data).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it('une lecture en base qui échoue ne prive pas l\'administrateur de la file', async () => {
    mockAgentClient.getQueue.mockResolvedValue([item('q1', CONV_TITREE, PERSONA_A)]);
    prisma.conversation.findMany.mockRejectedValue(new Error('db down'));
    app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: '/delivery-queue' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data[0].id).toBe('q1');
    expect(body.data[0].action.asUserId).toBe(PERSONA_A);
  });
});
