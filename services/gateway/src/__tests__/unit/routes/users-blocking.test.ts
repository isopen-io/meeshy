import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mock variables ────────────────────────────────────────────────────────────

const mockWithMutationLog = jest.fn<any>(async ({ op }: any) => op());

const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  reply._body = { success: true, data };
  reply._status = opts?.statusCode ?? 200;
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 401;
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 400;
  return reply;
});
const mockSendConflict = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 409;
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 404;
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 500;
  return reply;
});
const mockLogError = jest.fn<any>();
const mockIsValidMongoId = jest.fn<any>().mockReturnValue(true);

// ─── jest.mock calls ──────────────────────────────────────────────────────────

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: (...args: any[]) => mockWithMutationLog(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logError: (...args: any[]) => mockLogError(...args),
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  isValidMongoId: (...args: any[]) => mockIsValidMongoId(...args),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object' },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { blockUser, unblockUser, getBlockedUsers } from '../../../routes/users/blocking';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID = '507f1f77bcf86cd799439022';
const OTHER_USER_ID = '507f1f77bcf86cd799439033';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = () => ({
  user: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    findMany: jest.fn<any>().mockResolvedValue([]),
    update: jest.fn<any>().mockResolvedValue({}),
  },
});

const createMockFastify = () => {
  const routes: Record<string, Record<string, Function>> = {};
  const fastify: any = {
    prisma: makePrisma(),
    authenticate: jest.fn(),
    log: { warn: jest.fn(), error: jest.fn() },
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
    }),
    post: jest.fn((path: string, opts: any, handler: Function) => {
      routes['POST'] = routes['POST'] || {};
      routes['POST'][path] = handler;
    }),
    delete: jest.fn((path: string, opts: any, handler: Function) => {
      routes['DELETE'] = routes['DELETE'] || {};
      routes['DELETE'][path] = handler;
    }),
    _routes: routes,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, pathFragment: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  const key = Object.keys(methodRoutes).find(k => k === pathFragment)
    ?? Object.keys(methodRoutes).find(k => k.includes(pathFragment));
  if (!key) throw new Error(`No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeAuthContext = (overrides: any = {}) => ({
  isAuthenticated: true,
  userId: CURRENT_USER_ID,
  registeredUser: { id: CURRENT_USER_ID, role: 'USER' },
  isAnonymous: false,
  ...overrides,
});

const makeRequest = (overrides: any = {}) => ({
  params: { userId: TARGET_USER_ID },
  authContext: makeAuthContext(),
  ...overrides,
});

const makeReply = () => {
  const reply: any = { _body: null, _status: 200 };
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('blockUser route', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify();
    await blockUser(fastify);
    jest.clearAllMocks();
    mockIsValidMongoId.mockReturnValue(true);
    mockWithMutationLog.mockImplementation(async ({ op }: any) => op());
    mockSendSuccess.mockImplementation((reply: any, data: any, opts?: any) => {
      reply._body = { success: true, data };
      reply._status = opts?.statusCode ?? 200;
      return reply;
    });
    mockSendUnauthorized.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 401;
      return reply;
    });
    mockSendBadRequest.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 400;
      return reply;
    });
    mockSendConflict.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 409;
      return reply;
    });
    mockSendNotFound.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 404;
      return reply;
    });
    mockSendInternalError.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 500;
      return reply;
    });
  });

  it('blocks user successfully', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce({ id: TARGET_USER_ID }) // targetUser
      .mockResolvedValueOnce({ blockedUserIds: [] }); // currentUser

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(mockWithMutationLog).toHaveBeenCalled();
    expect(fastify.prisma.user.update).toHaveBeenCalledWith({
      where: { id: CURRENT_USER_ID },
      data: { blockedUserIds: { push: TARGET_USER_ID } },
    });
    expect(reply._body).toMatchObject({ success: true, data: { message: 'User blocked' } });
  });

  it('returns 401 when authContext is missing', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    const req = makeRequest({ authContext: null });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 401 when user is not authenticated', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    const req = makeRequest({ authContext: makeAuthContext({ isAuthenticated: false, registeredUser: null }) });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 400 for invalid userId format', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    mockIsValidMongoId.mockReturnValue(false);

    const req = makeRequest({ params: { userId: 'not-a-mongo-id' } });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: 'Invalid user ID format' });
  });

  it('returns 400 when trying to block yourself', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    const req = makeRequest({ params: { userId: CURRENT_USER_ID } });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(400);
    expect(reply._body).toMatchObject({ error: 'You cannot block yourself' });
  });

  it('returns 404 when target user not found', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    fastify.prisma.user.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(404);
  });

  it('returns 409 when user is already blocked', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce({ id: TARGET_USER_ID })
      .mockResolvedValueOnce({ blockedUserIds: [TARGET_USER_ID] });

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(409);
  });

  it('uses onDuplicate callback for idempotent blocking', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce({ id: TARGET_USER_ID })
      .mockResolvedValueOnce({ blockedUserIds: [] });
    mockWithMutationLog.mockImplementation(async ({ onDuplicate }: any) => onDuplicate());

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._body).toMatchObject({ success: true });
  });

  it('returns 500 on unexpected error in blockUser', async () => {
    const handler = getHandler(fastify, 'POST', '/users/:userId/block');
    fastify.prisma.user.findUnique.mockRejectedValue(new Error('DB failure'));

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(500);
    expect(mockLogError).toHaveBeenCalled();
  });
});

describe('unblockUser route', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify();
    await unblockUser(fastify);
    jest.clearAllMocks();
    mockIsValidMongoId.mockReturnValue(true);
    mockWithMutationLog.mockImplementation(async ({ op }: any) => op());
    mockSendSuccess.mockImplementation((reply: any, data: any, opts?: any) => {
      reply._body = { success: true, data }; reply._status = opts?.statusCode ?? 200; return reply;
    });
    mockSendUnauthorized.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg }; reply._status = 401; return reply;
    });
    mockSendBadRequest.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg }; reply._status = 400; return reply;
    });
    mockSendNotFound.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg }; reply._status = 404; return reply;
    });
    mockSendInternalError.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg }; reply._status = 500; return reply;
    });
  });

  it('unblocks user successfully', async () => {
    const handler = getHandler(fastify, 'DELETE', '/users/:userId/block');
    fastify.prisma.user.findUnique.mockResolvedValue({ blockedUserIds: [TARGET_USER_ID] });

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(fastify.prisma.user.update).toHaveBeenCalledWith({
      where: { id: CURRENT_USER_ID },
      data: { blockedUserIds: { set: [] } },
    });
    expect(reply._body).toMatchObject({ success: true, data: { message: 'User unblocked' } });
  });

  it('returns 401 when not authenticated', async () => {
    const handler = getHandler(fastify, 'DELETE', '/users/:userId/block');
    const req = makeRequest({ authContext: null });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 400 for invalid userId format', async () => {
    const handler = getHandler(fastify, 'DELETE', '/users/:userId/block');
    mockIsValidMongoId.mockReturnValue(false);

    const req = makeRequest({ params: { userId: 'invalid-id' } });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(400);
  });

  it('returns 404 when user is not in blocked list', async () => {
    const handler = getHandler(fastify, 'DELETE', '/users/:userId/block');
    fastify.prisma.user.findUnique.mockResolvedValue({ blockedUserIds: [OTHER_USER_ID] });

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(404);
  });

  it('uses onDuplicate callback for idempotent unblocking', async () => {
    const handler = getHandler(fastify, 'DELETE', '/users/:userId/block');
    fastify.prisma.user.findUnique.mockResolvedValue({ blockedUserIds: [TARGET_USER_ID] });
    mockWithMutationLog.mockImplementation(async ({ onDuplicate }: any) => onDuplicate());

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._body).toMatchObject({ success: true });
  });

  it('returns 500 on error in unblockUser', async () => {
    const handler = getHandler(fastify, 'DELETE', '/users/:userId/block');
    fastify.prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = makeRequest();
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(500);
  });
});

describe('getBlockedUsers route', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify();
    await getBlockedUsers(fastify);
    jest.clearAllMocks();
    mockSendSuccess.mockImplementation((reply: any, data: any, opts?: any) => {
      reply._body = { success: true, data }; reply._status = opts?.statusCode ?? 200; return reply;
    });
    mockSendUnauthorized.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg }; reply._status = 401; return reply;
    });
    mockSendInternalError.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg }; reply._status = 500; return reply;
    });
  });

  it('returns empty array when no blocked users', async () => {
    const handler = getHandler(fastify, 'GET', '/users/me/blocked-users');
    fastify.prisma.user.findUnique.mockResolvedValue({ blockedUserIds: [] });

    const req = makeRequest({ params: {} });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._body).toMatchObject({ success: true, data: [] });
  });

  it('returns empty array when currentUser not found', async () => {
    const handler = getHandler(fastify, 'GET', '/users/me/blocked-users');
    fastify.prisma.user.findUnique.mockResolvedValue(null);

    const req = makeRequest({ params: {} });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._body).toMatchObject({ success: true, data: [] });
  });

  it('returns list of blocked users', async () => {
    const handler = getHandler(fastify, 'GET', '/users/me/blocked-users');
    const blockedUser = { id: TARGET_USER_ID, username: 'blocked_user', displayName: 'Blocked', avatar: null };
    fastify.prisma.user.findUnique.mockResolvedValue({ blockedUserIds: [TARGET_USER_ID] });
    fastify.prisma.user.findMany.mockResolvedValue([blockedUser]);

    const req = makeRequest({ params: {} });
    const reply = makeReply();

    await handler(req, reply);

    expect(fastify.prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: [TARGET_USER_ID] } },
      select: { id: true, username: true, displayName: true, avatar: true },
    });
    expect(reply._body).toMatchObject({ success: true, data: [blockedUser] });
  });

  it('returns 401 when not authenticated for getBlockedUsers', async () => {
    const handler = getHandler(fastify, 'GET', '/users/me/blocked-users');
    const req = makeRequest({ params: {}, authContext: null });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(401);
  });

  it('returns 500 on error in getBlockedUsers', async () => {
    const handler = getHandler(fastify, 'GET', '/users/me/blocked-users');
    fastify.prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    const req = makeRequest({ params: {} });
    const reply = makeReply();

    await handler(req, reply);

    expect(reply._status).toBe(500);
  });
});
