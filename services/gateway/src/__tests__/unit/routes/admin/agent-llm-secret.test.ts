/**
 * La clé d'API du fournisseur LLM est chiffrée AU REPOS et n'est jamais servie
 * en clair (`PUT /admin/agent/llm`, `GET /admin/agent/llm`).
 *
 * Témoins sur l'EFFET : ce que Prisma reçoit dans `data`, et le corps servi.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { randomBytes } from 'crypto';

jest.mock('../../../../services/CacheStore', () => {
  const store = {
    publish: jest.fn<any>().mockResolvedValue(1),
    set: jest.fn<any>().mockResolvedValue(undefined),
    get: jest.fn<any>().mockResolvedValue(null),
    del: jest.fn<any>().mockResolvedValue(undefined),
  };
  return { getCacheStore: () => store };
});

import { agentAdminRoutes } from '../../../../routes/admin/agent';
import { SECRETS_AT_REST_KEY_ENV, openSecret, sealSecret } from '../../../../utils/secret-at-rest';

const CLE = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUV9876';
const CLE_SECOURS = 'sk-ant-secours-ZYXWVUTSRQPO5555';
const CTX_PRIMAIRE = 'AgentLlmConfig.apiKey';
const CTX_SECOURS = 'AgentLlmConfig.fallbackApiKey';

const bigbossUser = { id: '507f1f77bcf86cd799439098', role: 'BIGBOSS', username: 'bigboss', email: 'b@test.com' };
const adminUser = { id: '507f1f77bcf86cd799439011', role: 'ADMIN', username: 'admin', email: 'a@test.com' };

function makePrisma() {
  return {
    agentGlobalConfig: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    agentLlmConfig: {
      findFirst: jest.fn<any>(),
      // Prisma rend la ligne écrite : le double renvoie ce qu'il a reçu.
      update: jest.fn<any>().mockImplementation(async (args: any) => ({ id: 'llm1', provider: 'openai', ...args.data })),
      create: jest.fn<any>().mockImplementation(async (args: any) => ({ id: 'llm1', ...args.data })),
    },
    adminAuditLog: { create: jest.fn<any>().mockResolvedValue({}) },
  };
}

async function buildApp(
  prisma: ReturnType<typeof makePrisma>,
  user = bigbossUser,
  logLines?: string[],
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logLines ? { level: 'trace', stream: { write: (line: string) => { logLines.push(line); } } } : false,
  });
  app.decorate('prisma', prisma as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: user };
  });
  app.register(agentAdminRoutes);
  await app.ready();
  return app;
}

describe('AgentLlmConfig — la clé d\'API est chiffrée au repos', () => {
  const saved = { key: process.env[SECRETS_AT_REST_KEY_ENV], nodeEnv: process.env.NODE_ENV };
  let prisma: ReturnType<typeof makePrisma>;
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    process.env[SECRETS_AT_REST_KEY_ENV] = randomBytes(32).toString('base64');
    process.env.NODE_ENV = 'test';
    prisma = makePrisma();
  });

  afterEach(async () => {
    if (app) await app.close();
    app = null;
    if (saved.key === undefined) delete process.env[SECRETS_AT_REST_KEY_ENV];
    else process.env[SECRETS_AT_REST_KEY_ENV] = saved.key;
    if (saved.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.nodeEnv;
  });

  it('PUT (mise à jour) : la colonne reçoit la clé SCELLÉE, jamais le clair, et elle se rouvre', async () => {
    prisma.agentLlmConfig.findFirst.mockResolvedValue({ id: 'llm1', provider: 'openai', apiKeyEncrypted: '', fallbackApiKeyEncrypted: null });
    app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PUT',
      url: '/llm',
      payload: { model: 'gpt-4o', apiKeyEncrypted: CLE, fallbackApiKeyEncrypted: CLE_SECOURS },
    });

    expect(res.statusCode).toBe(200);
    const data = prisma.agentLlmConfig.update.mock.calls[0][0].data;
    expect(data.apiKeyEncrypted).toMatch(/^v1:/);
    expect(data.apiKeyEncrypted).not.toContain(CLE);
    expect(openSecret(data.apiKeyEncrypted, CTX_PRIMAIRE)).toBe(CLE);
    expect(data.fallbackApiKeyEncrypted).toMatch(/^v1:/);
    expect(openSecret(data.fallbackApiKeyEncrypted, CTX_SECOURS)).toBe(CLE_SECOURS);
    expect(data.model).toBe('gpt-4o');
  });

  it('PUT (création) : la colonne reçoit la clé scellée', async () => {
    prisma.agentLlmConfig.findFirst.mockResolvedValue(null);
    app = await buildApp(prisma);

    const res = await app.inject({ method: 'PUT', url: '/llm', payload: { provider: 'openai', model: 'gpt-4', apiKeyEncrypted: CLE } });

    expect(res.statusCode).toBe(200);
    const data = prisma.agentLlmConfig.create.mock.calls[0][0].data;
    expect(data.apiKeyEncrypted).not.toContain(CLE);
    expect(openSecret(data.apiKeyEncrypted, CTX_PRIMAIRE)).toBe(CLE);
  });

  it('PUT : la réponse ne sert ni la clé ni sa forme scellée — seulement hasApiKey et les 4 derniers caractères', async () => {
    prisma.agentLlmConfig.findFirst.mockResolvedValue({ id: 'llm1', provider: 'openai', apiKeyEncrypted: '' });
    app = await buildApp(prisma);

    const res = await app.inject({ method: 'PUT', url: '/llm', payload: { apiKeyEncrypted: CLE } });
    const body = JSON.parse(res.body);
    const sealed = prisma.agentLlmConfig.update.mock.calls[0][0].data.apiKeyEncrypted;

    expect(res.body).not.toContain(CLE);
    expect(res.body).not.toContain(sealed);
    expect(body.data).not.toHaveProperty('apiKeyEncrypted');
    expect(body.data.hasApiKey).toBe(true);
    expect(body.data.apiKeyLast4).toBe('9876');
  });

  it('rétrocompatibilité : une clé déjà stockée en clair est re-scellée à la prochaine écriture', async () => {
    prisma.agentLlmConfig.findFirst.mockResolvedValue({
      id: 'llm1', provider: 'openai', apiKeyEncrypted: CLE, fallbackApiKeyEncrypted: CLE_SECOURS,
    });
    app = await buildApp(prisma);

    const res = await app.inject({ method: 'PUT', url: '/llm', payload: { model: 'gpt-4o' } });

    expect(res.statusCode).toBe(200);
    const data = prisma.agentLlmConfig.update.mock.calls[0][0].data;
    expect(openSecret(data.apiKeyEncrypted, CTX_PRIMAIRE)).toBe(CLE);
    expect(data.apiKeyEncrypted).not.toContain(CLE);
    expect(openSecret(data.fallbackApiKeyEncrypted, CTX_SECOURS)).toBe(CLE_SECOURS);
  });

  it('une clé déjà scellée n\'est pas réécrite par une écriture qui ne la touche pas', async () => {
    const sealed = sealSecret(CLE, CTX_PRIMAIRE);
    prisma.agentLlmConfig.findFirst.mockResolvedValue({ id: 'llm1', provider: 'openai', apiKeyEncrypted: sealed, fallbackApiKeyEncrypted: null });
    app = await buildApp(prisma);

    await app.inject({ method: 'PUT', url: '/llm', payload: { model: 'gpt-4o' } });

    expect(prisma.agentLlmConfig.update.mock.calls[0][0].data).toEqual({ model: 'gpt-4o' });
  });

  it('production sans clé de chiffrement : une écriture qui porte une clé est REFUSÉE, rien n\'est écrit', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env[SECRETS_AT_REST_KEY_ENV];
    prisma.agentLlmConfig.findFirst.mockResolvedValue({ id: 'llm1', provider: 'openai', apiKeyEncrypted: '' });
    app = await buildApp(prisma);

    const res = await app.inject({ method: 'PUT', url: '/llm', payload: { apiKeyEncrypted: CLE } });

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain(CLE);
    expect(prisma.agentLlmConfig.update).not.toHaveBeenCalled();
    expect(prisma.agentLlmConfig.create).not.toHaveBeenCalled();
  });

  it('production sans clé de chiffrement : une écriture qui ne porte pas de clé passe', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env[SECRETS_AT_REST_KEY_ENV];
    prisma.agentLlmConfig.findFirst.mockResolvedValue({ id: 'llm1', provider: 'openai', apiKeyEncrypted: '' });
    app = await buildApp(prisma);

    const res = await app.inject({ method: 'PUT', url: '/llm', payload: { model: 'gpt-4o' } });

    expect(res.statusCode).toBe(200);
    expect(prisma.agentLlmConfig.update.mock.calls[0][0].data).toEqual({ model: 'gpt-4o' });
  });

  it('GET : ni la clé, ni sa forme scellée ne sont servies ; hasApiKey et apiKeyLast4 le sont', async () => {
    const sealed = sealSecret(CLE, CTX_PRIMAIRE);
    prisma.agentLlmConfig.findFirst.mockResolvedValue({
      id: 'llm1', provider: 'openai', model: 'gpt-4o', apiKeyEncrypted: sealed, fallbackApiKeyEncrypted: CLE_SECOURS,
    });
    app = await buildApp(prisma, adminUser);

    const res = await app.inject({ method: 'GET', url: '/llm' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(CLE);
    expect(res.body).not.toContain(sealed);
    expect(res.body).not.toContain(CLE_SECOURS);
    expect(body.data).not.toHaveProperty('apiKeyEncrypted');
    expect(body.data).not.toHaveProperty('fallbackApiKeyEncrypted');
    expect(body.data.hasApiKey).toBe(true);
    expect(body.data.apiKeyLast4).toBe('9876');
    expect(body.data.hasFallbackApiKey).toBe(true);
    expect(body.data.fallbackApiKeyLast4).toBe('5555');
  });

  it('GET : sans clé configurée, hasApiKey est faux et aucun indice n\'est servi', async () => {
    prisma.agentLlmConfig.findFirst.mockResolvedValue({ id: 'llm1', provider: 'openai', apiKeyEncrypted: '', fallbackApiKeyEncrypted: null });
    app = await buildApp(prisma, adminUser);

    const body = JSON.parse((await app.inject({ method: 'GET', url: '/llm' })).body);

    expect(body.data.hasApiKey).toBe(false);
    expect(body.data.apiKeyLast4).toBeNull();
    expect(body.data.hasFallbackApiKey).toBe(false);
    expect(body.data.fallbackApiKeyLast4).toBeNull();
  });

  it('PUT : ni le journal d\'audit ni les journaux ne portent la clé, en clair ou scellée', async () => {
    prisma.agentLlmConfig.findFirst.mockResolvedValue({ id: 'llm1', provider: 'openai', apiKeyEncrypted: '', fallbackApiKeyEncrypted: null });
    const logLines: string[] = [];
    app = await buildApp(prisma, bigbossUser, logLines);

    const res = await app.inject({
      method: 'PUT',
      url: '/llm',
      payload: { apiKeyEncrypted: CLE, fallbackApiKeyEncrypted: CLE_SECOURS, reason: 'rotation de la clé du fournisseur' },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.adminAuditLog.create).toHaveBeenCalled();
    const audit = JSON.stringify(prisma.adminAuditLog.create.mock.calls);
    const journaux = logLines.join('\n');
    for (const trace of [audit, journaux]) {
      expect(trace).not.toContain(CLE);
      expect(trace).not.toContain(CLE_SECOURS);
      expect(trace).not.toContain('v1:');
    }
  });

  it('PUT met à jour la MÊME ligne que celle que le GET sert (la plus récemment modifiée)', async () => {
    const recente = { id: 'llm-recente', provider: 'openai', apiKeyEncrypted: '', fallbackApiKeyEncrypted: null };
    const ancienne = { id: 'llm-ancienne', provider: 'openai', apiKeyEncrypted: '', fallbackApiKeyEncrypted: null };
    prisma.agentLlmConfig.findFirst.mockImplementation(async (args: any) =>
      args?.orderBy?.updatedAt === 'desc' ? recente : ancienne,
    );
    app = await buildApp(prisma);

    const lu = JSON.parse((await app.inject({ method: 'GET', url: '/llm' })).body);
    await app.inject({ method: 'PUT', url: '/llm', payload: { model: 'gpt-4o' } });

    expect(lu.data.id).toBe('llm-recente');
    expect(prisma.agentLlmConfig.update.mock.calls[0][0].where).toEqual({ id: lu.data.id });
  });
});
