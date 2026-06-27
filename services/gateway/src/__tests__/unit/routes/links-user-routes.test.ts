/**
 * links-user-routes.test.ts
 *
 * Unit tests for src/routes/links/user.ts
 * Covers: GET /links, GET /links/stats
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.type === 'registered'),
  UnifiedAuthRequest: {},
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerUserRoutes } from '../../../routes/links/user';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversationShareLink = {
  findMany: jest.fn<any>(),
  count:    jest.fn<any>(),
  aggregate: jest.fn<any>(),
};

const mockPrisma: any = {
  conversationShareLink: mockConversationShareLink,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegisteredAuthContext(overrides: any = {}) {
  return {
    type: 'registered',
    registeredUser: { id: USER_ID, role: 'USER' },
    userId: USER_ID,
    hasFullAccess: true,
    ...overrides,
  };
}

function buildApp(authContext?: any): FastifyInstance {
  const authModule = require('../../../middleware/auth');
  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? makeRegisteredAuthContext();
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', mockPrisma);
  app.register(registerUserRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /links
// ---------------------------------------------------------------------------

describe('GET /links', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with paginated list of links', async () => {
    await app.ready();
    const linkData = [{
      id: 'link-1',
      linkId: 'mshy_abc123',
      identifier: 'mshy_test-link',
      name: 'Test Link',
      isActive: true,
      currentUses: 5,
      maxUses: 100,
      expiresAt: null,
      createdAt: new Date('2024-01-15'),
      conversation: { id: 'conv-1', title: 'Test Conv', type: 'public' },
    }];
    mockConversationShareLink.findMany.mockResolvedValue(linkData);
    mockConversationShareLink.count.mockResolvedValue(1);

    const res = await app.inject({ method: 'GET', url: '/links' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('link-1');
    expect(body.data[0].linkId).toBe('mshy_abc123');
    expect(body.data[0].conversationTitle).toBe('Test Conv');
    expect(body.pagination.total).toBe(1);
    expect(body.pagination.offset).toBe(0);
  });

  it('returns 200 with empty list', async () => {
    await app.ready();
    mockConversationShareLink.findMany.mockResolvedValue([]);
    mockConversationShareLink.count.mockResolvedValue(0);

    const res = await app.inject({ method: 'GET', url: '/links' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it('applies offset and limit parameters', async () => {
    await app.ready();
    mockConversationShareLink.findMany.mockResolvedValue([]);
    mockConversationShareLink.count.mockResolvedValue(50);

    const res = await app.inject({ method: 'GET', url: '/links?offset=10&limit=5' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pagination.offset).toBe(10);
    expect(body.pagination.limit).toBe(5);
    expect(mockConversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
  });

  it('passes limit parameter to prisma query', async () => {
    await app.ready();
    mockConversationShareLink.findMany.mockResolvedValue([]);
    mockConversationShareLink.count.mockResolvedValue(0);

    await app.inject({ method: 'GET', url: '/links?limit=20' });

    expect(mockConversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });

  it('maps null expiresAt correctly', async () => {
    await app.ready();
    mockConversationShareLink.findMany.mockResolvedValue([{
      id: 'link-1', linkId: 'mshy_x', identifier: 'mshy_x',
      name: null, isActive: true, currentUses: 0, maxUses: null,
      expiresAt: null, createdAt: new Date('2024-01-01'),
      conversation: { id: 'conv-1', title: null, type: 'public' },
    }]);
    mockConversationShareLink.count.mockResolvedValue(1);

    const res = await app.inject({ method: 'GET', url: '/links' });

    const body = JSON.parse(res.body);
    expect(body.data[0].expiresAt).toBeNull();
    expect(body.data[0].maxUses).toBeNull();
    expect(body.data[0].conversationTitle).toBeNull();
  });

  it('returns 403 when user is not a registered user', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({ method: 'GET', url: '/links' });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findMany.mockRejectedValue(new Error('DB connection lost'));

    const res = await app.inject({ method: 'GET', url: '/links' });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /links/stats
// ---------------------------------------------------------------------------

describe('GET /links/stats', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with aggregated statistics', async () => {
    await app.ready();
    mockConversationShareLink.count
      .mockResolvedValueOnce(10)  // totalLinks
      .mockResolvedValueOnce(7);  // activeLinks
    mockConversationShareLink.aggregate.mockResolvedValue({ _sum: { currentUses: 42 } });

    const res = await app.inject({ method: 'GET', url: '/links/stats' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalLinks).toBe(10);
    expect(body.data.activeLinks).toBe(7);
    expect(body.data.totalUses).toBe(42);
  });

  it('returns 0 totalUses when aggregate sum is null', async () => {
    await app.ready();
    mockConversationShareLink.count.mockResolvedValue(0);
    mockConversationShareLink.aggregate.mockResolvedValue({ _sum: { currentUses: null } });

    const res = await app.inject({ method: 'GET', url: '/links/stats' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalUses).toBe(0);
  });

  it('returns 403 when user is not a registered user', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({ method: 'GET', url: '/links/stats' });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.count.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'GET', url: '/links/stats' });

    expect(res.statusCode).toBe(500);
  });
});
