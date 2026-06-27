/**
 * links-admin-routes.test.ts
 *
 * Unit tests for src/routes/links/admin.ts
 * Covers: GET /links/my-links, PATCH /links/:linkId/toggle,
 *         PATCH /links/:linkId/extend, DELETE /links/:linkId
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

jest.mock('../../../routes/links/types', () => ({
  shareLinkSchema: { type: 'object', additionalProperties: true },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerAdminRoutes } from '../../../routes/links/admin';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID  = '507f1f77bcf86cd799439011';
const LINK_DB_ID = '507f1f77bcf86cd799439012';
const LINK_ID    = 'mshy_507f1f77bcf86cd799439012_abc';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversationShareLink = {
  count:      jest.fn<any>(),
  findMany:   jest.fn<any>(),
  findFirst:  jest.fn<any>(),
  update:     jest.fn<any>(),
  delete:     jest.fn<any>(),
};

const mockPrisma: any = {
  conversationShareLink: mockConversationShareLink,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const authModule = require('../../../middleware/auth');
  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? {
        type: 'registered',
        registeredUser: {
          id: USER_ID,
          role: 'USER',
          username: 'alice',
          firstName: 'Alice',
          lastName: 'A',
          displayName: null,
          avatar: null,
        },
        userId: USER_ID,
        hasFullAccess: true,
      };
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', mockPrisma);
  app.register(registerAdminRoutes);
  return app;
}

function makeShareLink(overrides: any = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_ID,
    conversationId: 'conv-1',
    createdBy: USER_ID,
    name: null,
    description: null,
    isActive: true,
    currentUses: 5,
    maxUses: null,
    allowedLanguages: ['fr', 'en'],
    expiresAt: null,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    conversation: {
      id: 'conv-1',
      title: 'Test Conversation',
      type: 'public',
      description: null,
      participants: [],
    },
    ...overrides,
  };
}

function makeUpdatedLink(overrides: any = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_ID,
    conversationId: 'conv-1',
    createdBy: USER_ID,
    isActive: true,
    conversation: { id: 'conv-1', title: 'Test', description: null, type: 'public', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    creator: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'A', displayName: null, avatar: null },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /links/my-links
// ---------------------------------------------------------------------------

describe('GET /links/my-links', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with paginated list for registered user', async () => {
    await app.ready();
    const links = [makeShareLink(), makeShareLink({ linkId: 'mshy_other' })];
    mockConversationShareLink.count.mockResolvedValue(2);
    mockConversationShareLink.findMany.mockResolvedValue(links);

    const res = await app.inject({ method: 'GET', url: '/links/my-links' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(2);
  });

  it('returns 200 with empty list', async () => {
    await app.ready();
    mockConversationShareLink.count.mockResolvedValue(0);
    mockConversationShareLink.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/links/my-links' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it('applies offset and limit params', async () => {
    await app.ready();
    mockConversationShareLink.count.mockResolvedValue(20);
    mockConversationShareLink.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/links/my-links?offset=5&limit=10' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pagination.offset).toBe(5);
    expect(body.pagination.limit).toBe(10);
    expect(mockConversationShareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 10 })
    );
  });

  it('enriches links with conversationUrl and stats', async () => {
    await app.ready();
    mockConversationShareLink.count.mockResolvedValue(1);
    mockConversationShareLink.findMany.mockResolvedValue([makeShareLink()]);

    const res = await app.inject({ method: 'GET', url: '/links/my-links' });

    const body = JSON.parse(res.body);
    expect(body.data[0].conversation.conversationUrl).toBe('/conversations/conv-1');
    expect(body.data[0].stats).toBeDefined();
  });

  it('returns 401 when user is not registered', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({ method: 'GET', url: '/links/my-links' });
    await anonApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.count.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'GET', url: '/links/my-links' });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /links/:linkId/toggle
// ---------------------------------------------------------------------------

describe('PATCH /links/:linkId/toggle', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when creator toggles link', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(makeShareLink({ createdBy: USER_ID }));
    mockConversationShareLink.update.mockResolvedValue(makeUpdatedLink({ isActive: false }));

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/toggle`,
      payload: { isActive: false },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockConversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LINK_DB_ID } })
    );
  });

  it('returns 200 when activating returns success message', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(makeShareLink({ createdBy: USER_ID }));
    mockConversationShareLink.update.mockResolvedValue(makeUpdatedLink({ isActive: true }));

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/toggle`,
      payload: { isActive: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('activé');
  });

  it('returns 404 when link not found', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/toggle`,
      payload: { isActive: false },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not registered', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/toggle`,
      payload: { isActive: false },
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/toggle`,
      payload: { isActive: false },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /links/:linkId/extend
// ---------------------------------------------------------------------------

describe('PATCH /links/:linkId/extend', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when creator extends expiration', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(makeShareLink({ createdBy: USER_ID }));
    mockConversationShareLink.update.mockResolvedValue(makeUpdatedLink({ expiresAt: new Date('2025-12-31') }));

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/extend`,
      payload: { expiresAt: '2025-12-31T23:59:59Z' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toBeDefined();
  });

  it('returns 404 when link not found', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/extend`,
      payload: { expiresAt: '2025-12-31T23:59:59Z' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not registered', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/extend`,
      payload: { expiresAt: '2025-12-31T23:59:59Z' },
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}/extend`,
      payload: { expiresAt: '2025-12-31T23:59:59Z' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /links/:linkId
// ---------------------------------------------------------------------------

describe('DELETE /links/:linkId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when creator deletes link', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(makeShareLink({ createdBy: USER_ID }));
    mockConversationShareLink.delete.mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('supprimé');
  });

  it('returns 404 when link not found', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_ID}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not registered', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'DELETE',
      url: `/links/${LINK_ID}`,
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/links/${LINK_ID}`,
    });

    expect(res.statusCode).toBe(500);
  });
});
