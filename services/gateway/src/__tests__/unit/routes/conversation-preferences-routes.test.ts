/**
 * conversation-preferences-routes.test.ts
 *
 * Unit tests for src/routes/conversation-preferences.ts
 * Covers:
 *   - GET  /user-preferences/conversations/:conversationId
 *   - GET  /user-preferences/conversations
 *   - PUT  /user-preferences/conversations/:conversationId
 *   - DELETE /user-preferences/conversations/:conversationId
 *   - POST /user-preferences/reorder
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

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import conversationPreferencesRoutes from '../../../routes/conversation-preferences';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID         = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439099';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockPrefFindUnique  = jest.fn<any>();
const mockPrefFindMany    = jest.fn<any>();
const mockPrefCount       = jest.fn<any>();
const mockPrefUpsert      = jest.fn<any>();
const mockPrefDelete      = jest.fn<any>();
const mockPrefUpdateMany  = jest.fn<any>();

const mockPrisma: any = {
  userConversationPreferences: {
    findUnique:  (...args: any[]) => mockPrefFindUnique(...args),
    findMany:    (...args: any[]) => mockPrefFindMany(...args),
    count:       (...args: any[]) => mockPrefCount(...args),
    upsert:      (...args: any[]) => mockPrefUpsert(...args),
    delete:      (...args: any[]) => mockPrefDelete(...args),
    updateMany:  (...args: any[]) => mockPrefUpdateMany(...args),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminAuthCtx() {
  return { isAuthenticated: true, registeredUser: { id: USER_ID }, userId: USER_ID };
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
  app.register(conversationPreferencesRoutes);
  return app;
}

function makePreferences(overrides: any = {}) {
  return {
    id: 'pref-1',
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    isPinned: false,
    isMuted: false,
    mentionsOnly: false,
    isArchived: false,
    tags: [],
    categoryId: null,
    orderInCategory: null,
    customName: null,
    reaction: null,
    deletedForUserAt: null,
    clearHistoryBefore: null,
    version: 1,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    category: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /user-preferences/conversations/:conversationId
// ---------------------------------------------------------------------------

describe('GET /user-preferences/conversations/:conversationId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrefFindUnique.mockReset();
    app = buildApp();
    mockPrefFindUnique.mockResolvedValue(null);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with stored preferences when found', async () => {
    mockPrefFindUnique.mockResolvedValue(makePreferences({ isPinned: true }));
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(false);
  });

  it('returns 200 with default preferences when not found', async () => {
    mockPrefFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(true);
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.conversationId).toBe(CONVERSATION_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'GET', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockPrefFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /user-preferences/conversations
// ---------------------------------------------------------------------------

describe('GET /user-preferences/conversations', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrefFindMany.mockReset();
    mockPrefCount.mockReset();
    app = buildApp();
    mockPrefFindMany.mockResolvedValue([]);
    mockPrefCount.mockResolvedValue(0);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/user-preferences/conversations' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with preferences and pagination', async () => {
    mockPrefFindMany.mockResolvedValue([makePreferences()]);
    mockPrefCount.mockResolvedValue(1);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/user-preferences/conversations' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('passes offset and limit to DB query', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/user-preferences/conversations?offset=10&limit=5' });
    expect(mockPrefFindMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 5,
    }));
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/user-preferences/conversations' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockPrefFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/user-preferences/conversations' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /user-preferences/conversations/:conversationId
// ---------------------------------------------------------------------------

describe('PUT /user-preferences/conversations/:conversationId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrefUpsert.mockReset();
    app = buildApp();
    mockPrefUpsert.mockResolvedValue(makePreferences({ isPinned: true, version: 2 }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful upsert', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
      payload: { isPinned: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(false);
  });

  it('calls upsert with correct where clause', async () => {
    await app.ready();
    await app.inject({
      method: 'PUT', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
      payload: { isMuted: true, tags: ['work'] },
    });
    expect(mockPrefUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId_conversationId: { userId: USER_ID, conversationId: CONVERSATION_ID },
      }),
    }));
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'PUT', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
      payload: { isPinned: false },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockPrefUpsert.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
      payload: { isPinned: true },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /user-preferences/conversations/:conversationId
// ---------------------------------------------------------------------------

describe('DELETE /user-preferences/conversations/:conversationId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrefFindUnique.mockReset();
    mockPrefDelete.mockReset();
    app = buildApp();
    mockPrefFindUnique.mockResolvedValue({ version: 3 });
    mockPrefDelete.mockResolvedValue({ id: 'pref-1' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when preferences deleted', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'DELETE', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Preferences deleted successfully');
  });

  it('returns 404 when preferences not found (P2025)', async () => {
    mockPrefDelete.mockRejectedValue({ code: 'P2025' });
    await app.ready();
    const res = await app.inject({
      method: 'DELETE', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'DELETE', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on unexpected DB error', async () => {
    mockPrefDelete.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'DELETE', url: `/user-preferences/conversations/${CONVERSATION_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /user-preferences/reorder
// ---------------------------------------------------------------------------

describe('POST /user-preferences/reorder', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrefUpdateMany.mockReset();
    app = buildApp();
    mockPrefUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when conversations reordered', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/user-preferences/reorder',
      payload: {
        updates: [
          { conversationId: CONVERSATION_ID, orderInCategory: 0 },
          { conversationId: '507f1f77bcf86cd799439088', orderInCategory: 1 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Conversations reordered successfully');
  });

  it('calls updateMany for each conversation in updates', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/user-preferences/reorder',
      payload: {
        updates: [
          { conversationId: CONVERSATION_ID, orderInCategory: 2 },
        ],
      },
    });
    expect(mockPrefUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: USER_ID, conversationId: CONVERSATION_ID }),
      data: expect.objectContaining({ orderInCategory: 2 }),
    }));
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST', url: '/user-preferences/reorder',
      payload: { updates: [{ conversationId: CONVERSATION_ID, orderInCategory: 0 }] },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockPrefUpdateMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/user-preferences/reorder',
      payload: { updates: [{ conversationId: CONVERSATION_ID, orderInCategory: 0 }] },
    });
    expect(res.statusCode).toBe(500);
  });
});
