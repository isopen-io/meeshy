import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports that reference these modules
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { registerContentRoutes } from '../../../routes/admin/content';

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

// ---------------------------------------------------------------------------
// Mock Prisma factory
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

// ---------------------------------------------------------------------------
// App builders
// ---------------------------------------------------------------------------

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

  it('returns 401 when no authContext (unauthenticated)', async () => {
    const noAuthApp = buildNoAuthApp();
    await noAuthApp.ready();

    const response = await noAuthApp.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    await noAuthApp.close();
  });

  it('returns 403 when role is USER', async () => {
    app = buildApp('USER');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it('returns 200 when role is ADMIN', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.message.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/messages' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
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

  it('returns 200 when role is ADMIN', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.community.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/communities' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /translations
// ---------------------------------------------------------------------------

describe('Admin content routes — GET /translations', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.message.findMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 when role is BIGBOSS (has canManageTranslations)', async () => {
    app = buildApp('BIGBOSS');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.message.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('BIGBOSS');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/translations' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
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

  it('returns 200 when role is ADMIN', async () => {
    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    mockPrisma.conversationShareLink.findMany.mockRejectedValue(new Error('DB error'));

    app = buildApp('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/share-links' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});
