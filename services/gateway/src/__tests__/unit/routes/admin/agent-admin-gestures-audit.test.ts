/**
 * Agent — chaque geste d'administration qui ÉCRIT laisse sa ligne au journal
 * (spec 2026-10-04 § 4), et trois corrections de lecture (audit 2026-10-04) :
 *
 * - `GET /configs/:id/live` rendait un état vide pour une conversation SANS
 *   configuration (et `isScanning: false`, indiscernable d'un agent au repos) :
 *   404, comme `/schedule` ;
 * - `POST /configs/:id/trigger` annonçait `triggered: true` même agent
 *   désactivé (localement ou globalement) : `triggered: false` + `reason` ;
 * - les membres pilotés servaient `systemLanguage ?? 'fr'` (une langue
 *   INVENTÉE) et pas de `username` : ils servent `username` et `language`
 *   (la langue résolue par le Prisme, `null` si aucune).
 *
 * @jest-environment node
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const agentClient = {
  invalidateCache: jest.fn(async () => ({ invalidated: true })),
  getQueue: jest.fn(async () => []),
  deleteQueueItem: jest.fn(async () => ({ deleted: true })),
  editQueueItem: jest.fn(async () => ({ id: 'q1', content: 'x' })),
  stopScan: jest.fn(async () => undefined),
};
jest.mock('../../../../services/AgentHttpClient', () => ({
  AgentUnavailableError: class AgentUnavailableError extends Error {},
  AgentHttpClient: jest.fn().mockImplementation(() => agentClient),
}));
jest.mock('../../../../services/CacheStore', () => {
  const store = {
    publish: jest.fn(async () => 1), set: jest.fn(async () => undefined), get: jest.fn(async () => null),
    del: jest.fn(async () => undefined), keys: jest.fn(async () => []),
  };
  return { getCacheStore: () => store };
});

import { agentAdminRoutes } from '../../../../routes/admin/agent';
import { agentTopicsRoutes } from '../../../../routes/admin/agent-topics';

type AnyRecord = Record<string, unknown>;
const ADMIN = '507f1f77bcf86cd799439011';
const CONV = '507f1f77bcf86cd799439022';
const USER = '507f1f77bcf86cd799439033';
const TOPIC = '507f1f77bcf86cd799439044';

/** Un modèle Prisma permissif : chaque méthode rend une ligne plausible. */
function modele(over: AnyRecord = {}): AnyRecord {
  return {
    findUnique: jest.fn(async () => ({ id: 'x', conversationId: CONV, enabled: true })),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    create: jest.fn(async (a: { data: AnyRecord }) => ({ id: TOPIC, ...a.data })),
    update: jest.fn(async (a: { data: AnyRecord }) => ({ id: TOPIC, ...a.data })),
    upsert: jest.fn(async (a: { create: AnyRecord }) => ({ id: 'cfg', ...a.create })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    delete: jest.fn(async () => ({})),
    deleteMany: jest.fn(async () => ({ count: 0 })),
    count: jest.fn(async () => 0),
    ...over,
  };
}

function prisma() {
  const audit = jest.fn(async (_a: { data: AnyRecord }) => ({}));
  const p: AnyRecord = {
    agentConfig: modele(),
    agentUserRole: modele({ upsert: jest.fn(async () => ({ id: 'r1', userId: USER, conversationId: CONV })), update: jest.fn(async () => ({ id: 'r1', locked: false })) }),
    agentConversationSummary: modele(),
    agentAnalytic: modele(),
    agentGlobalProfile: modele(),
    agentGlobalConfig: modele({ findFirst: jest.fn(async () => ({ id: 'g1', enabled: true })) }),
    agentTopicCatalog: modele(),
    agentLlmConfig: modele(),
    user: modele({ findMany: jest.fn(async () => []) }),
    adminAuditLog: { create: audit },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  return { p, audit };
}

async function build(p: AnyRecord): Promise<FastifyInstance> {
  process.env.AGENT_HOST = 'agent.test';
  const app = Fastify({ logger: false });
  app.decorate('prisma', p as never);
  app.decorate('authenticate', async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, userId: ADMIN, registeredUser: { id: ADMIN, role: 'BIGBOSS' } };
  });
  await app.register(agentAdminRoutes);
  await app.register(agentTopicsRoutes);
  await app.ready();
  return app;
}

const actions = (audit: jest.Mock) => audit.mock.calls.map((c) => ((c[0] as { data: AnyRecord }).data));

describe('agent — chaque geste qui écrit laisse sa ligne', () => {
  it.each([
    ['PUT', `/configs/${CONV}`, { enabled: true }, 'AGENT_CONFIG_UPDATED', CONV],
    ['DELETE', `/configs/${CONV}`, undefined, 'AGENT_CONFIG_DELETED', CONV],
    ['POST', `/configs/${CONV}/stop`, {}, 'AGENT_SCAN_STOPPED', CONV],
    ['POST', `/configs/${CONV}/trigger`, {}, 'AGENT_SCAN_TRIGGERED', CONV],
    ['PUT', '/global-config', { enabled: true }, 'AGENT_GLOBAL_CONFIG_UPDATED', 'global'],
    ['DELETE', `/reset/conversation/${CONV}`, undefined, 'AGENT_CONVERSATION_RESET', CONV],
    ['DELETE', `/reset/user/${USER}`, undefined, 'AGENT_USER_RESET', USER],
    ['DELETE', '/delivery-queue/q1', undefined, 'AGENT_QUEUE_ITEM_DELETED', 'q1'],
    ['PATCH', '/delivery-queue/q1', { content: 'bonjour' }, 'AGENT_QUEUE_ITEM_EDITED', 'q1'],
    ['POST', `/roles/${CONV}/${USER}/unlock`, {}, 'AGENT_ROLE_UNLOCKED', USER],
    ['PATCH', `/topics/${TOPIC}`, { name: 'Météo' }, 'AGENT_TOPIC_UPDATED', TOPIC],
    ['DELETE', `/topics/${TOPIC}`, undefined, 'AGENT_TOPIC_DELETED', TOPIC],
  ])('%s %s → %s', async (method, url, payload, action, entityId) => {
    const { p, audit } = prisma();
    const app = await build(p);
    const res = await app.inject({ method: method as 'GET', url, ...(payload === undefined ? {} : { payload: payload as AnyRecord }) });
    expect(res.statusCode).toBe(200);
    const ligne = actions(audit).find((d) => d.action === action);
    expect(ligne).toMatchObject({ adminId: ADMIN, entityId });
    await app.close();
  });
});

describe('agent — lectures et déclenchement honnêtes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /configs/:id/live → 404 sans configuration', async () => {
    const { p } = prisma();
    (p.agentConfig as AnyRecord).findUnique = jest.fn(async () => null);
    const app = await build(p);
    expect((await app.inject({ method: 'GET', url: `/configs/${CONV}/live` })).statusCode).toBe(404);
    await app.close();
  });

  it('les membres pilotés servent username et la langue RÉSOLUE, jamais un « fr » inventé', async () => {
    const { p } = prisma();
    (p.agentUserRole as AnyRecord).findMany = jest.fn(async () => [{ userId: USER, confidence: 0.8, locked: false }]);
    (p.user as AnyRecord).findMany = jest.fn(async () => [{ id: USER, username: 'awa', displayName: 'Awa', systemLanguage: null, regionalLanguage: 'wo', customDestinationLanguage: null }]);
    const app = await build(p);
    const data = (await app.inject({ method: 'GET', url: `/configs/${CONV}/live` })).json().data;
    expect(data.controlledUsers[0]).toMatchObject({ userId: USER, username: 'awa', language: 'wo' });
    await app.close();
  });

  it.each([
    ['la configuration est désactivée', { enabled: false }, { id: 'g1', enabled: true }, 'CONVERSATION_DISABLED'],
    ["l'agent est désactivé globalement", { enabled: true }, { id: 'g1', enabled: false }, 'GLOBAL_DISABLED'],
  ])('POST /trigger → triggered: false quand %s', async (_nom, config, global, reason) => {
    const { p } = prisma();
    (p.agentConfig as AnyRecord).findUnique = jest.fn(async () => ({ id: 'c', conversationId: CONV, ...config }));
    (p.agentGlobalConfig as AnyRecord).findFirst = jest.fn(async () => global);
    const app = await build(p);
    const data = (await app.inject({ method: 'POST', url: `/configs/${CONV}/trigger`, payload: {} })).json().data;
    expect(data).toMatchObject({ triggered: false, reason });
    await app.close();
  });
});
