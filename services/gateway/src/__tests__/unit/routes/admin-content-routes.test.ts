/**
 * admin-content-routes.test.ts
 *
 * Unit tests for src/routes/admin/content.ts
 * Covers:
 *   - GET /messages     (requires canModerateContent)
 *   - GET /communities  (requires canManageCommunities)
 *   - GET /translations (requires canManageTranslations)
 *   - GET /share-links  (requires canManageConversations)
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {
    id: true, fileName: true, mimeType: true, fileSize: true, fileUrl: true,
  },
}));

const mockGetUserPermissions = jest.fn<any>();
jest.mock('../../../routes/admin/services/PermissionsService', () => ({
  permissionsService: {
    getUserPermissions: (...args: any[]) => mockGetUserPermissions(...args),
  },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerContentRoutes } from '../../../routes/admin/content';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockMessageFindMany  = jest.fn<any>();
const mockMessageCount     = jest.fn<any>();
const mockCommunityFindMany = jest.fn<any>();
const mockCommunityCount   = jest.fn<any>();
const mockShareLinkFindMany = jest.fn<any>();
const mockShareLinkCount   = jest.fn<any>();

const mockPrisma: any = {
  message:               { findMany: mockMessageFindMany, count: mockMessageCount },
  community:             { findMany: mockCommunityFindMany, count: mockCommunityCount },
  conversationShareLink: { findMany: mockShareLinkFindMany, count: mockShareLinkCount },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FULL_PERMISSIONS = {
  canAccessAdmin:        true,
  canModerateContent:    true,
  canManageCommunities:  true,
  canManageTranslations: true,
  canManageConversations: true,
};

function adminAuthCtx() {
  return { isAuthenticated: true, registeredUser: { id: USER_ID, role: 'ADMIN' }, userId: USER_ID };
}

function unauthCtx() {
  return { isAuthenticated: false, registeredUser: null, userId: '' };
}

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  const ctx = authContext ?? adminAuthCtx();
  app.decorate('authenticate', async (req: any) => { req.authContext = ctx; });
  app.decorate('prisma', mockPrisma);
  app.register(registerContentRoutes);
  return app;
}

function makeMessage(overrides: any = {}) {
  return {
    id: 'msg-1', content: 'Hello', messageType: 'text', originalLanguage: 'en',
    isEdited: false, createdAt: new Date('2024-01-15T10:00:00Z'),
    sender: null, conversation: null, attachments: [], _count: { replies: 0 },
    ...overrides,
  };
}

function makeCommunity(overrides: any = {}) {
  return {
    id: 'comm-1', identifier: 'test', name: 'Test Comm', description: null,
    avatar: null, isPrivate: false, createdAt: new Date('2024-01-01T00:00:00Z'),
    creator: null, _count: { members: 5, Conversation: 2 },
    ...overrides,
  };
}

function makeShareLink(overrides: any = {}) {
  return {
    id: 'sl-1', linkId: 'link123', identifier: 'test-link', name: 'Test Link',
    description: null, maxUses: null, currentUses: 0, maxConcurrentUsers: null,
    currentConcurrentUsers: 0, expiresAt: null, isActive: true,
    allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false,
    createdAt: new Date('2024-01-01T00:00:00Z'), creator: null, conversation: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /messages
// ---------------------------------------------------------------------------

describe('GET /messages', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessageFindMany.mockReset();
    mockMessageCount.mockReset();
    app = buildApp();
    mockGetUserPermissions.mockReturnValue(FULL_PERMISSIONS);
    mockMessageFindMany.mockResolvedValue([]);
    mockMessageCount.mockResolvedValue(0);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/messages' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with messages when found', async () => {
    mockMessageFindMany.mockResolvedValue([makeMessage()]);
    mockMessageCount.mockResolvedValue(1);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/messages' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/messages' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user lacks canAccessAdmin', async () => {
    mockGetUserPermissions.mockReturnValue({ ...FULL_PERMISSIONS, canAccessAdmin: false });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/messages' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when user lacks canModerateContent', async () => {
    mockGetUserPermissions.mockReturnValue({ ...FULL_PERMISSIONS, canModerateContent: false });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/messages' });
    expect(res.statusCode).toBe(403);
  });

  it('filters by search term', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/messages?search=hello' });
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          content: expect.objectContaining({ contains: 'hello' }),
        }),
      })
    );
  });

  it('filters by period=today', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/messages?period=today' });
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    mockMessageFindMany.mockReset();
    mockMessageFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/messages' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /communities
// ---------------------------------------------------------------------------

describe('GET /communities', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommunityFindMany.mockReset();
    mockCommunityCount.mockReset();
    app = buildApp();
    mockGetUserPermissions.mockReturnValue(FULL_PERMISSIONS);
    mockCommunityFindMany.mockResolvedValue([]);
    mockCommunityCount.mockResolvedValue(0);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with communities', async () => {
    mockCommunityFindMany.mockResolvedValue([makeCommunity()]);
    mockCommunityCount.mockResolvedValue(1);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
  });

  it('returns 403 when user lacks canManageCommunities', async () => {
    mockGetUserPermissions.mockReturnValue({ ...FULL_PERMISSIONS, canManageCommunities: false });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(403);
  });

  it('filters by isPrivate=true', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/communities?isPrivate=true' });
    expect(mockCommunityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPrivate: true }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    mockCommunityFindMany.mockReset();
    mockCommunityFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /translations
// ---------------------------------------------------------------------------

describe('GET /translations', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessageFindMany.mockReset();
    app = buildApp();
    mockGetUserPermissions.mockReturnValue(FULL_PERMISSIONS);
    mockMessageFindMany.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty translations list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/translations' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('de-normalizes message translations into flat array', async () => {
    const msg = makeMessage({
      translations: {
        fr: { text: 'Bonjour', translationModel: 'nllb', confidenceScore: 0.95, createdAt: new Date() },
        es: { text: 'Hola',    translationModel: 'nllb', confidenceScore: 0.90, createdAt: new Date() },
      },
    });
    mockMessageFindMany.mockResolvedValue([msg]);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/translations' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((t: any) => t.targetLanguage)).toContain('fr');
    expect(body.data.map((t: any) => t.targetLanguage)).toContain('es');
  });

  it('filters by targetLanguage in-memory', async () => {
    const msg = makeMessage({
      translations: {
        fr: { text: 'Bonjour', translationModel: 'nllb', confidenceScore: 0.95, createdAt: new Date() },
        es: { text: 'Hola',    translationModel: 'nllb', confidenceScore: 0.90, createdAt: new Date() },
      },
    });
    mockMessageFindMany.mockResolvedValue([msg]);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/translations?targetLanguage=fr' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].targetLanguage).toBe('fr');
  });

  it('returns 403 when user lacks canManageTranslations', async () => {
    mockGetUserPermissions.mockReturnValue({ ...FULL_PERMISSIONS, canManageTranslations: false });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/translations' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    mockMessageFindMany.mockReset();
    mockMessageFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/translations' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /share-links
// ---------------------------------------------------------------------------

describe('GET /share-links', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShareLinkFindMany.mockReset();
    mockShareLinkCount.mockReset();
    app = buildApp();
    mockGetUserPermissions.mockReturnValue(FULL_PERMISSIONS);
    mockShareLinkFindMany.mockResolvedValue([]);
    mockShareLinkCount.mockResolvedValue(0);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/share-links' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with share links', async () => {
    mockShareLinkFindMany.mockResolvedValue([makeShareLink()]);
    mockShareLinkCount.mockResolvedValue(1);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/share-links' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
  });

  it('returns 403 when user lacks canManageConversations', async () => {
    mockGetUserPermissions.mockReturnValue({ ...FULL_PERMISSIONS, canManageConversations: false });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/share-links' });
    expect(res.statusCode).toBe(403);
  });

  it('filters by isActive=false', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/share-links?isActive=false' });
    expect(mockShareLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: false }),
      })
    );
  });

  it('filters by search term across linkId/identifier/name', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/share-links?search=abc' });
    expect(mockShareLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ linkId: expect.objectContaining({ contains: 'abc' }) }),
          ]),
        }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    mockShareLinkFindMany.mockReset();
    mockShareLinkFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/share-links' });
    expect(res.statusCode).toBe(500);
  });
});
