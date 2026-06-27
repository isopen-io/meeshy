/**
 * community-preferences-routes.test.ts
 *
 * Unit tests for src/routes/community-preferences.ts
 * Covers: GET /user-preferences/communities/:communityId,
 *         GET /user-preferences/communities,
 *         PUT /user-preferences/communities/:communityId,
 *         DELETE /user-preferences/communities/:communityId,
 *         POST /user-preferences/communities/reorder
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../middleware/auth', () => ({
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../config/user-preferences-defaults', () => ({
  COMMUNITY_PREFERENCES_DEFAULTS: {
    isPinned: false,
    isMuted: false,
    isArchived: false,
    isHidden: false,
    notificationLevel: 'all',
    customName: null,
    categoryId: null,
    orderInCategory: null,
  },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import communityPreferencesRoutes from '../../../routes/community-preferences';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const COMM_ID = '507f1f77bcf86cd799439012';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserCommunityPreferences = {
  findUnique: jest.fn<any>(),
  findMany:   jest.fn<any>(),
  count:      jest.fn<any>().mockResolvedValue(0),
  upsert:     jest.fn<any>(),
  delete:     jest.fn<any>().mockResolvedValue({}),
  updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
};

const mockPrisma: any = {
  userCommunityPreferences: mockUserCommunityPreferences,
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function makeAuthContext(overrides: any = {}) {
  return {
    isAuthenticated: true,
    userId: USER_ID,
    registeredUser: { id: USER_ID },
    isAnonymous: false,
    ...overrides,
  };
}

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);

  app.decorate('authenticate', async (req: any) => {
    req.authContext = authContext ?? makeAuthContext();
  });

  app.register(communityPreferencesRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /user-preferences/communities/:communityId
// ---------------------------------------------------------------------------

describe('GET /user-preferences/communities/:communityId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns stored preferences with isDefault: false when found', async () => {
    await app.ready();
    const storedPrefs = {
      id: 'pref-1', userId: USER_ID, communityId: COMM_ID,
      isPinned: true, isMuted: false, isArchived: false, isHidden: false,
      notificationLevel: 'all', customName: null, categoryId: null, orderInCategory: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    mockUserCommunityPreferences.findUnique.mockResolvedValue(storedPrefs);

    const res = await app.inject({
      method: 'GET',
      url: `/user-preferences/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isPinned).toBe(true);
    expect(body.data.isDefault).toBe(false);
  });

  it('returns default preferences with isDefault: true when not found', async () => {
    await app.ready();
    mockUserCommunityPreferences.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/user-preferences/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(true);
    expect(body.data.id).toBeNull();
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.communityId).toBe(COMM_ID);
    expect(body.data.isPinned).toBe(false);
    expect(body.data.notificationLevel).toBe('all');
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(makeAuthContext({ isAuthenticated: false, registeredUser: null }));
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `/user-preferences/communities/${COMM_ID}`,
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUserCommunityPreferences.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/user-preferences/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /user-preferences/communities
// ---------------------------------------------------------------------------

describe('GET /user-preferences/communities', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns paginated list of preferences', async () => {
    await app.ready();
    const storedPrefs = [{
      id: 'pref-1', userId: USER_ID, communityId: COMM_ID,
      isPinned: false, isMuted: true, isArchived: false, isHidden: false,
      notificationLevel: 'none', customName: 'My Community', categoryId: null,
      orderInCategory: 1, createdAt: new Date(), updatedAt: new Date(),
    }];
    mockUserCommunityPreferences.findMany.mockResolvedValue(storedPrefs);
    mockUserCommunityPreferences.count.mockResolvedValue(1);

    const res = await app.inject({
      method: 'GET',
      url: '/user-preferences/communities',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].isDefault).toBe(false);
    expect(body.pagination.total).toBe(1);
  });

  it('returns empty list when no preferences exist', async () => {
    await app.ready();
    mockUserCommunityPreferences.findMany.mockResolvedValue([]);
    mockUserCommunityPreferences.count.mockResolvedValue(0);

    const res = await app.inject({
      method: 'GET',
      url: '/user-preferences/communities',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(makeAuthContext({ isAuthenticated: false, registeredUser: null }));
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: '/user-preferences/communities',
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUserCommunityPreferences.findMany.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: '/user-preferences/communities',
    });

    expect(res.statusCode).toBe(500);
  });

  it('applies pagination parameters', async () => {
    await app.ready();
    mockUserCommunityPreferences.findMany.mockResolvedValue([]);
    mockUserCommunityPreferences.count.mockResolvedValue(100);

    const res = await app.inject({
      method: 'GET',
      url: '/user-preferences/communities?offset=10&limit=5',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pagination.offset).toBe(10);
    expect(body.pagination.limit).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PUT /user-preferences/communities/:communityId
// ---------------------------------------------------------------------------

describe('PUT /user-preferences/communities/:communityId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when preferences upserted successfully', async () => {
    await app.ready();
    const upsertResult = {
      id: 'pref-1', userId: USER_ID, communityId: COMM_ID,
      isPinned: true, isMuted: false, isArchived: false, isHidden: false,
      notificationLevel: 'all', customName: null, categoryId: null, orderInCategory: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    mockUserCommunityPreferences.upsert.mockResolvedValue(upsertResult);

    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/communities/${COMM_ID}`,
      payload: { isPinned: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(false);
    expect(mockUserCommunityPreferences.upsert).toHaveBeenCalled();
  });

  it('returns 200 when muting community', async () => {
    await app.ready();
    mockUserCommunityPreferences.upsert.mockResolvedValue({
      id: 'pref-1', userId: USER_ID, communityId: COMM_ID,
      isPinned: false, isMuted: true, isArchived: false, isHidden: false,
      notificationLevel: 'none', customName: null, categoryId: null, orderInCategory: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/communities/${COMM_ID}`,
      payload: { isMuted: true, notificationLevel: 'none' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(makeAuthContext({ isAuthenticated: false, registeredUser: null }));
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'PUT',
      url: `/user-preferences/communities/${COMM_ID}`,
      payload: { isPinned: true },
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUserCommunityPreferences.upsert.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/communities/${COMM_ID}`,
      payload: { isPinned: true },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /user-preferences/communities/:communityId
// ---------------------------------------------------------------------------

describe('DELETE /user-preferences/communities/:communityId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when preferences deleted successfully', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'DELETE',
      url: `/user-preferences/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockUserCommunityPreferences.delete).toHaveBeenCalled();
  });

  it('returns 404 when preferences not found (P2025)', async () => {
    await app.ready();
    const notFoundError = new Error('Record to delete does not exist') as any;
    notFoundError.code = 'P2025';
    mockUserCommunityPreferences.delete.mockRejectedValue(notFoundError);

    const res = await app.inject({
      method: 'DELETE',
      url: `/user-preferences/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(makeAuthContext({ isAuthenticated: false, registeredUser: null }));
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'DELETE',
      url: `/user-preferences/communities/${COMM_ID}`,
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on non-P2025 DB error', async () => {
    await app.ready();
    mockUserCommunityPreferences.delete.mockRejectedValue(new Error('Generic DB error'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/user-preferences/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /user-preferences/communities/reorder
// ---------------------------------------------------------------------------

describe('POST /user-preferences/communities/reorder', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when communities reordered successfully', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      payload: {
        updates: [
          { communityId: COMM_ID, orderInCategory: 1 },
          { communityId: '507f1f77bcf86cd799439013', orderInCategory: 2 },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockUserCommunityPreferences.updateMany).toHaveBeenCalledTimes(2);
  });

  it('returns 200 when reordering single community', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      payload: {
        updates: [{ communityId: COMM_ID, orderInCategory: 0 }],
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(makeAuthContext({ isAuthenticated: false, registeredUser: null }));
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      payload: { updates: [{ communityId: COMM_ID, orderInCategory: 1 }] },
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when updates array is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUserCommunityPreferences.updateMany.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/user-preferences/communities/reorder',
      payload: { updates: [{ communityId: COMM_ID, orderInCategory: 1 }] },
    });

    expect(res.statusCode).toBe(500);
  });
});
