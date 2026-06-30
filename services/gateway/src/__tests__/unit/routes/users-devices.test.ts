/**
 * Unit tests for routes/users/devices.ts
 *
 * Covers all 7 exported route registrars:
 *   GET    /users/friend-requests        — getFriendRequests
 *   POST   /users/friend-requests        — sendFriendRequest
 *   PATCH  /users/friend-requests/:id    — respondToFriendRequest (accept/reject/cancel)
 *   GET    /users/:userId/affiliate-token — getAffiliateToken
 *   GET    /users                        — getAllUsers (stub)
 *   PUT    /users/:id                    — updateUserById (stub)
 *   DELETE /users/:id                    — deleteUserById (stub)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (must be before imports) ────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn((offset: string, limit: string) => ({
    offset: parseInt(offset || '0', 10),
    limit: Math.min(parseInt(limit || '20', 10), 100),
  })),
  buildPaginationMeta: jest.fn((total: number, offset: number, limit: number, returned: number) => ({
    total,
    offset,
    limit,
    returned,
  })),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  userMinimalSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

// ─── Spy on response helpers ──────────────────────────────────────────────────

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendPaginatedSuccess = jest.fn<any>((reply: any, data: any, pagination: any) => {
  reply._body = { success: true, data, pagination };
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 401;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 400;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 404;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 403;
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 500;
  reply._body = { success: false, error: msg };
  return reply;
});

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendPaginatedSuccess: (...args: any[]) => mockSendPaginatedSuccess(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

// ─── Import route registrars after all mocks ─────────────────────────────────

import {
  getFriendRequests,
  sendFriendRequest,
  respondToFriendRequest,
  getAffiliateToken,
  getAllUsers,
  updateUserById,
  deleteUserById,
} from '../../../routes/users/devices';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const RECEIVER_ID = '507f1f77bcf86cd799439022';
const FR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CONVO_ID = 'cccccccccccccccccccccccc';

// ─── Test data factories ──────────────────────────────────────────────────────

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: RECEIVER_ID,
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Smith',
    displayName: 'Alice S.',
    avatar: null,
    email: 'alice@example.com',
    systemLanguage: 'en',
    isOnline: false,
    lastActiveAt: new Date('2024-01-10'),
    ...overrides,
  };
}

function makeFriendRequest(overrides: Record<string, any> = {}) {
  return {
    id: FR_ID,
    senderId: USER_ID,
    receiverId: RECEIVER_ID,
    status: 'pending',
    createdAt: new Date('2024-01-01'),
    sender: makeUser({ id: USER_ID, username: 'bob', displayName: 'Bob', email: 'bob@example.com' }),
    receiver: makeUser(),
    ...overrides,
  };
}

function makeConversation(overrides: Record<string, any> = {}) {
  return {
    id: CONVO_ID,
    identifier: `direct_${USER_ID}_${RECEIVER_ID}`,
    type: 'direct',
    ...overrides,
  };
}

// ─── Prisma factory ───────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue([makeFriendRequest()]),
      count: jest.fn<any>().mockResolvedValue(1),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
      update: jest.fn<any>().mockResolvedValue({ ...makeFriendRequest(), status: 'accepted' }),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(makeUser()),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue(makeConversation()),
    },
    affiliateToken: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  };
}

// ─── Mock fastify factory ─────────────────────────────────────────────────────

type RouteEntry = { method: string; path: string; handler: (req: any, reply: any) => Promise<any>; options: any };

function makeFastify(prismaOverrides: Record<string, any> = {}, services: Record<string, any> = {}) {
  const routes: RouteEntry[] = [];
  const pr = makePrisma(prismaOverrides);

  const fastify: any = {
    routes,
    prisma: pr,
    authenticate: jest.fn<any>(),
    notificationService: services.notificationService ?? null,
    emailService: services.emailService ?? null,
    log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    get: jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    patch: jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method: 'PATCH', path, handler, options });
    }),
    put: jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method: 'PUT', path, handler, options });
    }),
    delete: jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method: 'DELETE', path, handler, options });
    }),
  };

  return { fastify, pr };
}

function makeReply(): any {
  const reply: any = {
    _body: undefined,
    statusCode: 200,
    status: jest.fn<any>(),
    send: jest.fn<any>((body: any) => {
      reply._body = body;
      return reply;
    }),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

function makeAuthContext(overrides: Record<string, any> = {}) {
  return {
    isAuthenticated: true,
    registeredUser: { id: USER_ID, role: 'USER' },
    userId: USER_ID,
    isAnonymous: false,
    ...overrides,
  };
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    query: {},
    authContext: makeAuthContext(),
    ...overrides,
  };
}

function findRoute(routes: RouteEntry[], method: string, pathFragment: string): RouteEntry {
  const found = routes.find(
    (r) => r.method === method && r.path.includes(pathFragment)
  );
  if (!found) {
    throw new Error(
      `Route ${method} *${pathFragment}* not found. Available: ${routes.map((r) => `${r.method} ${r.path}`).join(', ')}`
    );
  }
  return found;
}

// ─── GET /users/friend-requests ───────────────────────────────────────────────

describe('getFriendRequests — GET /users/friend-requests', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(prismaOverrides: Record<string, any> = {}) {
    const { fastify, pr } = makeFastify(prismaOverrides);
    getFriendRequests(fastify);
    const route = findRoute(fastify.routes, 'GET', 'friend-requests');
    const reply = makeReply();
    return { fastify, pr, route, reply };
  }

  it('returns paginated list of friend requests for authenticated user', async () => {
    const { route, pr, reply } = setup();
    const req = makeReq({ query: { offset: '0', limit: '20' } });

    await route.handler(req, reply);

    expect(pr.friendRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ senderId: USER_ID }, { receiverId: USER_ID }] },
        skip: 0,
        take: 20,
      })
    );
    expect(mockSendPaginatedSuccess).toHaveBeenCalledWith(
      reply,
      expect.any(Array),
      expect.objectContaining({ total: 1 })
    );
  });

  it('applies default pagination when query params are absent', async () => {
    const { route, reply } = setup();
    const req = makeReq({ query: {} });

    await route.handler(req, reply);

    expect(mockSendPaginatedSuccess).toHaveBeenCalled();
  });

  it('returns 401 when authContext is absent', async () => {
    const { route, reply } = setup();
    const req = makeReq({ authContext: undefined });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when not authenticated', async () => {
    const { route, reply } = setup();
    const req = makeReq({ authContext: makeAuthContext({ isAuthenticated: false }) });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is null', async () => {
    const { route, reply } = setup();
    const req = makeReq({ authContext: makeAuthContext({ registeredUser: null }) });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 when prisma throws', async () => {
    const { route, reply } = setup({
      friendRequest: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
    const req = makeReq({ query: {} });

    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns empty array when no friend requests exist', async () => {
    const { route, reply } = setup({
      friendRequest: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
    const req = makeReq({ query: {} });

    await route.handler(req, reply);

    expect(mockSendPaginatedSuccess).toHaveBeenCalledWith(reply, [], expect.objectContaining({ total: 0 }));
  });
});

// ─── POST /users/friend-requests ─────────────────────────────────────────────

describe('sendFriendRequest — POST /users/friend-requests', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(
    prismaOverrides: Record<string, any> = {},
    services: Record<string, any> = {}
  ) {
    const { fastify, pr } = makeFastify(prismaOverrides, services);
    sendFriendRequest(fastify);
    const route = findRoute(fastify.routes, 'POST', 'friend-requests');
    const reply = makeReply();
    return { fastify, pr, route, reply };
  }

  it('creates a friend request and returns it', async () => {
    const { route, pr, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(null),
        create: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
      },
    });
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(pr.friendRequest.create).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ friendRequest: expect.any(Object) })
    );
  });

  it('returns 401 when authContext is absent', async () => {
    const { route, reply } = setup();
    const req = makeReq({ authContext: undefined, body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when not authenticated', async () => {
    const { route, reply } = setup();
    const req = makeReq({
      authContext: makeAuthContext({ isAuthenticated: false }),
      body: { receiverId: RECEIVER_ID },
    });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is null', async () => {
    const { route, reply } = setup();
    const req = makeReq({
      authContext: makeAuthContext({ registeredUser: null }),
      body: { receiverId: RECEIVER_ID },
    });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 400 when sender tries to add themselves', async () => {
    const { route, reply } = setup();
    const req = makeReq({
      authContext: makeAuthContext({ userId: USER_ID }),
      body: { receiverId: USER_ID }, // same as sender
    });

    await route.handler(req, reply);

    expect(mockSendBadRequest).toHaveBeenCalledWith(reply, expect.stringContaining('yourself'));
  });

  it('returns 404 when receiver does not exist', async () => {
    const { route, reply } = setup({
      user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    });
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 400 when a request already exists between users', async () => {
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
      },
    });
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(mockSendBadRequest).toHaveBeenCalledWith(reply, expect.stringContaining('already exists'));
  });

  it('calls notificationService when available', async () => {
    const createFriendRequestNotification = jest.fn<any>().mockResolvedValue({});
    const notificationService = { createFriendRequestNotification };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
        },
      },
      { notificationService }
    );
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(createFriendRequestNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: RECEIVER_ID })
    );
  });

  it('sends email when emailService available, receiver has email, and prefs allow', async () => {
    const sendFriendRequestEmail = jest.fn<any>().mockResolvedValue({});
    const emailService = { sendFriendRequestEmail };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
        },
        userPreferences: {
          findUnique: jest.fn<any>().mockResolvedValue({
            notification: { emailEnabled: true, contactRequestEnabled: true },
          }),
        },
      },
      { emailService }
    );
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(sendFriendRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com' })
    );
  });

  it('skips email when prefs disable email', async () => {
    const sendFriendRequestEmail = jest.fn<any>().mockResolvedValue({});
    const emailService = { sendFriendRequestEmail };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
        },
        userPreferences: {
          findUnique: jest.fn<any>().mockResolvedValue({
            notification: { emailEnabled: false },
          }),
        },
      },
      { emailService }
    );
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(sendFriendRequestEmail).not.toHaveBeenCalled();
  });

  it('skips email when receiver has no email', async () => {
    const sendFriendRequestEmail = jest.fn<any>().mockResolvedValue({});
    const emailService = { sendFriendRequestEmail };
    const { route, reply } = setup(
      {
        user: { findUnique: jest.fn<any>().mockResolvedValue(makeUser({ email: null })) },
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
        },
      },
      { emailService }
    );
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(sendFriendRequestEmail).not.toHaveBeenCalled();
  });

  it('handles notification service throwing (catch path)', async () => {
    const createFriendRequestNotification = jest.fn<any>().mockRejectedValue(new Error('notif fail'));
    const notificationService = { createFriendRequestNotification };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
        },
      },
      { notificationService }
    );
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    // Should still succeed even if notification fails
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('handles email service throwing (catch path)', async () => {
    const sendFriendRequestEmail = jest.fn<any>().mockRejectedValue(new Error('email fail'));
    const emailService = { sendFriendRequestEmail };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue(makeFriendRequest()),
        },
        userPreferences: {
          findUnique: jest.fn<any>().mockResolvedValue({
            notification: { emailEnabled: true, contactRequestEnabled: true },
          }),
        },
      },
      { emailService }
    );
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    // Should still succeed even if email fails
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('returns 500 on unexpected DB error', async () => {
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(null),
        create: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
    const req = makeReq({ body: { receiverId: RECEIVER_ID } });

    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 when Zod parse throws on malformed body', async () => {
    const { route, reply } = setup();
    // body missing receiverId entirely
    const req = makeReq({ body: {} });

    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── PATCH /users/friend-requests/:id — cancel ───────────────────────────────

describe('respondToFriendRequest — PATCH /users/friend-requests/:id (cancel)', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(prismaOverrides: Record<string, any> = {}, services: Record<string, any> = {}) {
    const { fastify, pr } = makeFastify(prismaOverrides, services);
    respondToFriendRequest(fastify);
    const route = findRoute(fastify.routes, 'PATCH', 'friend-requests/:id');
    const reply = makeReply();
    return { fastify, pr, route, reply };
  }

  it('sender can cancel a pending request', async () => {
    const fr = makeFriendRequest({ senderId: USER_ID, receiverId: RECEIVER_ID });
    const { route, pr, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
        delete: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'cancel' } });

    await route.handler(req, reply);

    expect(pr.friendRequest.delete).toHaveBeenCalledWith({ where: { id: FR_ID } });
    expect(mockSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ message: expect.stringContaining('cancelled') })
    );
  });

  it('returns 403 when non-sender tries to cancel', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID }); // USER_ID is receiver not sender
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'cancel' } });

    await route.handler(req, reply);

    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('sender'));
  });

  it('returns 404 when friend request not found', async () => {
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'cancel' } });

    await route.handler(req, reply);

    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when authContext is absent', async () => {
    const { route, reply } = setup();
    const req = makeReq({ authContext: undefined, params: { id: FR_ID }, body: { action: 'cancel' } });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when not authenticated', async () => {
    const { route, reply } = setup();
    const req = makeReq({
      authContext: makeAuthContext({ isAuthenticated: false }),
      params: { id: FR_ID },
      body: { action: 'cancel' },
    });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is null', async () => {
    const { route, reply } = setup();
    const req = makeReq({
      authContext: makeAuthContext({ registeredUser: null }),
      params: { id: FR_ID },
      body: { action: 'cancel' },
    });

    await route.handler(req, reply);

    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 on unexpected DB error during cancel delete', async () => {
    const fr = makeFriendRequest({ senderId: USER_ID });
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
        delete: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'cancel' } });

    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── PATCH /users/friend-requests/:id — accept ───────────────────────────────

describe('respondToFriendRequest — PATCH /users/friend-requests/:id (accept)', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(prismaOverrides: Record<string, any> = {}, services: Record<string, any> = {}) {
    const { fastify, pr } = makeFastify(prismaOverrides, services);
    respondToFriendRequest(fastify);
    const route = findRoute(fastify.routes, 'PATCH', 'friend-requests/:id');
    const reply = makeReply();
    return { fastify, pr, route, reply };
  }

  it('receiver can accept — creates conversation when none exists', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = { ...fr, status: 'accepted' };
    const { route, pr, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
        update: jest.fn<any>().mockResolvedValue(updatedFr),
      },
      conversation: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        create: jest.fn<any>().mockResolvedValue(makeConversation()),
      },
      user: { findUnique: jest.fn<any>().mockResolvedValue(makeUser()) },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    await route.handler(req, reply);

    expect(pr.conversation.create).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ message: expect.stringContaining('accepted') })
    );
  });

  it('receiver can accept — reuses existing conversation when one exists', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = { ...fr, status: 'accepted' };
    const { route, pr, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
        update: jest.fn<any>().mockResolvedValue(updatedFr),
      },
      conversation: {
        findFirst: jest.fn<any>().mockResolvedValue(makeConversation()),
        create: jest.fn<any>().mockResolvedValue(makeConversation()),
      },
      user: { findUnique: jest.fn<any>().mockResolvedValue(makeUser()) },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    await route.handler(req, reply);

    expect(pr.conversation.create).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('calls notificationService.createFriendAcceptedNotification on accept', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = { ...fr, status: 'accepted' };
    const createFriendAcceptedNotification = jest.fn<any>().mockResolvedValue({});
    const notificationService = { createFriendAcceptedNotification };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(fr),
          update: jest.fn<any>().mockResolvedValue(updatedFr),
        },
        conversation: {
          findFirst: jest.fn<any>().mockResolvedValue(makeConversation()),
          create: jest.fn<any>().mockResolvedValue(makeConversation()),
        },
        user: { findUnique: jest.fn<any>().mockResolvedValue(makeUser()) },
      },
      { notificationService }
    );
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    await route.handler(req, reply);

    expect(createFriendAcceptedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: RECEIVER_ID })
    );
  });

  it('sends friend-accepted email when sender prefs allow', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = {
      ...fr,
      status: 'accepted',
      receiver: makeUser({ id: USER_ID, displayName: 'Bob', username: 'bob', avatar: null }),
    };
    const sendFriendAcceptedEmail = jest.fn<any>().mockResolvedValue({});
    const emailService = { sendFriendAcceptedEmail };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(fr),
          update: jest.fn<any>().mockResolvedValue(updatedFr),
        },
        conversation: {
          findFirst: jest.fn<any>().mockResolvedValue(makeConversation()),
          create: jest.fn<any>().mockResolvedValue(makeConversation()),
        },
        user: {
          findUnique: jest.fn<any>().mockResolvedValue(
            makeUser({ email: 'alice@example.com', systemLanguage: 'fr' })
          ),
        },
        userPreferences: {
          findUnique: jest.fn<any>().mockResolvedValue({
            notification: { emailEnabled: true, contactRequestEnabled: true },
          }),
        },
      },
      { emailService }
    );
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    await route.handler(req, reply);

    expect(sendFriendAcceptedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com' })
    );
  });

  it('skips email when sender prefs disable emails', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = { ...fr, status: 'accepted' };
    const sendFriendAcceptedEmail = jest.fn<any>().mockResolvedValue({});
    const emailService = { sendFriendAcceptedEmail };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(fr),
          update: jest.fn<any>().mockResolvedValue(updatedFr),
        },
        conversation: {
          findFirst: jest.fn<any>().mockResolvedValue(makeConversation()),
          create: jest.fn<any>().mockResolvedValue(makeConversation()),
        },
        user: { findUnique: jest.fn<any>().mockResolvedValue(makeUser({ email: 'alice@example.com' })) },
        userPreferences: {
          findUnique: jest.fn<any>().mockResolvedValue({
            notification: { emailEnabled: false },
          }),
        },
      },
      { emailService }
    );
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    await route.handler(req, reply);

    expect(sendFriendAcceptedEmail).not.toHaveBeenCalled();
  });

  it('skips email when sender user has no email', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = { ...fr, status: 'accepted' };
    const sendFriendAcceptedEmail = jest.fn<any>().mockResolvedValue({});
    const emailService = { sendFriendAcceptedEmail };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(fr),
          update: jest.fn<any>().mockResolvedValue(updatedFr),
        },
        conversation: {
          findFirst: jest.fn<any>().mockResolvedValue(makeConversation()),
          create: jest.fn<any>().mockResolvedValue(makeConversation()),
        },
        user: { findUnique: jest.fn<any>().mockResolvedValue(makeUser({ email: null })) },
      },
      { emailService }
    );
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    await route.handler(req, reply);

    expect(sendFriendAcceptedEmail).not.toHaveBeenCalled();
  });

  it('handles notification throwing on accept (catch path)', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = { ...fr, status: 'accepted' };
    const createFriendAcceptedNotification = jest.fn<any>().mockRejectedValue(new Error('notif fail'));
    const notificationService = { createFriendAcceptedNotification };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(fr),
          update: jest.fn<any>().mockResolvedValue(updatedFr),
        },
        conversation: {
          findFirst: jest.fn<any>().mockResolvedValue(makeConversation()),
          create: jest.fn<any>().mockResolvedValue(makeConversation()),
        },
        user: { findUnique: jest.fn<any>().mockResolvedValue(makeUser()) },
      },
      { notificationService }
    );
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    // Should still succeed even if notification fails
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('handles email service throwing on accept (catch path)', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = {
      ...fr,
      status: 'accepted',
      receiver: makeUser({ id: USER_ID, displayName: 'Bob', username: 'bob', avatar: null }),
    };
    const sendFriendAcceptedEmail = jest.fn<any>().mockRejectedValue(new Error('email fail'));
    const emailService = { sendFriendAcceptedEmail };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(fr),
          update: jest.fn<any>().mockResolvedValue(updatedFr),
        },
        conversation: {
          findFirst: jest.fn<any>().mockResolvedValue(makeConversation()),
          create: jest.fn<any>().mockResolvedValue(makeConversation()),
        },
        user: {
          findUnique: jest.fn<any>().mockResolvedValue(
            makeUser({ email: 'alice@example.com', systemLanguage: 'fr' })
          ),
        },
        userPreferences: {
          findUnique: jest.fn<any>().mockResolvedValue({
            notification: { emailEnabled: true, contactRequestEnabled: true },
          }),
        },
      },
      { emailService }
    );
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    // Should still succeed even if email fails
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('returns 403 when non-receiver tries to accept', async () => {
    // USER_ID is the sender here, so cannot accept
    const fr = makeFriendRequest({ senderId: USER_ID, receiverId: RECEIVER_ID });
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    await route.handler(req, reply);

    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('receiver'));
  });

  it('returns 500 on DB error during update', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
        update: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'accept' } });

    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── PATCH /users/friend-requests/:id — reject ───────────────────────────────

describe('respondToFriendRequest — PATCH /users/friend-requests/:id (reject)', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(prismaOverrides: Record<string, any> = {}, services: Record<string, any> = {}) {
    const { fastify, pr } = makeFastify(prismaOverrides, services);
    respondToFriendRequest(fastify);
    const route = findRoute(fastify.routes, 'PATCH', 'friend-requests/:id');
    const reply = makeReply();
    return { fastify, pr, route, reply };
  }

  it('receiver can reject a pending request', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = { ...fr, status: 'rejected' };
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
        update: jest.fn<any>().mockResolvedValue(updatedFr),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'reject' } });

    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ message: expect.stringContaining('rejected') })
    );
  });

  it('creates system notification for sender on reject', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = {
      ...fr,
      status: 'rejected',
      receiver: makeUser({ displayName: 'Bob', username: 'bob' }),
    };
    const createSystemNotification = jest.fn<any>().mockResolvedValue({});
    const notificationService = { createSystemNotification };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(fr),
          update: jest.fn<any>().mockResolvedValue(updatedFr),
        },
      },
      { notificationService }
    );
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'reject' } });

    await route.handler(req, reply);

    expect(createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: RECEIVER_ID,
        priority: 'low',
        systemType: 'announcement',
      })
    );
  });

  it('handles notification service throwing on reject (catch path)', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const updatedFr = {
      ...fr,
      status: 'rejected',
      receiver: makeUser({ displayName: 'Bob', username: 'bob' }),
    };
    const createSystemNotification = jest.fn<any>().mockRejectedValue(new Error('notif fail'));
    const notificationService = { createSystemNotification };
    const { route, reply } = setup(
      {
        friendRequest: {
          ...makePrisma().friendRequest,
          findFirst: jest.fn<any>().mockResolvedValue(fr),
          update: jest.fn<any>().mockResolvedValue(updatedFr),
        },
      },
      { notificationService }
    );
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'reject' } });

    // Should still succeed even if notification fails
    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('returns 403 when non-receiver tries to reject', async () => {
    // USER_ID is the sender — cannot reject
    const fr = makeFriendRequest({ senderId: USER_ID, receiverId: RECEIVER_ID });
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'reject' } });

    await route.handler(req, reply);

    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('receiver'));
  });

  it('returns 500 when Zod parse fails on invalid action', async () => {
    const fr = makeFriendRequest({ senderId: RECEIVER_ID, receiverId: USER_ID });
    const { route, reply } = setup({
      friendRequest: {
        ...makePrisma().friendRequest,
        findFirst: jest.fn<any>().mockResolvedValue(fr),
      },
    });
    const req = makeReq({ params: { id: FR_ID }, body: { action: 'invalid-action' } });

    await route.handler(req, reply);

    // Zod will throw, caught by generic catch → 500
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─── GET /users/:userId/affiliate-token ──────────────────────────────────────

describe('getAffiliateToken — GET /users/:userId/affiliate-token', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup(prismaOverrides: Record<string, any> = {}) {
    const { fastify, pr } = makeFastify(prismaOverrides);
    getAffiliateToken(fastify);
    const route = findRoute(fastify.routes, 'GET', 'affiliate-token');
    const reply = makeReply();
    return { fastify, pr, route, reply };
  }

  it('returns token when user exists and has active affiliate token', async () => {
    const { route, pr, reply } = setup({
      affiliateToken: {
        findFirst: jest.fn<any>().mockResolvedValue({ token: 'tok-abc123' }),
      },
    });
    const req = makeReq({ params: { userId: USER_ID } });

    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { token: 'tok-abc123' });
  });

  it('returns null when user has no active affiliate token', async () => {
    const { route, reply } = setup({
      affiliateToken: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const req = makeReq({ params: { userId: USER_ID } });

    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, null);
  });

  it('returns 404 when user does not exist', async () => {
    const { route, reply } = setup({
      user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    });
    const req = makeReq({ params: { userId: 'nonexistent-user' } });

    await route.handler(req, reply);

    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 500 on DB error', async () => {
    const { route, reply } = setup({
      user: { findUnique: jest.fn<any>().mockRejectedValue(new Error('DB crash')) },
    });
    const req = makeReq({ params: { userId: USER_ID } });

    await route.handler(req, reply);

    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('queries affiliateToken with correct userId filter', async () => {
    const { route, pr, reply } = setup({
      affiliateToken: {
        findFirst: jest.fn<any>().mockResolvedValue({ token: 'tok-xyz' }),
      },
    });
    const req = makeReq({ params: { userId: USER_ID } });

    await route.handler(req, reply);

    expect(pr.affiliateToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdBy: USER_ID, isActive: true }),
      })
    );
  });
});

// ─── GET /users (stub) ────────────────────────────────────────────────────────

describe('getAllUsers — GET /users', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup() {
    const { fastify } = makeFastify();
    getAllUsers(fastify);
    const route = findRoute(fastify.routes, 'GET', '/users');
    const reply = makeReply();
    return { route, reply };
  }

  it('returns stub message', async () => {
    const { route, reply } = setup();
    const req = makeReq();

    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ message: expect.stringContaining('to be implemented') })
    );
  });
});

// ─── PUT /users/:id (stub) ────────────────────────────────────────────────────

describe('updateUserById — PUT /users/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup() {
    const { fastify } = makeFastify();
    updateUserById(fastify);
    const route = findRoute(fastify.routes, 'PUT', '/users/:id');
    const reply = makeReply();
    return { route, reply };
  }

  it('returns stub message', async () => {
    const { route, reply } = setup();
    const req = makeReq({ params: { id: USER_ID } });

    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ message: expect.stringContaining('to be implemented') })
    );
  });
});

// ─── DELETE /users/:id (stub) ─────────────────────────────────────────────────

describe('deleteUserById — DELETE /users/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  function setup() {
    const { fastify } = makeFastify();
    deleteUserById(fastify);
    const route = findRoute(fastify.routes, 'DELETE', '/users/:id');
    const reply = makeReply();
    return { route, reply };
  }

  it('returns stub message', async () => {
    const { route, reply } = setup();
    const req = makeReq({ params: { id: USER_ID } });

    await route.handler(req, reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ message: expect.stringContaining('to be implemented') })
    );
  });
});
