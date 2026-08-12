import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports that reference these modules
// ---------------------------------------------------------------------------

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { registerContentRoutes } from '../../../../routes/admin/content';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const makeAuthContext = (role = 'ADMIN') => ({
  isAuthenticated: true,
  registeredUser: {
    id: '507f1f77bcf86cd799439011',
    role,
    username: 'admin',
  },
});

const VALID_MONGO_ID = '507f1f77bcf86cd799439012';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockPrisma: any = {
  message: {
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
  },
  community: {
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
  },
  conversationShareLink: {
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
  },
};

function buildApp(role = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = makeAuthContext(role);
  });
  app.register(registerContentRoutes);
  return app;
}

function buildNoAuthApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (_request: any) => {
    // deliberately does NOT set authContext
  });
  app.register(registerContentRoutes);
  return app;
}

function buildPartialAuthApp(authContext: Record<string, any>): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = authContext;
  });
  app.register(registerContentRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /messages
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /messages', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.message.count.mockResolvedValue(0);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 401 when no authContext', async () => {
    const noAuthApp = buildNoAuthApp();
    await noAuthApp.ready();

    const response = await noAuthApp.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(401);
    await noAuthApp.close();
  });

  it('returns 401 when authContext.isAuthenticated is false', async () => {
    const partialApp = buildPartialAuthApp({ isAuthenticated: false, registeredUser: null });
    await partialApp.ready();

    const response = await partialApp.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(401);
    await partialApp.close();
  });

  it('returns 401 when authContext.registeredUser is null', async () => {
    const partialApp = buildPartialAuthApp({ isAuthenticated: true, registeredUser: null });
    await partialApp.ready();

    const response = await partialApp.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(401);
    await partialApp.close();
  });

  it('returns 403 when role lacks canAccessAdmin (USER)', async () => {
    app = buildApp('USER');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(403);
  });

  it('returns 403 when role lacks canAccessAdmin (ANALYST)', async () => {
    const analystApp = buildApp('ANALYST');
    await analystApp.ready();

    const response = await analystApp.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(403);
    await analystApp.close();
  });

  it('returns 403 when role has canAccessAdmin but lacks canModerateContent (AUDIT)', async () => {
    // AUDIT: canAccessAdmin=true, canModerateContent=false
    const auditApp = buildApp('AUDIT');
    await auditApp.ready();

    const response = await auditApp.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(403);
    await auditApp.close();
  });

  it('returns 200 with empty list when no filters (ADMIN)', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(0);
  });

  it('returns 200 with messages list (MODERATOR)', async () => {
    const fakeMessage = {
      id: VALID_MONGO_ID,
      content: 'Hello',
      messageType: 'text',
      originalLanguage: 'en',
      isEdited: false,
      createdAt: new Date(),
      sender: { id: '1', userId: '1', displayName: 'Alice', avatar: null, type: 'user', language: 'en', user: null },
      conversation: { id: '2', identifier: 'conv-1', title: 'Test', type: 'direct' },
      attachments: [],
      _count: { replies: 0 },
    };
    mockPrisma.message.findMany.mockResolvedValue([fakeMessage]);
    mockPrisma.message.count.mockResolvedValue(1);

    const modApp = buildApp('MODERATOR');
    await modApp.ready();

    const response = await modApp.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    await modApp.close();
  });

  it('returns 200 and passes search filter to prisma', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages?search=hello' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.content).toBeDefined();
    expect(call.where.content.contains).toBe('hello');
  });

  it('returns 200 and applies period=today filter (createdAt gte)', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages?period=today' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toBeDefined();
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('returns 200 and applies period=week filter', async () => {
    app = buildApp('BIGBOSS');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages?period=week' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toBeDefined();
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('returns 200 and applies period=month filter', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages?period=month' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toBeDefined();
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('returns 200 and applies type filter', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages?type=audio' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.messageType).toBe('audio');
  });

  it('always filters deletedAt: null', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    await app.inject({ method: 'GET', url: '/messages' });

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.deletedAt).toBeNull();
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.message.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /communities
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /communities', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.community.findMany.mockResolvedValue([]);
    mockPrisma.community.count.mockResolvedValue(0);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 401 when no authContext', async () => {
    const noAuthApp = buildNoAuthApp();
    await noAuthApp.ready();

    const response = await noAuthApp.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(401);
    await noAuthApp.close();
  });

  it('returns 403 when role lacks canAccessAdmin (USER)', async () => {
    app = buildApp('USER');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(403);
  });

  it('returns 403 when role has canAccessAdmin but lacks canManageCommunities (AUDIT)', async () => {
    // AUDIT: canAccessAdmin=true, canManageCommunities=false
    const auditApp = buildApp('AUDIT');
    await auditApp.ready();

    const response = await auditApp.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(403);
    await auditApp.close();
  });

  it('returns 200 with empty list when no filters (ADMIN)', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.total).toBe(0);
  });

  it('returns 200 with communities list (BIGBOSS)', async () => {
    const fakeCommunity = {
      id: VALID_MONGO_ID,
      identifier: 'test-community',
      name: 'Test Community',
      description: 'A test community',
      avatar: null,
      isPrivate: false,
      createdAt: new Date(),
      creator: { id: '1', username: 'alice', displayName: 'Alice', avatar: null },
      _count: { members: 5, Conversation: 2 },
    };
    mockPrisma.community.findMany.mockResolvedValue([fakeCommunity]);
    mockPrisma.community.count.mockResolvedValue(1);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    await bigbossApp.close();
  });

  it('returns 200 and passes search filter to prisma (OR clause)', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities?search=test' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.community.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR[0].name.contains).toBe('test');
    expect(call.where.OR[1].identifier.contains).toBe('test');
    expect(call.where.OR[2].description.contains).toBe('test');
  });

  it('returns 200 and applies isPrivate=true filter', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities?isPrivate=true' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.community.findMany.mock.calls[0][0];
    expect(call.where.isPrivate).toBe(true);
  });

  it('returns 200 and applies isPrivate=false filter', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities?isPrivate=false' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.community.findMany.mock.calls[0][0];
    expect(call.where.isPrivate).toBe(false);
  });

  it('returns 200 with MODERATOR role (has canManageCommunities)', async () => {
    // MODERATOR: canAccessAdmin=true, canManageCommunities=true
    const modApp = buildApp('MODERATOR');
    await modApp.ready();

    const response = await modApp.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(200);
    await modApp.close();
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.community.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /translations
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /translations', () => {
  let app: FastifyInstance;

  const makeTranslationsField = () => ({
    fr: { text: 'Bonjour', translationModel: 'nllb', createdAt: new Date() },
    en: { text: 'Hello', translationModel: 'nllb', createdAt: new Date() },
  });

  const makeFakeMessageWithTranslations = (overrides: any = {}) => ({
    id: VALID_MONGO_ID,
    content: 'Hola',
    originalLanguage: 'es',
    translations: makeTranslationsField(),
    createdAt: new Date(),
    sender: { id: '1', userId: '1', displayName: 'Alice', user: { username: 'alice' } },
    conversation: { id: '2', identifier: 'conv-1', title: 'Test' },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.message.findMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 401 when no authContext', async () => {
    const noAuthApp = buildNoAuthApp();
    await noAuthApp.ready();

    const response = await noAuthApp.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(401);
    await noAuthApp.close();
  });

  it('returns 403 when role lacks canAccessAdmin (USER)', async () => {
    app = buildApp('USER');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(403);
  });

  it('returns 403 when role has canAccessAdmin but lacks canManageTranslations (MODERATOR)', async () => {
    // MODERATOR: canAccessAdmin=true, canManageTranslations=false
    const modApp = buildApp('MODERATOR');
    await modApp.ready();

    const response = await modApp.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(403);
    await modApp.close();
  });

  it('returns 403 when ADMIN lacks canManageTranslations', async () => {
    // ADMIN: canAccessAdmin=true, canManageTranslations=false
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(403);
  });

  it('returns 200 with denormalized translations (BIGBOSS)', async () => {
    mockPrisma.message.findMany.mockResolvedValue([makeFakeMessageWithTranslations()]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    // One message with 2 language keys → 2 flat translation entries
    expect(body.data).toHaveLength(2);
    const langs = body.data.map((t: any) => t.targetLanguage).sort();
    expect(langs).toEqual(['en', 'fr']);
    expect(body.pagination.total).toBe(2);
    await bigbossApp.close();
  });

  it('returns 200 with empty list when no messages with translations (BIGBOSS)', async () => {
    mockPrisma.message.findMany.mockResolvedValue([]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
    await bigbossApp.close();
  });

  it('returns 200 and passes sourceLanguage filter to prisma query', async () => {
    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?sourceLanguage=es' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.originalLanguage).toBe('es');
    await bigbossApp.close();
  });

  it('returns 200 and applies period=today filter to prisma query', async () => {
    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?period=today' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toBeDefined();
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    await bigbossApp.close();
  });

  it('returns 200 and applies period=week filter to prisma query', async () => {
    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?period=week' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toBeDefined();
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    await bigbossApp.close();
  });

  it('filters by targetLanguage in-memory after denormalization', async () => {
    mockPrisma.message.findMany.mockResolvedValue([makeFakeMessageWithTranslations()]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?targetLanguage=fr' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // Only 'fr' entry survives the in-memory filter
    expect(body.data).toHaveLength(1);
    expect(body.data[0].targetLanguage).toBe('fr');
    expect(body.pagination.total).toBe(1);
    // targetLanguage must NOT reach the Prisma WHERE (it is not a Message field)
    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.targetLanguage).toBeUndefined();
    await bigbossApp.close();
  });

  it('includes translations.not.null in prisma where clause', async () => {
    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    await bigbossApp.inject({ method: 'GET', url: '/translations' });

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.translations).toBeDefined();
    expect(call.where.translations.not).toBeNull();
    await bigbossApp.close();
  });

  it('denormalizes translation entries with correct shape', async () => {
    mockPrisma.message.findMany.mockResolvedValue([makeFakeMessageWithTranslations()]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations' });
    const body = JSON.parse(response.body);

    const entry = body.data.find((t: any) => t.targetLanguage === 'fr');
    expect(entry).toBeDefined();
    expect(entry.sourceLanguage).toBe('es');
    expect(entry.translatedContent).toBe('Bonjour');
    expect(entry.translationModel).toBe('nllb');
    expect(entry.message).toBeDefined();
    expect(entry.message.id).toBe(VALID_MONGO_ID);
    await bigbossApp.close();
  });

  it('returns 200 and applies period=month filter to prisma query', async () => {
    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?period=month' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.message.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toBeDefined();
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    await bigbossApp.close();
  });

  it('falls back to sourceLanguage=unknown when message has no originalLanguage', async () => {
    const msgNoLang = {
      id: VALID_MONGO_ID,
      content: 'Hello',
      originalLanguage: null,
      createdAt: new Date(),
      translations: {
        fr: { text: 'Bonjour', translationModel: 'nllb', createdAt: new Date() },
      },
      sender: { id: '1', userId: '1', displayName: 'Alice', user: { username: 'alice' } },
      conversation: { id: '2', identifier: 'conv-1', title: 'Test' },
    };
    mockPrisma.message.findMany.mockResolvedValue([msgNoLang]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?targetLanguage=fr' });
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].sourceLanguage).toBe('unknown');
    await bigbossApp.close();
  });

  it('preserves confidenceScore of 0 (numeric zero is a valid score)', async () => {
    const msgZeroScore = {
      ...makeFakeMessageWithTranslations(),
      translations: {
        fr: { text: 'Bonjour', translationModel: 'nllb', createdAt: new Date(), confidenceScore: 0 },
      },
    };
    mockPrisma.message.findMany.mockResolvedValue([msgZeroScore]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?targetLanguage=fr' });
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].confidenceScore).toBe(0);
    await bigbossApp.close();
  });

  it('returns null confidenceScore when translation entry lacks it', async () => {
    const msgNoScore = {
      ...makeFakeMessageWithTranslations(),
      translations: {
        fr: { text: 'Bonjour', translationModel: 'nllb', createdAt: new Date() }, // no confidenceScore
      },
    };
    mockPrisma.message.findMany.mockResolvedValue([msgNoScore]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?targetLanguage=fr' });
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].confidenceScore).toBeNull();
    await bigbossApp.close();
  });

  it('falls back to message createdAt when translation entry lacks createdAt', async () => {
    const msgDate = new Date('2026-01-15T10:00:00.000Z');
    const msgNoTransDate = {
      id: VALID_MONGO_ID,
      content: 'Hola',
      originalLanguage: 'es',
      createdAt: msgDate,
      translations: {
        fr: { text: 'Bonjour', translationModel: 'nllb' }, // no createdAt
      },
      sender: { id: '1', userId: '1', displayName: 'Alice', user: { username: 'alice' } },
      conversation: { id: '2', identifier: 'conv-1', title: 'Test' },
    };
    mockPrisma.message.findMany.mockResolvedValue([msgNoTransDate]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations?targetLanguage=fr' });
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(1);
    expect(new Date(body.data[0].createdAt).getTime()).toBe(msgDate.getTime());
    await bigbossApp.close();
  });

  it('skips messages whose translations field is null (defensive branch)', async () => {
    const msgNullTrans = {
      id: VALID_MONGO_ID,
      content: 'Hello',
      originalLanguage: 'en',
      translations: null,
      createdAt: new Date(),
      sender: { id: '1', userId: '1', displayName: 'Alice', user: { username: 'alice' } },
      conversation: { id: '2', identifier: 'conv-1', title: 'Test' },
    };
    mockPrisma.message.findMany.mockResolvedValue([msgNullTrans]);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations' });
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
    await bigbossApp.close();
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.message.findMany.mockRejectedValue(new Error('DB error'));

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(500);
    await bigbossApp.close();
  });
});

// ---------------------------------------------------------------------------
// GET /share-links
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /share-links', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.conversationShareLink.findMany.mockResolvedValue([]);
    mockPrisma.conversationShareLink.count.mockResolvedValue(0);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 401 when no authContext', async () => {
    const noAuthApp = buildNoAuthApp();
    await noAuthApp.ready();

    const response = await noAuthApp.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(401);
    await noAuthApp.close();
  });

  it('returns 403 when role lacks canAccessAdmin (USER)', async () => {
    app = buildApp('USER');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(403);
  });

  it('returns 403 when role has canAccessAdmin but lacks canManageConversations (AUDIT)', async () => {
    // AUDIT: canAccessAdmin=true, canManageConversations=false
    const auditApp = buildApp('AUDIT');
    await auditApp.ready();

    const response = await auditApp.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(403);
    await auditApp.close();
  });

  it('returns 200 with empty list when no filters (ADMIN)', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.total).toBe(0);
  });

  it('returns 200 with share links list (BIGBOSS)', async () => {
    const fakeLink = {
      id: VALID_MONGO_ID,
      linkId: 'abc123',
      identifier: 'test-link',
      name: 'Test Link',
      description: null,
      maxUses: 100,
      currentUses: 5,
      maxConcurrentUsers: 10,
      currentConcurrentUsers: 2,
      expiresAt: null,
      isActive: true,
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: false,
      createdAt: new Date(),
      creator: { id: '1', username: 'alice', displayName: 'Alice', avatar: null },
      conversation: { id: '2', identifier: 'conv-1', title: 'Test', type: 'group' },
    };
    mockPrisma.conversationShareLink.findMany.mockResolvedValue([fakeLink]);
    mockPrisma.conversationShareLink.count.mockResolvedValue(1);

    const bigbossApp = buildApp('BIGBOSS');
    await bigbossApp.ready();

    const response = await bigbossApp.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    await bigbossApp.close();
  });

  it('returns 200 with MODERATOR role (has canManageConversations)', async () => {
    // MODERATOR: canAccessAdmin=true, canManageConversations=true
    const modApp = buildApp('MODERATOR');
    await modApp.ready();

    const response = await modApp.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(200);
    await modApp.close();
  });

  it('returns 200 and passes search filter to prisma (OR clause)', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links?search=mylink' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR[0].linkId.contains).toBe('mylink');
    expect(call.where.OR[1].identifier.contains).toBe('mylink');
    expect(call.where.OR[2].name.contains).toBe('mylink');
  });

  it('returns 200 and applies isActive=true filter', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links?isActive=true' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(call.where.isActive).toBe(true);
  });

  it('returns 200 and applies isActive=false filter', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links?isActive=false' });
    expect(response.statusCode).toBe(200);

    const call = mockPrisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(call.where.isActive).toBe(false);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.conversationShareLink.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(500);
  });
});
