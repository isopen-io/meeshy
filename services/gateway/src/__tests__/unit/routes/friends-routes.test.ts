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

// withMutationLog: by default just calls op(); can be overridden per-test
const mockWithMutationLog = jest.fn(({ op }: { op: () => Promise<unknown> }) => op());
jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: (args: Record<string, unknown>) => mockWithMutationLog(args),
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
      findUnique: mockFn(opt(opts.friendRequestCreate, DB_FRIEND_REQUEST)), // used by onDuplicate
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

// ─── Notification / social-events factories ───────────────────────────────────

function makeNotifService() {
  return {
    createFriendRequestNotification: jest.fn().mockResolvedValue(undefined),
    createFriendAcceptedNotification: jest.fn().mockResolvedValue(undefined),
    createSystemNotification: jest.fn().mockResolvedValue(undefined),
    emitFriendRequestCancelled: jest.fn(),
    emitFriendRequestNew: jest.fn(),
    emitFriendRequestAccepted: jest.fn(),
    emitFriendRequestRejected: jest.fn(),
  };
}

function makeSocialEvents() {
  return { invalidateFriendsCache: jest.fn() };
}

// ─── App builder ──────────────────────────────────────────────────────────────

type BuildOpts = {
  prismaOpts?: PrismaOpts;
  notifService?: ReturnType<typeof makeNotifService> | null;
  socialEvents?: ReturnType<typeof makeSocialEvents> | null;
  authUserId?: string;
  socketIOHandler?: { getManager: jest.Mock } | null;
};

async function buildApp(
  prismaOptsOrFullOpts: PrismaOpts | BuildOpts = {},
): Promise<FastifyInstance> {
  // Accept either legacy PrismaOpts or new BuildOpts object
  const isFullOpts = 'prismaOpts' in prismaOptsOrFullOpts || 'notifService' in prismaOptsOrFullOpts || 'socialEvents' in prismaOptsOrFullOpts || 'authUserId' in prismaOptsOrFullOpts || 'socketIOHandler' in prismaOptsOrFullOpts;
  const fullOpts: BuildOpts = isFullOpts ? (prismaOptsOrFullOpts as BuildOpts) : { prismaOpts: prismaOptsOrFullOpts as PrismaOpts };

  const prismaOpts = fullOpts.prismaOpts ?? {};
  const notifService = fullOpts.notifService !== undefined ? fullOpts.notifService : null;
  const socialEventsDecor = fullOpts.socialEvents !== undefined ? fullOpts.socialEvents : null;
  const authUserId = fullOpts.authUserId ?? USER_ID;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma(prismaOpts) as unknown);
  app.decorate('notificationService', notifService);
  app.decorate('socialEvents', socialEventsDecor);
  if (fullOpts.socketIOHandler) app.decorate('socketIOHandler', fullOpts.socketIOHandler);
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.headers['authorization'];
    if (!token) {
      await reply.code(401).send({ success: false, error: 'Unauthorized' });
      return;
    }
    (req as unknown as Record<string, unknown>).user = {
      userId: authUserId,
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

// Reset withMutationLog to its default (just calls op()) before each test
beforeEach(() => {
  mockWithMutationLog.mockImplementation(({ op }: { op: () => Promise<unknown> }) => op());
});

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

  it('auto-joins both users\' connected sockets to the new DM conversation room on accept', async () => {
    const joinUserToConversationRoom = jest.fn().mockResolvedValue(undefined);
    const appWithFR = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, conversationFindFirst: null },
      socketIOHandler: { getManager: jest.fn().mockReturnValue({ joinUserToConversationRoom }) },
    });
    const res = await appWithFR.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(200);
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(DB_FRIEND_REQUEST.senderId, DB_CONVERSATION.id);
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(DB_FRIEND_REQUEST.receiverId, DB_CONVERSATION.id);
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

  it('emits FRIEND_REQUEST_CANCELLED to the receiver when the sender cancels', async () => {
    const notifService = makeNotifService();
    const appAsSender = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST },
      notifService,
      authUserId: USER_ID, // DB_FRIEND_REQUEST.senderId
    });
    const res = await appAsSender.inject({
      method: 'DELETE',
      url: `/friend-requests/${FR_ID}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(notifService.emitFriendRequestCancelled).toHaveBeenCalledWith({
      recipientUserId: RECEIVER_ID,
      friendRequestId: FR_ID,
      cancelledBy: USER_ID,
    });
    await appAsSender.close();
  });

  it('emits FRIEND_REQUEST_CANCELLED to the sender when the receiver removes it', async () => {
    const notifService = makeNotifService();
    const appAsReceiver = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST },
      notifService,
      authUserId: RECEIVER_ID, // DB_FRIEND_REQUEST.receiverId
    });
    const res = await appAsReceiver.inject({
      method: 'DELETE',
      url: `/friend-requests/${FR_ID}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(notifService.emitFriendRequestCancelled).toHaveBeenCalledWith({
      recipientUserId: USER_ID,
      friendRequestId: FR_ID,
      cancelledBy: RECEIVER_ID,
    });
    await appAsReceiver.close();
  });

  it('does not throw when notificationService is absent', async () => {
    const appNoNotif = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST },
      notifService: null,
    });
    const res = await appNoNotif.inject({
      method: 'DELETE',
      url: `/friend-requests/${FR_ID}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    await appNoNotif.close();
  });
});

// ─── POST — notification service and ZodError paths ──────────────────────────

describe('POST /friend-requests — notification service', () => {
  it('calls notificationService.createFriendRequestNotification when service is present', async () => {
    const notifService = makeNotifService();
    const app = await buildApp({ prismaOpts: { friendRequestFindFirst: null }, notifService });
    await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(notifService.createFriendRequestNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: RECEIVER_ID, requesterId: USER_ID, friendRequestId: FR_ID })
    );
    await app.close();
  });

  it('uses username as senderName when displayName is absent', async () => {
    const notifService = makeNotifService();
    const requestNoDisplay = { ...DB_FRIEND_REQUEST, sender: { ...DB_USER, displayName: null, username: 'alice_user' } };
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: null, friendRequestCreate: requestNoDisplay as typeof DB_FRIEND_REQUEST },
      notifService,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(201);
    expect(notifService.createFriendRequestNotification).toHaveBeenCalled();
    await app.close();
  });

  it('uses firstName+lastName as senderName when displayName and username are absent', async () => {
    const notifService = makeNotifService();
    const requestNoNames = { ...DB_FRIEND_REQUEST, sender: { ...DB_USER, displayName: null, username: null, firstName: 'John', lastName: 'Doe' } };
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: null, friendRequestCreate: requestNoNames as typeof DB_FRIEND_REQUEST },
      notifService,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(201);
    expect(notifService.createFriendRequestNotification).toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 when body is missing receiverId (ZodError path)', async () => {
    const app = await buildApp({ prismaOpts: { friendRequestFindFirst: null } });
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('covers onDuplicate path (withMutationLog duplicate replay)', async () => {
    const notifService = makeNotifService();
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: { onDuplicate: (id: string) => Promise<unknown> }) =>
      onDuplicate(FR_ID)
    );
    const app = await buildApp({ prismaOpts: { friendRequestFindFirst: null }, notifService });
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('emits FRIEND_REQUEST_NEW to the receiver when the request is created', async () => {
    const notifService = makeNotifService();
    const app = await buildApp({ prismaOpts: { friendRequestFindFirst: null }, notifService });
    await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(notifService.emitFriendRequestNew).toHaveBeenCalledWith({
      receiverId: RECEIVER_ID,
      friendRequestId: FR_ID,
      senderId: USER_ID,
    });
    await app.close();
  });

  it('does not throw emitting FRIEND_REQUEST_NEW when notificationService is absent', async () => {
    const app = await buildApp({ prismaOpts: { friendRequestFindFirst: null }, notifService: null });
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── PATCH — notification service, social events and error paths ──────────────

describe('PATCH /friend-requests/:id — notification service (accepted)', () => {
  it('calls createFriendAcceptedNotification when accepted with notifService present', async () => {
    const notifService = makeNotifService();
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, conversationFindFirst: null },
      notifService,
    });
    await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(notifService.createFriendAcceptedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: USER_ID, accepterUserId: USER_ID })
    );
    await app.close();
  });

  it('emits FRIEND_REQUEST_ACCEPTED to the original sender with the new conversationId', async () => {
    const notifService = makeNotifService();
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, conversationFindFirst: null },
      notifService,
    });
    await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(notifService.emitFriendRequestAccepted).toHaveBeenCalledWith({
      senderId: USER_ID,
      friendRequestId: FR_ID,
      accepterId: USER_ID,
      conversationId: DB_CONVERSATION.id,
    });
    await app.close();
  });

  it('emits FRIEND_REQUEST_ACCEPTED with the existing conversationId when one already exists', async () => {
    const notifService = makeNotifService();
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, conversationFindFirst: DB_CONVERSATION },
      notifService,
    });
    await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(notifService.emitFriendRequestAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: DB_CONVERSATION.id })
    );
    await app.close();
  });

  it('calls createSystemNotification with rejection message when rejected', async () => {
    const notifService = makeNotifService();
    const rejectedRequest = { ...DB_FRIEND_REQUEST, status: 'rejected' };
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, friendRequestUpdate: rejectedRequest as typeof DB_FRIEND_REQUEST },
      notifService,
    });
    await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect(notifService.createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: USER_ID, priority: 'low' })
    );
    expect(notifService.createFriendAcceptedNotification).not.toHaveBeenCalled();
    expect(notifService.emitFriendRequestAccepted).not.toHaveBeenCalled();
    await app.close();
  });

  it('emits FRIEND_REQUEST_REJECTED to the original sender when rejected', async () => {
    const notifService = makeNotifService();
    const rejectedRequest = { ...DB_FRIEND_REQUEST, status: 'rejected' };
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, friendRequestUpdate: rejectedRequest as typeof DB_FRIEND_REQUEST },
      notifService,
    });
    await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect(notifService.emitFriendRequestRejected).toHaveBeenCalledWith({
      senderId: USER_ID,
      friendRequestId: FR_ID,
      rejecterId: USER_ID,
    });
    await app.close();
  });

  it('uses receiver.username as receiverName when displayName absent', async () => {
    const notifService = makeNotifService();
    const rejectedRequest = { ...DB_FRIEND_REQUEST, status: 'rejected', receiver: { ...DB_USER, displayName: null, username: 'bob_u' } };
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, friendRequestUpdate: rejectedRequest as typeof DB_FRIEND_REQUEST },
      notifService,
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect(res.statusCode).toBe(200);
    expect(notifService.createSystemNotification).toHaveBeenCalled();
    await app.close();
  });

  it('uses firstName+lastName as receiverName when displayName and username absent', async () => {
    const notifService = makeNotifService();
    const rejectedRequest = { ...DB_FRIEND_REQUEST, status: 'rejected', receiver: { ...DB_USER, displayName: null, username: null, firstName: 'Bob', lastName: 'J' } };
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, friendRequestUpdate: rejectedRequest as typeof DB_FRIEND_REQUEST },
      notifService,
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('PATCH /friend-requests/:id — social events', () => {
  it('calls invalidateFriendsCache for both users on accept when socialEvents present', async () => {
    const socialEvents = makeSocialEvents();
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, conversationFindFirst: null },
      socialEvents,
    });
    await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(socialEvents.invalidateFriendsCache).toHaveBeenCalledWith(USER_ID);
    expect(socialEvents.invalidateFriendsCache).toHaveBeenCalledWith(RECEIVER_ID);
    await app.close();
  });

  it('does not call invalidateFriendsCache on reject', async () => {
    const socialEvents = makeSocialEvents();
    const rejectedRequest = { ...DB_FRIEND_REQUEST, status: 'rejected' };
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, friendRequestUpdate: rejectedRequest as typeof DB_FRIEND_REQUEST },
      socialEvents,
    });
    await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect(socialEvents.invalidateFriendsCache).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /friend-requests/:id — notification error and onDuplicate', () => {
  it('notification findMany error is swallowed (does not fail route)', async () => {
    const app = await buildApp({
      prismaOpts: {
        friendRequestFindFirst: DB_FRIEND_REQUEST,
        notificationFindMany: new Error('notification db crash'),
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('marks only matching notifications as read and skips non-matching ones', async () => {
    const matchingNotif = { ...DB_NOTIFICATION, id: 'match-notif', context: { friendRequestId: FR_ID } };
    const otherNotif = { ...DB_NOTIFICATION, id: 'other-notif', context: { friendRequestId: 'other-id' } };
    const app = await buildApp({
      prismaOpts: {
        friendRequestFindFirst: DB_FRIEND_REQUEST,
        notificationFindMany: [matchingNotif, otherNotif],
        conversationFindFirst: null,
      },
    });
    await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    const prisma = (app as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma;
    expect(prisma.notification.update).toHaveBeenCalledTimes(1);
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'match-notif' } })
    );
    await app.close();
  });

  it('covers onDuplicate path in PATCH (withMutationLog duplicate replay)', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: { onDuplicate: (id: string) => Promise<unknown> }) =>
      onDuplicate(FR_ID)
    );
    const app = await buildApp({
      prismaOpts: { friendRequestFindFirst: DB_FRIEND_REQUEST, conversationFindFirst: null },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── PATCH — conversation creation displayName OR-chain fallbacks ─────────────

describe('PATCH /friend-requests/:id — conversation displayName fallbacks', () => {
  it('uses username as displayName when user.displayName is null in conversation creation', async () => {
    const userNoDisplay = { ...DB_USER, displayName: null, username: 'sender_user' };
    const app = await buildApp({
      prismaOpts: {
        friendRequestFindFirst: DB_FRIEND_REQUEST,
        conversationFindFirst: null,
        userFindUnique: userNoDisplay as typeof DB_USER,
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('uses "User" as displayName when user is null in conversation creation', async () => {
    const app = await buildApp({
      prismaOpts: {
        friendRequestFindFirst: DB_FRIEND_REQUEST,
        conversationFindFirst: null,
        userFindUnique: null,
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
