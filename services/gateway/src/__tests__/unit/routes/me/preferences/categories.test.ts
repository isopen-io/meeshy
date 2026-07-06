/**
 * Unit tests for categories routes (routes/me/preferences/categories.ts)
 * Tests all 6 routes using Fastify inject pattern with mocked dependencies.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(),
}));

jest.mock('../../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../../utils/socket-broadcast', () => ({
  broadcastToUser: jest.fn(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' } },
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CATEGORY_CREATED: 'category:created',
    CATEGORY_UPDATED: 'category:updated',
    CATEGORY_DELETED: 'category:deleted',
    CATEGORIES_REORDERED: 'categories:reordered',
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { createUnifiedAuthMiddleware } from '../../../../../middleware/auth';
import { categoriesRoutes } from '../../../../../routes/me/preferences/categories';

const mockCreateAuth = createUnifiedAuthMiddleware as jest.MockedFunction<any>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'usr-cat-test-00001';

const now = new Date('2024-01-15T12:00:00Z');

const makeCategoryRow = (overrides = {}) => ({
  id: 'cat-1',
  userId: USER_ID,
  name: 'Work',
  color: '#3B82F6',
  icon: 'briefcase',
  order: 0,
  isExpanded: true,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    userConversationCategory: {
      findMany: jest.fn<any>().mockResolvedValue([makeCategoryRow()]),
      count: jest.fn<any>().mockResolvedValue(1),
      findFirst: jest.fn<any>().mockResolvedValue(makeCategoryRow()),
      create: jest.fn<any>().mockResolvedValue(makeCategoryRow()),
      update: jest.fn<any>().mockResolvedValue(makeCategoryRow({ name: 'Updated' })),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    conversationPreference: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn<any>().mockResolvedValue([]),
    ...overrides,
  } as any;
}

type AuthMode = 'authenticated' | 'unauthenticated';

async function buildApp(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  auth?: AuthMode;
} = {}): Promise<FastifyInstance> {
  const { prisma = makePrisma(), auth = 'authenticated' } = opts;

  mockCreateAuth.mockImplementation(() => async (req: FastifyRequest) => {
    if (auth === 'authenticated') {
      (req as any).auth = { userId: USER_ID, isAuthenticated: true };
    } else {
      (req as any).auth = { isAuthenticated: false };
    }
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  await app.register(categoriesRoutes);
  await app.ready();
  return app;
}

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET / — list categories', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with paginated categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });
});

describe('GET / — unauthenticated', () => {
  it('returns 401 when userId is missing', async () => {
    const app = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET / — db error', () => {
  it('returns 500 on database error', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.findMany = jest.fn<any>().mockRejectedValue(new Error('db error'));
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /:categoryId ────────────────────────────────────────────────────────

describe('GET /:categoryId — get specific category', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with the category', async () => {
    const res = await app.inject({ method: 'GET', url: '/cat-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    const anonApp = await buildApp({ auth: 'unauthenticated' });
    const res = await anonApp.inject({ method: 'GET', url: '/cat-1' });
    expect(res.statusCode).toBe(401);
    await anonApp.close();
  });

  it('returns 404 when category does not exist', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.findFirst = jest.fn<any>().mockResolvedValue(null);
    const notFoundApp = await buildApp({ prisma });
    const res = await notFoundApp.inject({ method: 'GET', url: '/nonexistent' });
    expect(res.statusCode).toBe(404);
    await notFoundApp.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.findFirst = jest.fn<any>().mockRejectedValue(new Error('db error'));
    const errApp = await buildApp({ prisma });
    const res = await errApp.inject({ method: 'GET', url: '/cat-1' });
    expect(res.statusCode).toBe(500);
    await errApp.close();
  });
});

// ─── POST / — create ─────────────────────────────────────────────────────────

describe('POST / — create category', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 and creates the category', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Work', color: '#3B82F6', icon: 'briefcase' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('auto-assigns order when not specified', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.findFirst = jest.fn<any>().mockResolvedValue({ order: 5 });
    const noOrderApp = await buildApp({ prisma });
    const res = await noOrderApp.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Personal' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.userConversationCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 6 }) })
    );
    await noOrderApp.close();
  });

  it('assigns order 0 when no categories exist', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.findFirst = jest.fn<any>().mockResolvedValue(null);
    const emptyApp = await buildApp({ prisma });
    const res = await emptyApp.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'First' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.userConversationCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 0 }) })
    );
    await emptyApp.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const anonApp = await buildApp({ auth: 'unauthenticated' });
    const res = await anonApp.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(401);
    await anonApp.close();
  });

  it('returns 400 when name is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { name: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.create = jest.fn<any>().mockRejectedValue(new Error('db error'));
    const errApp = await buildApp({ prisma });
    const res = await errApp.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Work' },
    });
    expect(res.statusCode).toBe(500);
    await errApp.close();
  });
});

// ─── PATCH /:categoryId — update ─────────────────────────────────────────────

describe('PATCH /:categoryId — update category', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with updated category', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/cat-1',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    const anonApp = await buildApp({ auth: 'unauthenticated' });
    const res = await anonApp.inject({
      method: 'PATCH',
      url: '/cat-1',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(401);
    await anonApp.close();
  });

  it('returns 404 when category does not exist', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.findFirst = jest.fn<any>().mockResolvedValue(null);
    const notFoundApp = await buildApp({ prisma });
    const res = await notFoundApp.inject({
      method: 'PATCH',
      url: '/nonexistent',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
    await notFoundApp.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.update = jest.fn<any>().mockRejectedValue(new Error('db error'));
    const errApp = await buildApp({ prisma });
    const res = await errApp.inject({
      method: 'PATCH',
      url: '/cat-1',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(500);
    await errApp.close();
  });
});

// ─── DELETE /:categoryId ─────────────────────────────────────────────────────

describe('DELETE /:categoryId — delete category', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 on successful deletion', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/cat-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    const anonApp = await buildApp({ auth: 'unauthenticated' });
    const res = await anonApp.inject({ method: 'DELETE', url: '/cat-1' });
    expect(res.statusCode).toBe(401);
    await anonApp.close();
  });

  it('returns 404 when category does not exist', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.findFirst = jest.fn<any>().mockResolvedValue(null);
    const notFoundApp = await buildApp({ prisma });
    const res = await notFoundApp.inject({ method: 'DELETE', url: '/nonexistent' });
    expect(res.statusCode).toBe(404);
    await notFoundApp.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.$transaction = jest.fn<any>().mockRejectedValue(new Error('tx error'));
    const errApp = await buildApp({ prisma });
    const res = await errApp.inject({ method: 'DELETE', url: '/cat-1' });
    expect(res.statusCode).toBe(500);
    await errApp.close();
  });
});

// ─── POST /reorder ────────────────────────────────────────────────────────────

describe('POST /reorder — reorder categories', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 on successful reorder', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reorder',
      headers: { 'content-type': 'application/json' },
      payload: {
        updates: [
          { categoryId: 'cat-1', order: 0 },
          { categoryId: 'cat-2', order: 1 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    const anonApp = await buildApp({ auth: 'unauthenticated' });
    const res = await anonApp.inject({
      method: 'POST',
      url: '/reorder',
      headers: { 'content-type': 'application/json' },
      payload: { updates: [{ categoryId: 'cat-1', order: 0 }] },
    });
    expect(res.statusCode).toBe(401);
    await anonApp.close();
  });

  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.userConversationCategory.updateMany = jest.fn<any>().mockRejectedValue(new Error('db error'));
    const errApp = await buildApp({ prisma });
    const res = await errApp.inject({
      method: 'POST',
      url: '/reorder',
      headers: { 'content-type': 'application/json' },
      payload: { updates: [{ categoryId: 'cat-1', order: 0 }] },
    });
    expect(res.statusCode).toBe(500);
    await errApp.close();
  });
});

// ─── Guard: missing prisma ────────────────────────────────────────────────────

describe('categoriesRoutes — missing prisma guard', () => {
  it('returns early without crashing when prisma is not decorated', async () => {
    mockCreateAuth.mockImplementation(() => async () => {});
    const app = Fastify({ logger: false });
    await app.register(categoriesRoutes);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
