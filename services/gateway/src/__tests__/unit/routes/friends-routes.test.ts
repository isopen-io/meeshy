/**
 * Route tests — friends (friend-requests) routes
 *
 * Covers all 5 routes via Fastify inject:
 *   POST   /friend-requests          — send a friend request
 *   GET    /friend-requests/received — get received friend requests
 *   GET    /friend-requests/sent     — get sent friend requests
 *   PATCH  /friend-requests/:id      — respond (accept/reject)
 *   DELETE /friend-requests/:id      — cancel/remove
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../../middleware/auth', () => ({
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  friendRequestSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      senderId: { type: 'string' },
      receiverId: { type: 'string' },
      status: { type: 'string' },
      message: { type: 'string', nullable: true },
      createdAt: { type: 'string' },
      sender: { type: 'object' },
      receiver: { type: 'object' },
    },
  },
  sendFriendRequestSchema: { type: 'object' },
  respondFriendRequestSchema: { type: 'object' },
  userMinimalSchema: { type: 'object' },
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' } },
  },
}));

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const RECEIVER_ID = '507f1f77bcf86cd799439012';
const FR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTH = { authorization: 'Bearer token' };

const DB_USER = {
  id: RECEIVER_ID,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice S.',
  avatar: null,
  isOnline: false,
  lastActiveAt: new Date('2024-01-10'),
};

const DB_FRIEND_REQUEST = {
  id: FR_ID,
  senderId: USER_ID,
  receiverId: RECEIVER_ID,
  status: 'pending',
  message: null,
  createdAt: new Date('2024-01-01'),
  sender: DB_USER,
  receiver: DB_USER,
};

const DB_NOTIFICATION = {
  id: 'notif001',
  userId: USER_ID,
  type: 'friend_request',
  isRead: false,
  context: { friendRequestId: FR_ID },
};

const DB_CONVERSATION = {
  id: 'convid000000000000000001',
  identifier: `direct_${USER_ID}_${RECEIVER_ID}`,
  type: 'direct',
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  userFindUnique?: typeof DB_USER | null | Error;
  friendRequestFindFirst?: typeof DB_FRIEND_REQUEST | null | Error;
  friendRequestCreate?: typeof DB_FRIEND_REQUEST | Error;
  friendRequestFindMany?: typeof DB_FRIEND_REQUEST[] | Error;
  friendRequestCount?: number | Error;
  friendRequestUpdate?: typeof DB_FRIEND_REQUEST | Error;
  friendRequestDelete?: object | Error;
  notificationFindMany?: typeof DB_NOTIFICATION[] | Error;
  notificationUpdate?: typeof DB_NOTIFICATION | Error;
  conversationFindFirst?: typeof DB_CONVERSATION | null | Error;
  conversationCreate?: typeof DB_CONVERSATION | Error;
};

function opt<T>(v: T | undefined, fallback: T): T {
  return v === undefined ? fallback : v;
}

function mockFn<T>(v: T | Error): jest.Mock {
  return v instanceof Error
    ? jest.fn().mockRejectedValue(v)
    : jest.fn().mockResolvedValue(v);
}

function makePrisma(opts: PrismaOpts = {}) {
  return {
    user: {
      findUnique: mockFn(opt(opts.userFindUnique, DB_USER)),
    },
    friendRequest: {
      findFirst: mockFn(opt(opts.friendRequestFindFirst, null)),
      create: mockFn(opt(opts.friendRequestCreate, DB_FRIEND_REQUEST)),
      findMany: mockFn(opt(opts.friendRequestFindMany, [DB_FRIEND_REQUEST])),
      count: mockFn(opt(opts.friendRequestCount, 1)),
      update: mockFn(opt(opts.friendRequestUpdate, { ...DB_FRIEND_REQUEST, status: 'accepted' })),
      delete: mockFn(opt(opts.friendRequestDelete, {})),
    },
    notification: {
      findMany: mockFn(opt(opts.notificationFindMany, [DB_NOTIFICATION])),
      update: mockFn(opt(opts.notificationUpdate, DB_NOTIFICATION)),
    },
    conversation: {
      findFirst: mockFn(opt(opts.conversationFindFirst, null)),
      create: mockFn(opt(opts.conversationCreate, DB_CONVERSATION)),
    },
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

async function buildApp(prismaOpts: PrismaOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma(prismaOpts) as unknown);
  app.decorate('notificationService', null as unknown);
  app.decorate('socialEvents', null as unknown);
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.headers['authorization'];
    if (!token) {
      await reply.code(401).send({ success: false, error: 'Unauthorized' });
      return;
    }
    (req as unknown as Record<string, unknown>).user = {
      userId: USER_ID,
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER',
    };
  });

  const { friendRequestRoutes } = await import('../../../routes/friends');
  await app.register(friendRequestRoutes, { prefix: '' });
  await app.ready();
  return app;
}

// ─── POST /friend-requests ────────────────────────────────────────────────────

describe('POST /friend-requests', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 201 when friend request is sent successfully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(FR_ID);
    expect(body.data.senderId).toBe(USER_ID);
  });

  it('returns 404 when target user does not exist', async () => {
    const appNoUser = await buildApp({ userFindUnique: null });
    const res = await appNoUser.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(404);
    await appNoUser.close();
  });

  it('returns 409 when friend request already exists', async () => {
    const appExisting = await buildApp({ friendRequestFindFirst: DB_FRIEND_REQUEST });
    const res = await appExisting.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(409);
    await appExisting.close();
  });

  it('returns 401 when no auth header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ friendRequestCreate: new Error('db crash') });
    const res = await appErr.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });

  it('accepts optional message field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID, message: 'Hi!' }),
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─── GET /friend-requests/received ───────────────────────────────────────────

describe('GET /friend-requests/received', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with paginated list of received requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/friend-requests/received',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns pagination metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/friend-requests/received?offset=0&limit=10',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(1);
  });

  it('returns 200 with empty list when no requests', async () => {
    const appEmpty = await buildApp({ friendRequestFindMany: [], friendRequestCount: 0 });
    const res = await appEmpty.inject({
      method: 'GET',
      url: '/friend-requests/received',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    await appEmpty.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/friend-requests/received',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ friendRequestFindMany: new Error('db') });
    const res = await appErr.inject({
      method: 'GET',
      url: '/friend-requests/received',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── GET /friend-requests/sent ────────────────────────────────────────────────

describe('GET /friend-requests/sent', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with list of sent requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/friend-requests/sent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/friend-requests/sent',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({ friendRequestFindMany: new Error('db') });
    const res = await appErr.inject({
      method: 'GET',
      url: '/friend-requests/sent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── PATCH /friend-requests/:id ──────────────────────────────────────────────

describe('PATCH /friend-requests/:id', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ friendRequestFindFirst: DB_FRIEND_REQUEST });
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when rejecting a friend request', async () => {
    const appWithFR = await buildApp({ friendRequestFindFirst: DB_FRIEND_REQUEST });
    const res = await appWithFR.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await appWithFR.close();
  });

  it('returns 200 when accepting a friend request and creates conversation', async () => {
    const appWithFR = await buildApp({
      friendRequestFindFirst: DB_FRIEND_REQUEST,
      conversationFindFirst: null,
    });
    const res = await appWithFR.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await appWithFR.close();
  });

  it('returns 200 when accepting when conversation already exists', async () => {
    const appWithFR = await buildApp({
      friendRequestFindFirst: DB_FRIEND_REQUEST,
      conversationFindFirst: DB_CONVERSATION,
    });
    const res = await appWithFR.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(200);
    await appWithFR.close();
  });

  it('returns 404 when friend request not found or already processed', async () => {
    const appNoFR = await buildApp({ friendRequestFindFirst: null });
    const res = await appNoFR.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(404);
    await appNoFR.close();
  });

  it('returns 400 when status is invalid', async () => {
    const appWithFR = await buildApp({ friendRequestFindFirst: DB_FRIEND_REQUEST });
    const res = await appWithFR.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    });
    expect(res.statusCode).toBe(400);
    await appWithFR.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error during update', async () => {
    const appErr = await buildApp({
      friendRequestFindFirst: DB_FRIEND_REQUEST,
      friendRequestUpdate: new Error('db crash'),
    });
    const res = await appErr.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});

// ─── DELETE /friend-requests/:id ─────────────────────────────────────────────

describe('DELETE /friend-requests/:id', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ friendRequestFindFirst: DB_FRIEND_REQUEST }); });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when friend request is deleted', async () => {
    const appWithFR = await buildApp({ friendRequestFindFirst: DB_FRIEND_REQUEST });
    const res = await appWithFR.inject({
      method: 'DELETE',
      url: `/friend-requests/${FR_ID}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBeDefined();
    await appWithFR.close();
  });

  it('returns 404 when friend request not found', async () => {
    const appNoFR = await buildApp({ friendRequestFindFirst: null });
    const res = await appNoFR.inject({
      method: 'DELETE',
      url: `/friend-requests/${FR_ID}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    await appNoFR.close();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/friend-requests/${FR_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const appErr = await buildApp({
      friendRequestFindFirst: DB_FRIEND_REQUEST,
      friendRequestDelete: new Error('db crash'),
    });
    const res = await appErr.inject({
      method: 'DELETE',
      url: `/friend-requests/${FR_ID}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);
    await appErr.close();
  });
});
