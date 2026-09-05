/**
 * Route tests — conversation-preferences routes
 *
 * Covers all 5 routes via Fastify inject:
 *   GET    /user-preferences/conversations/:conversationId - get single (stored vs default)
 *   GET    /user-preferences/conversations               - list all (paginated)
 *   PUT    /user-preferences/conversations/:conversationId - upsert (all fields, partial, empty)
 *   DELETE /user-preferences/conversations/:conversationId - reset in place (found / P2025 / 500)
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
  resetError?: Error | null;
  findManyError?: Error | null;
  findUniqueError?: Error | null;
  upsertError?: Error | null;
  /** Conversations the user is an active participant of; `null` = all of them. */
  participantIds?: string[] | null;
  participantsError?: Error | null;
  /** Categories the user owns; `null` = all of them. */
  ownedCategoryIds?: string[] | null;
};

function makePrisma({
  findUniqueResult = STORED_PREF,
  findManyResult = [STORED_PREF],
  countResult = 1,
  upsertResult = STORED_PREF,
  resetError = null,
  findManyError = null,
  findUniqueError = null,
  upsertError = null,
  participantIds = null,
  participantsError = null,
  ownedCategoryIds = null,
}: PrismaOpts = {}) {
  return {
    // Every preference write upserts, so both the single PUT and the batch
    // reorder scope themselves to the conversations the user is actually in —
    // an unscoped upsert would let any caller mint preference rows against
    // arbitrary conversation ids. `findFirst` answers the single write,
    // `findMany` the batch.
    participant: {
      findFirst: participantsError
        ? jest.fn<() => Promise<unknown>>().mockRejectedValue(participantsError)
        : jest.fn(async ({ where }: { where: { conversationId?: string } }) =>
            participantIds === null || participantIds.includes(where?.conversationId as string)
              ? { id: `participant-${where?.conversationId}` }
              : null
          ),
      findMany: participantsError
        ? jest.fn<() => Promise<unknown>>().mockRejectedValue(participantsError)
        : jest.fn(async ({ where }: { where: { conversationId?: { in?: string[] } } }) =>
            (where?.conversationId?.in ?? [])
              .filter((id) => participantIds === null || participantIds.includes(id))
              .map((conversationId) => ({ conversationId }))
          ),
    },
    // Category ownership is checked before `categoryId` is attached, since the
    // row carries the joined category back to the caller. `null` = all of them.
    userConversationCategory: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string } }) =>
        ownedCategoryIds === null || ownedCategoryIds.includes(where?.id as string)
          ? { id: where?.id }
          : null
      ),
    },
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
      // The reset (DELETE route) is an in-place `update`: it restores the
      // preference columns to their defaults and increments the monotonic
      // `version` in one atomic write, so the sequence survives the reset.
      update: resetError
        ? jest.fn().mockRejectedValue(resetError)
        : jest.fn().mockResolvedValue({ version: (findUniqueResult?.version ?? 0) + 1 }),
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
      categoryId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
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

  it('resets every preference column in place and advances the version, keeping the row', async () => {
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

    const updateCall = (prisma.userConversationPreferences.update as ReturnType<typeof jest.fn>).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };
    // The row survives the reset: `version` is the monotonic broadcast
    // sequence clients gate on, and dropping the row restarts it at 1.
    expect(updateCall?.data).toMatchObject({
      isPinned: false,
      isMuted: false,
      mentionsOnly: false,
      isArchived: false,
      tags: [],
      categoryId: null,
      orderInCategory: null,
      customName: null,
      reaction: null,
      clearHistoryBefore: null,
      version: { increment: 1 },
    });
    await appCustom.close();
  });

  it('returns 404 when preferences not found (Prisma P2025)', async () => {
    const err = Object.assign(new Error('not found'), { code: 'P2025' });
    const appNF = await buildApp({ resetError: err });
    const res = await appNF.inject({ method: 'DELETE', url: `/user-preferences/conversations/${CONV_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(404);
    await appNF.close();
  });

  it('returns 500 on generic db error', async () => {
    const appErr = await buildApp({ resetError: new Error('db crash') });
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

  it('upserts each conversation independently, scoped to the caller', async () => {
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
    const upsertCalls = (prisma.userConversationPreferences.upsert as ReturnType<typeof jest.fn>).mock.calls;
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0][0].where.userId_conversationId).toEqual({ userId: USER_ID, conversationId: CONV_ID });
    expect(upsertCalls[0][0].update.orderInCategory).toBe(2);
    expect(upsertCalls[0][0].create.orderInCategory).toBe(2);
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
    const appErr = await buildApp({ participantsError: new Error('db crash') });
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

// ─── `version` survives the response serializer ──────────────────────────────
//
// `version` is the monotonic counter every client arbitrates socket broadcasts
// against (`incoming.version <= local -> drop`). Fastify strips any property
// absent from the response schema, so a schema that forgets it silently voids
// the contract on all three read/write surfaces: the clients keep receiving
// preferences and never receive the sequence that says which of two snapshots
// is newer. iOS goes as far as re-fetching the row right after its PUT for the
// sole purpose of reading this field.

describe('version reaches the client on every preferences surface', () => {
  it('GET single returns the stored version', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
    });
    expect(res.json().data.version).toBe(STORED_PREF.version);
    await app.close();
  });

  it('GET single returns version 0 when no row is stored', async () => {
    // An absent row has never been broadcast, so it sits below every version
    // the server can emit. Answering `undefined` would leave the client to
    // guess, and a client that defaults to something other than 0 would drop
    // the first broadcast it ever receives.
    const app = await buildApp({ findUniqueResult: null });
    const res = await app.inject({
      method: 'GET',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
    });
    const body = res.json();
    expect(body.data.isDefault).toBe(true);
    expect(body.data.version).toBe(0);
    await app.close();
  });

  it('GET list returns the version of each row', async () => {
    const app = await buildApp({ findManyResult: [STORED_PREF], countResult: 1 });
    const res = await app.inject({
      method: 'GET',
      url: '/user-preferences/conversations',
      headers: AUTH,
    });
    expect(res.json().data[0].version).toBe(STORED_PREF.version);
    await app.close();
  });

  it('PUT echoes the version the write produced', async () => {
    const app = await buildApp({ upsertResult: { ...STORED_PREF, version: 4 } });
    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: { isPinned: true },
    });
    expect(res.json().data.version).toBe(4);
    await app.close();
  });
});

// ─── categoryId shape ─────────────────────────────────────────────────────────

/**
 * `categoryId` names a `UserConversationCategory` row, whose id is always a
 * MongoDB ObjectId. Unvalidated, a malformed one reaches
 * `userConversationCategory.findFirst` and Prisma raises `Malformed ObjectID`
 * (P2023) — which the route's catch-all turns into a 500, reporting a caller
 * mistake as a server fault and filing it under `logError`. The shape belongs in
 * the schema, where every other id-bearing route in the gateway puts it.
 */
describe('PUT /user-preferences/conversations/:conversationId — categoryId shape', () => {
  const CATEGORY_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

  it('rejects a categoryId that is not an ObjectId with 400, before touching the db', async () => {
    const prisma = makePrisma();
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', prisma as unknown);
    app.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as Record<string, unknown>).authContext = {
        isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID },
      };
    });
    await app.register(conversationPreferencesRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: { categoryId: 'not-an-objectid' },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma.userConversationCategory.findFirst).not.toHaveBeenCalled();
    expect(prisma.userConversationPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('still accepts a well-formed categoryId', async () => {
    const app = await buildApp({ ownedCategoryIds: [CATEGORY_ID] });
    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: { categoryId: CATEGORY_ID },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('still accepts null — uncategorize needs no lookup', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/user-preferences/conversations/${CONV_ID}`,
      headers: AUTH,
      payload: { categoryId: null },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
