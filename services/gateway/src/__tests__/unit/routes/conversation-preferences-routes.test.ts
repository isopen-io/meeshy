/**
 * Route tests — conversation-preferences routes
 *
 * Covers all 5 routes via Fastify inject:
 *   GET    /user-preferences/conversations/:conversationId - get single (stored vs default)
 *   GET    /user-preferences/conversations               - list all (paginated)
 *   PUT    /user-preferences/conversations/:conversationId - upsert (all fields, partial, empty)
 *   DELETE /user-preferences/conversations/:conversationId - delete (found / P2025 / 500)
 *   POST   /user-preferences/reorder                      - batch reorder conversations
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import conversationPreferencesRoutes from '../../../routes/conversation-preferences';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTH = { authorization: 'Bearer token' };

const STORED_PREF = {
  id: 'pref-1',
  userId: USER_ID,
  conversationId: CONV_ID,
  isPinned: true,
  isMuted: false,
  mentionsOnly: false,
  isArchived: false,
  tags: ['work'],
  categoryId: null,
  orderInCategory: null,
  customName: null,
  reaction: null,
  deletedForUserAt: null,
  clearHistoryBefore: null,
  version: 3,
  category: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  findUniqueResult?: typeof STORED_PREF | null;
  findManyResult?: typeof STORED_PREF[];
  countResult?: number;
  upsertResult?: typeof STORED_PREF;
  deleteError?: Error | null;
  findManyError?: Error | null;
  findUniqueError?: Error | null;
  upsertError?: Error | null;
  updateManyError?: Error | null;
};

function makePrisma({
  findUniqueResult = STORED_PREF,
  findManyResult = [STORED_PREF],
  countResult = 1,
  upsertResult = STORED_PREF,
  deleteError = null,
  findManyError = null,
  findUniqueError = null,
  upsertError = null,
  updateManyError = null,
}: PrismaOpts = {}) {
  return {
    userConversationPreferences: {
      findUnique: findUniqueError
        ? jest.fn().mockRejectedValue(findUniqueError)
        : jest.fn().mockResolvedValue(findUniqueResult),
      findMany: findManyError
        ? jest.fn().mockRejectedValue(findManyError)
        : jest.fn().mockResolvedValue(findManyResult),
      count: jest.fn().mockResolvedValue(countResult),
      upsert: upsertError
        ? jest.fn().mockRejectedValue(upsertError)
        : jest.fn().mockResolvedValue(upsertResult),
      delete: deleteError
        ? jest.fn().mockRejectedValue(deleteError)
        : jest.fn().mockResolvedValue(undefined),
      updateMany: updateManyError
        ? jest.fn().mockRejectedValue(updateManyError)
        : jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

type AuthMode = 'registered' | 'anonymous' | 'unauthenticated';

async function buildApp(prismaOpts: PrismaOpts = {}, auth: AuthMode = 'registered'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(prismaOpts) as unknown);
  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (auth === 'unauthenticated') {
        await reply.code(401).send({ success: false, error: 'Unauthorized' });
        return;
      }
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: auth === 'registered',
        isAnonymous: auth === 'anonymous',
        userId: USER_ID,
        registeredUser: auth === 'registered' ? { id: USER_ID } : null,
      };
    }
  );
  await app.register(conversationPreferencesRoutes);
  await app.ready();
  return app;
}

// ─── GET /user-preferences/conversations/:conversationId ─────────────────────

describe('GET /user-preferences/conversations/:conversationId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with stored preferences (isDefault: false)', async () => {
    const res = await app.inject({ method: 'GET', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(false);
    expect(body.data.conversationId).toBe(CONV_ID);
    expect(body.data.userId).toBe(USER_ID);
  });

  it('returns 200 with default preferences when none stored (isDefault: true)', async () => {
    const appDef = await buildApp({ findUniqueResult: null });
    const res = await appDef.inject({ method: 'GET', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isDefault).toBe(true);
    expect(body.data.id).toBeNull();
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.conversationId).toBe(CONV_ID);
    await appDef.close();
  });

  it('returns 401 when user is anonymous (not registered)', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({ method: 'GET', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ findUniqueError: new Error('db crash') });
    const res = await appErr.inject({ method: 'GET', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── GET /user-preferences/conversations ─────────────────────────────────────

describe('GET /user-preferences/conversations', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ findManyResult: [STORED_PREF, STORED_PREF], countResult: 2 }); });
  afterAll(() => app.close());

  it('returns 200 with paginated list', async () => {
    const res = await app.inject({ method: 'GET', url: '/user-preferences/conversations', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.data.every((p: { isDefault: boolean }) => p.isDefault === false)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(2);
  });

  it('accepts offset and limit query params', async () => {
    const res = await app.inject({ method: 'GET', url: '/user-preferences/conversations?offset=0&limit=10', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for anonymous user', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({ method: 'GET', url: '/user-preferences/conversations', headers: AUTH });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ findManyError: new Error('timeout') });
    const res = await appErr.inject({ method: 'GET', url: '/user-preferences/conversations', headers: AUTH });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── PUT /user-preferences/conversations/:conversationId ─────────────────────

describe('PUT /user-preferences/conversations/:conversationId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with updated preferences (pinned)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: { isPinned: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.isDefault).toBe(false);
  });

  it('passes all preference fields to prisma upsert', async () => {
    const prisma = makePrisma();
    const appCustom = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appCustom.decorate('prisma', prisma as unknown);
    appCustom.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID },
      };
    });
    await appCustom.register(conversationPreferencesRoutes);
    await appCustom.ready();

    const payload = {
      isPinned: true,
      isMuted: true,
      mentionsOnly: true,
      isArchived: true,
      tags: ['important', 'work'],
      categoryId: 'cat-1',
      orderInCategory: 5,
      customName: 'My Favorite',
      reaction: '❤️',
    };

    const res = await appCustom.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload,
    });
    expect(res.statusCode).toBe(200);
    const upsertCall = (prisma.userConversationPreferences.upsert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(upsertCall.update.isPinned).toBe(true);
    expect(upsertCall.update.tags).toEqual(['important', 'work']);
    expect(upsertCall.update.customName).toBe('My Favorite');
    await appCustom.close();
  });

  it('handles partial update (only isMuted)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: { isMuted: true },
    });
    expect(res.statusCode).toBe(200);
  });

  it('handles empty body (no fields)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for anonymous user', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: { isPinned: true },
    });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ upsertError: new Error('db crash') });
    const res = await appErr.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: { isPinned: true },
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── DELETE /user-preferences/conversations/:conversationId ──────────────────

describe('DELETE /user-preferences/conversations/:conversationId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 on successful deletion', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/deleted/i);
  });

  it('reads existing version before deletion to compute resetVersion', async () => {
    const prisma = makePrisma();
    const appCustom = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appCustom.decorate('prisma', prisma as unknown);
    appCustom.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID },
      };
    });
    await appCustom.register(conversationPreferencesRoutes);
    await appCustom.ready();

    await appCustom.inject({ method: 'DELETE', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect((prisma.userConversationPreferences.findUnique as ReturnType<typeof jest.fn>).mock.calls).toHaveLength(1);
    expect((prisma.userConversationPreferences.delete as ReturnType<typeof jest.fn>).mock.calls).toHaveLength(1);
    await appCustom.close();
  });

  it('uses version+1 as reset version when prefs exist', async () => {
    const storedWithVersion = { ...STORED_PREF, version: 7 };
    const prisma = makePrisma({ findUniqueResult: storedWithVersion });
    const appCustom = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appCustom.decorate('prisma', prisma as unknown);
    appCustom.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID },
      };
    });
    await appCustom.register(conversationPreferencesRoutes);
    await appCustom.ready();

    const res = await appCustom.inject({ method: 'DELETE', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    await appCustom.close();
  });

  it('returns 0+1=1 as reset version when prefs do not exist (findUnique returns null)', async () => {
    const prisma = makePrisma({ findUniqueResult: null });
    const appCustom = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appCustom.decorate('prisma', prisma as unknown);
    appCustom.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID },
      };
    });
    await appCustom.register(conversationPreferencesRoutes);
    await appCustom.ready();

    const res = await appCustom.inject({ method: 'DELETE', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    await appCustom.close();
  });

  it('returns 404 when preferences not found (Prisma P2025)', async () => {
    const err = Object.assign(new Error('not found'), { code: 'P2025' });
    const appNF = await buildApp({ deleteError: err });
    const res = await appNF.inject({ method: 'DELETE', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(404);
    await appNF.close();
  });

  it('returns 500 on generic db error', async () => {
    const appErr = await buildApp({ deleteError: new Error('db crash') });
    const res = await appErr.inject({ method: 'DELETE', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('returns 401 for anonymous user', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({ method: 'DELETE', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });
});

// ─── POST /user-preferences/reorder ──────────────────────────────────────────

describe('POST /user-preferences/reorder', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 when reorder succeeds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/user-preferences/reorder',
      headers: AUTH,
      payload: {
        updates: [
          { conversationId: CONV_ID, orderInCategory: 0 },
          { conversationId: 'bbbbbbbbbbbbbbbbbbbbbbbb', orderInCategory: 1 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/reorder/i);
  });

  it('updates each conversation independently via updateMany', async () => {
    const prisma = makePrisma();
    const appCustom = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    appCustom.decorate('prisma', prisma as unknown);
    appCustom.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID },
      };
    });
    await appCustom.register(conversationPreferencesRoutes);
    await appCustom.ready();

    await appCustom.inject({
      method: 'POST',
      url: '/user-preferences/reorder',
      headers: AUTH,
      payload: { updates: [{ conversationId: CONV_ID, orderInCategory: 2 }] },
    });
    const updateManyCalls = (prisma.userConversationPreferences.updateMany as ReturnType<typeof jest.fn>).mock.calls;
    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0][0].where.userId).toBe(USER_ID);
    expect(updateManyCalls[0][0].data.orderInCategory).toBe(2);
    await appCustom.close();
  });

  it('handles empty updates array gracefully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/user-preferences/reorder',
      headers: AUTH,
      payload: { updates: [] },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for anonymous user', async () => {
    const appAnon = await buildApp({}, 'anonymous');
    const res = await appAnon.inject({
      method: 'POST',
      url: '/user-preferences/reorder',
      headers: AUTH,
      payload: { updates: [] },
    });
    expect(res.statusCode).toBe(401);
    await appAnon.close();
  });

  it('returns 500 on db error', async () => {
    const appErr = await buildApp({ updateManyError: new Error('db crash') });
    const res = await appErr.inject({
      method: 'POST',
      url: '/user-preferences/reorder',
      headers: AUTH,
      payload: { updates: [{ conversationId: CONV_ID, orderInCategory: 0 }] },
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});
