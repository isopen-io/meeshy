/**
 * links-management-routes.test.ts
 *
 * Unit tests for src/routes/links/management.ts
 * Covers: PUT /links/:conversationShareLinkId, PATCH /links/:linkId
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

import { registerManagementRoutes } from '../../../routes/links/management';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID   = '507f1f77bcf86cd799439011';
const LINK_DB_ID = '507f1f77bcf86cd799439012';
const LINK_ID    = 'mshy_507f1f77bcf86cd799439012.2606271200_abc';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversationShareLink = {
  findUnique: jest.fn<any>(),
  findFirst:  jest.fn<any>(),
  update:     jest.fn<any>(),
};

const mockPrisma: any = {
  conversationShareLink: mockConversationShareLink,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const authModule = require('../../../middleware/auth');
  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? {
        type: 'registered',
        registeredUser: { id: USER_ID, role: 'USER' },
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
  app.register(registerManagementRoutes);
  return app;
}

function makeShareLink(overrides: any = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_ID,
    createdBy: USER_ID,
    conversation: {
      id: 'conv-1',
      participants: [],
    },
    name: null,
    description: null,
    isActive: true,
    ...overrides,
  };
}

function makeUpdatedLink(overrides: any = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_ID,
    conversationId: 'conv-1',
    createdBy: USER_ID,
    name: 'Updated',
    description: null,
    isActive: true,
    maxUses: null,
    expiresAt: null,
    allowAnonymousMessages: true,
    allowViewHistory: true,
    conversation: { id: 'conv-1', title: 'Conv', type: 'public' },
    creator: { id: USER_ID, username: 'alice' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PUT /links/:conversationShareLinkId
// ---------------------------------------------------------------------------

describe('PUT /links/:conversationShareLinkId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when creator updates link', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink({ createdBy: USER_ID }));
    mockConversationShareLink.update.mockResolvedValue(makeUpdatedLink({ name: 'Updated' }));

    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated', isActive: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.shareLink).toBeDefined();
    expect(mockConversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LINK_DB_ID } })
    );
  });

  it('returns 200 when conversation admin updates link', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink({
      createdBy: 'other-user',
      conversation: {
        id: 'conv-1',
        participants: [{ role: 'admin', userId: USER_ID }],
      },
    }));
    mockConversationShareLink.update.mockResolvedValue(makeUpdatedLink());

    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { isActive: false },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when link not found', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not registered user', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when user is neither creator nor conversation admin', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink({
      createdBy: 'another-user',
      conversation: { id: 'conv-1', participants: [] },
    }));

    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /links/:linkId
// ---------------------------------------------------------------------------

describe('PATCH /links/:linkId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when creator patches link', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(makeShareLink({
      createdBy: USER_ID,
      conversation: { id: 'conv-1', participants: [] },
    }));
    mockConversationShareLink.update.mockResolvedValue(makeUpdatedLink());

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}`,
      payload: { name: 'Patched' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockConversationShareLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { linkId: LINK_ID } })
    );
  });

  it('returns 200 when conversation ADMIN patches link', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(makeShareLink({
      createdBy: 'other-user',
      conversation: {
        id: 'conv-1',
        participants: [{ role: 'ADMIN', userId: USER_ID }],
      },
    }));
    mockConversationShareLink.update.mockResolvedValue(makeUpdatedLink());

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}`,
      payload: { isActive: true },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when link not found', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not registered user', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when user is neither creator nor admin', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockResolvedValue(makeShareLink({
      createdBy: 'other-user',
      conversation: { id: 'conv-1', participants: [] },
    }));

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(500);
  });
});
