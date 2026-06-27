/**
 * friends-routes.test.ts
 *
 * Unit tests for src/routes/friends.ts
 * Covers:
 *   - POST   /friend-requests
 *   - GET    /friend-requests/received
 *   - GET    /friend-requests/sent
 *   - PATCH  /friend-requests/:id
 *   - DELETE /friend-requests/:id
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  friendRequestSchema:       { type: 'object', additionalProperties: true },
  sendFriendRequestSchema:   { type: 'object', additionalProperties: true },
  respondFriendRequestSchema: { type: 'object', additionalProperties: true },
  userMinimalSchema:         { type: 'object', additionalProperties: true },
  errorResponseSchema:       { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logWarn:  jest.fn(),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: ({ op }: { op: () => any }) => op(),
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import { friendRequestRoutes } from '../../../routes/friends';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID    = '507f1f77bcf86cd799439011';
const TARGET_ID  = '507f1f77bcf86cd799439022';
const REQUEST_ID = '507f1f77bcf86cd799439033';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockUserFindUnique         = jest.fn<any>();
const mockFriendRequestFindFirst = jest.fn<any>();
const mockFriendRequestFindMany  = jest.fn<any>();
const mockFriendRequestCount     = jest.fn<any>();
const mockFriendRequestCreate    = jest.fn<any>();
const mockFriendRequestUpdate    = jest.fn<any>();
const mockFriendRequestDelete    = jest.fn<any>();
const mockFriendRequestFindUnique = jest.fn<any>();
const mockNotificationFindMany   = jest.fn<any>();
const mockNotificationUpdate     = jest.fn<any>();
const mockConversationFindFirst  = jest.fn<any>();
const mockConversationCreate     = jest.fn<any>();
const mockUserFindFirst          = jest.fn<any>();

const mockPrisma: any = {
  user: {
    findUnique: (...args: any[]) => mockUserFindUnique(...args),
    findFirst:  (...args: any[]) => mockUserFindFirst(...args),
  },
  friendRequest: {
    findFirst:  (...args: any[]) => mockFriendRequestFindFirst(...args),
    findMany:   (...args: any[]) => mockFriendRequestFindMany(...args),
    count:      (...args: any[]) => mockFriendRequestCount(...args),
    create:     (...args: any[]) => mockFriendRequestCreate(...args),
    update:     (...args: any[]) => mockFriendRequestUpdate(...args),
    delete:     (...args: any[]) => mockFriendRequestDelete(...args),
    findUnique: (...args: any[]) => mockFriendRequestFindUnique(...args),
  },
  notification: {
    findMany: (...args: any[]) => mockNotificationFindMany(...args),
    update:   (...args: any[]) => mockNotificationUpdate(...args),
  },
  conversation: {
    findFirst: (...args: any[]) => mockConversationFindFirst(...args),
    create:    (...args: any[]) => mockConversationCreate(...args),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFriendRequest(overrides: any = {}): any {
  return {
    id: REQUEST_ID,
    senderId: USER_ID,
    receiverId: TARGET_ID,
    status: 'pending',
    message: null,
    createdAt: new Date('2024-01-01'),
    sender: {
      id: USER_ID, username: 'sender', firstName: 'Sender', lastName: 'User',
      displayName: 'Sender User', avatar: null, isOnline: false, lastActiveAt: null,
    },
    receiver: {
      id: TARGET_ID, username: 'receiver', firstName: 'Receiver', lastName: 'User',
      displayName: 'Receiver User', avatar: null, isOnline: false, lastActiveAt: null,
    },
    ...overrides,
  };
}

const mockNotificationService: any = {
  createFriendRequestNotification: jest.fn<any>().mockResolvedValue(undefined),
  createFriendAcceptedNotification: jest.fn<any>().mockResolvedValue(undefined),
  createSystemNotification: jest.fn<any>().mockResolvedValue(undefined),
};

function buildApp(opts: { withNotificationService?: boolean; withSocialEvents?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });

  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: USER_ID };
  });
  app.decorate('prisma', mockPrisma);

  if (opts.withNotificationService) {
    app.decorate('notificationService', mockNotificationService);
  }

  if (opts.withSocialEvents) {
    app.decorate('socialEvents', {
      invalidateFriendsCache: jest.fn(),
    });
  }

  app.register(friendRequestRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// POST /friend-requests
// ---------------------------------------------------------------------------

describe('POST /friend-requests', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockFriendRequestFindFirst.mockReset();
    mockFriendRequestCreate.mockReset();
    app = buildApp();
    mockUserFindUnique.mockResolvedValue({ id: TARGET_ID });
    mockFriendRequestFindFirst.mockResolvedValue(null);
    mockFriendRequestCreate.mockResolvedValue(makeFriendRequest());
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 on successful send', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/friend-requests',
      payload: { receiverId: TARGET_ID },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls friendRequest.create with correct args', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/friend-requests',
      payload: { receiverId: TARGET_ID, message: 'Hello!' },
    });
    expect(mockFriendRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderId: USER_ID, receiverId: TARGET_ID, message: 'Hello!' }),
      })
    );
  });

  it('returns 404 when target user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/friend-requests',
      payload: { receiverId: TARGET_ID },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when request already exists', async () => {
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest());
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/friend-requests',
      payload: { receiverId: TARGET_ID },
    });
    expect(res.statusCode).toBe(409);
  });

  it('sends notification when service is available', async () => {
    const appWithNotif = buildApp({ withNotificationService: true });
    await appWithNotif.ready();
    await appWithNotif.inject({
      method: 'POST', url: '/friend-requests',
      payload: { receiverId: TARGET_ID },
    });
    await appWithNotif.close();
    expect(mockNotificationService.createFriendRequestNotification).toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockFriendRequestCreate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/friend-requests',
      payload: { receiverId: TARGET_ID },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /friend-requests/received
// ---------------------------------------------------------------------------

describe('GET /friend-requests/received', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFriendRequestFindMany.mockReset();
    mockFriendRequestCount.mockReset();
    app = buildApp();
    mockFriendRequestFindMany.mockResolvedValue([makeFriendRequest()]);
    mockFriendRequestCount.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with received requests', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/friend-requests/received' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('queries only pending requests for current user', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/friend-requests/received' });
    expect(mockFriendRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receiverId: USER_ID, status: 'pending' }),
      })
    );
  });

  it('supports pagination', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/friend-requests/received?offset=5&limit=10' });
    expect(res.statusCode).toBe(200);
    expect(mockFriendRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 10 })
    );
  });

  it('returns 500 on DB error', async () => {
    mockFriendRequestFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/friend-requests/received' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /friend-requests/sent
// ---------------------------------------------------------------------------

describe('GET /friend-requests/sent', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFriendRequestFindMany.mockReset();
    mockFriendRequestCount.mockReset();
    app = buildApp();
    mockFriendRequestFindMany.mockResolvedValue([makeFriendRequest()]);
    mockFriendRequestCount.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with sent requests', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/friend-requests/sent' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('queries by senderId of current user', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/friend-requests/sent' });
    expect(mockFriendRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { senderId: USER_ID },
      })
    );
  });

  it('returns 500 on DB error', async () => {
    mockFriendRequestFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/friend-requests/sent' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /friend-requests/:id
// ---------------------------------------------------------------------------

describe('PATCH /friend-requests/:id', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFriendRequestFindFirst.mockReset();
    mockFriendRequestUpdate.mockReset();
    mockNotificationFindMany.mockReset();
    mockConversationFindFirst.mockReset();
    app = buildApp();
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest({ receiverId: USER_ID }));
    mockFriendRequestUpdate.mockResolvedValue(makeFriendRequest({ status: 'accepted', receiverId: USER_ID }));
    mockNotificationFindMany.mockResolvedValue([]);
    mockConversationFindFirst.mockResolvedValue({ id: 'conv-1' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on accept', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/friend-requests/${REQUEST_ID}`,
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 200 on reject', async () => {
    mockFriendRequestUpdate.mockResolvedValue(makeFriendRequest({ status: 'rejected', receiverId: USER_ID }));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/friend-requests/${REQUEST_ID}`,
      payload: { status: 'rejected' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when request not found', async () => {
    mockFriendRequestFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/friend-requests/${REQUEST_ID}`,
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('creates conversation on accept when none exists', async () => {
    mockConversationFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ displayName: 'Test User', username: 'testuser' });
    mockConversationCreate.mockResolvedValue({ id: 'new-conv-1' });
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/friend-requests/${REQUEST_ID}`,
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockConversationCreate).toHaveBeenCalled();
  });

  it('skips conversation creation if already exists on accept', async () => {
    mockConversationFindFirst.mockResolvedValue({ id: 'existing-conv' });
    await app.ready();
    await app.inject({
      method: 'PATCH', url: `/friend-requests/${REQUEST_ID}`,
      payload: { status: 'accepted' },
    });
    expect(mockConversationCreate).not.toHaveBeenCalled();
  });

  it('sends accept notification when service is available', async () => {
    const appWithNotif = buildApp({ withNotificationService: true });
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest({ receiverId: USER_ID }));
    mockFriendRequestUpdate.mockResolvedValue(makeFriendRequest({ status: 'accepted', receiverId: USER_ID }));
    mockNotificationFindMany.mockResolvedValue([]);
    mockConversationFindFirst.mockResolvedValue({ id: 'conv-1' });
    await appWithNotif.ready();
    await appWithNotif.inject({
      method: 'PATCH', url: `/friend-requests/${REQUEST_ID}`,
      payload: { status: 'accepted' },
    });
    await appWithNotif.close();
    expect(mockNotificationService.createFriendAcceptedNotification).toHaveBeenCalled();
  });

  it('invalidates friends cache on accept when socialEvents is available', async () => {
    const invalidateFriendsCache = jest.fn<any>();
    const appWithSocial = buildApp({ withSocialEvents: false });
    appWithSocial.decorate('socialEvents', { invalidateFriendsCache });
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest({ receiverId: USER_ID }));
    mockFriendRequestUpdate.mockResolvedValue(makeFriendRequest({ status: 'accepted', receiverId: USER_ID }));
    mockNotificationFindMany.mockResolvedValue([]);
    mockConversationFindFirst.mockResolvedValue({ id: 'conv-1' });
    await appWithSocial.ready();
    await appWithSocial.inject({
      method: 'PATCH', url: `/friend-requests/${REQUEST_ID}`,
      payload: { status: 'accepted' },
    });
    await appWithSocial.close();
    expect(invalidateFriendsCache).toHaveBeenCalledTimes(2);
  });

  it('returns 500 on DB error', async () => {
    mockFriendRequestUpdate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/friend-requests/${REQUEST_ID}`,
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /friend-requests/:id
// ---------------------------------------------------------------------------

describe('DELETE /friend-requests/:id', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFriendRequestFindFirst.mockReset();
    mockFriendRequestDelete.mockReset();
    app = buildApp();
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest());
    mockFriendRequestDelete.mockResolvedValue(makeFriendRequest());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful delete', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/friend-requests/${REQUEST_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("Demande d'ami supprimee");
  });

  it('returns 404 when request not found or user not party', async () => {
    mockFriendRequestFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/friend-requests/${REQUEST_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('queries for requests where user is sender OR receiver', async () => {
    await app.ready();
    await app.inject({ method: 'DELETE', url: `/friend-requests/${REQUEST_ID}` });
    expect(mockFriendRequestFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: REQUEST_ID,
          OR: expect.arrayContaining([
            { senderId: USER_ID },
            { receiverId: USER_ID },
          ]),
        }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    mockFriendRequestDelete.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/friend-requests/${REQUEST_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
