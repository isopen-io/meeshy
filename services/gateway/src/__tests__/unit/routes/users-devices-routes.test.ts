/**
 * users-devices-routes.test.ts
 *
 * Unit tests for src/routes/users/devices.ts
 * Covers:
 *   - getFriendRequests          → GET  /users/friend-requests
 *   - sendFriendRequest          → POST /users/friend-requests
 *   - respondToFriendRequest     → PATCH /users/friend-requests/:id
 *   - getAffiliateToken          → GET  /users/:userId/affiliate-token
 *   - getAllUsers                 → GET  /users
 *   - updateUserById             → PUT  /users/:id
 *   - deleteUserById             → DELETE /users/:id
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  userMinimalSchema:   { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import {
  getFriendRequests,
  sendFriendRequest,
  respondToFriendRequest,
  getAffiliateToken,
  getAllUsers,
  updateUserById,
  deleteUserById,
} from '../../../routes/users/devices';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID     = '507f1f77bcf86cd799439011';
const RECEIVER_ID = '507f1f77bcf86cd799439022';
const REQUEST_ID  = '507f1f77bcf86cd799439033';
const CONV_ID     = '507f1f77bcf86cd799439044';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockFriendRequestFindMany  = jest.fn<any>();
const mockFriendRequestCount     = jest.fn<any>();
const mockFriendRequestFindFirst = jest.fn<any>();
const mockFriendRequestCreate    = jest.fn<any>();
const mockFriendRequestUpdate    = jest.fn<any>();
const mockFriendRequestDelete    = jest.fn<any>();
const mockUserFindUnique         = jest.fn<any>();
const mockConversationFindFirst  = jest.fn<any>();
const mockConversationCreate     = jest.fn<any>();
const mockUserPrefFindUnique     = jest.fn<any>();
const mockAffiliateTokenFindFirst = jest.fn<any>();

const mockPrisma: any = {
  friendRequest: {
    findMany:  mockFriendRequestFindMany,
    count:     mockFriendRequestCount,
    findFirst: mockFriendRequestFindFirst,
    create:    mockFriendRequestCreate,
    update:    mockFriendRequestUpdate,
    delete:    mockFriendRequestDelete,
  },
  user: {
    findUnique: mockUserFindUnique,
  },
  conversation: {
    findFirst: mockConversationFindFirst,
    create:    mockConversationCreate,
  },
  userPreferences: {
    findUnique: mockUserPrefFindUnique,
  },
  affiliateToken: {
    findFirst: mockAffiliateTokenFindFirst,
  },
};

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockCreateFriendRequestNotification = jest.fn<any>();
const mockCreateFriendAcceptedNotification = jest.fn<any>();
const mockCreateSystemNotification = jest.fn<any>();
const mockNotificationService: any = {
  createFriendRequestNotification:  (...args: any[]) => mockCreateFriendRequestNotification(...args),
  createFriendAcceptedNotification: (...args: any[]) => mockCreateFriendAcceptedNotification(...args),
  createSystemNotification:         (...args: any[]) => mockCreateSystemNotification(...args),
};

const mockSendFriendRequestEmail  = jest.fn<any>();
const mockSendFriendAcceptedEmail = jest.fn<any>();
const mockEmailService: any = {
  sendFriendRequestEmail:  (...args: any[]) => mockSendFriendRequestEmail(...args),
  sendFriendAcceptedEmail: (...args: any[]) => mockSendFriendAcceptedEmail(...args),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAuthCtx(userId = USER_ID) {
  return { isAuthenticated: true, registeredUser: { id: userId }, userId };
}

function unauthCtx() {
  return { isAuthenticated: false, registeredUser: null, userId: '' };
}

function makeFriendRequest(overrides: any = {}) {
  return {
    id: REQUEST_ID,
    senderId: USER_ID,
    receiverId: RECEIVER_ID,
    status: 'pending',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    sender: { id: USER_ID,     username: 'sender',   displayName: 'Sender',   avatar: null, firstName: 'S', lastName: 'U' },
    receiver: { id: RECEIVER_ID, username: 'receiver', displayName: 'Receiver', avatar: null, firstName: 'R', lastName: 'U' },
    ...overrides,
  };
}

function makeReceiver(overrides: any = {}) {
  return {
    id: RECEIVER_ID, username: 'receiver', displayName: 'Receiver',
    firstName: 'R', lastName: 'U', avatar: null, email: 'receiver@example.com',
    systemLanguage: 'en',
    ...overrides,
  };
}

function buildApp(authContext?: any, register?: string[]): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  const ctx = authContext ?? defaultAuthCtx();
  app.decorate('authenticate', async (req: any) => { req.authContext = ctx; });
  app.decorate('prisma', mockPrisma);
  app.decorate('notificationService', mockNotificationService);
  app.decorate('emailService', mockEmailService);

  const all = register ?? ['getFriendRequests', 'sendFriendRequest', 'respondToFriendRequest',
                            'getAffiliateToken', 'getAllUsers', 'updateUserById', 'deleteUserById'];
  if (all.includes('getFriendRequests'))      app.register(getFriendRequests);
  if (all.includes('sendFriendRequest'))      app.register(sendFriendRequest);
  if (all.includes('respondToFriendRequest')) app.register(respondToFriendRequest);
  if (all.includes('getAffiliateToken'))      app.register(getAffiliateToken);
  if (all.includes('getAllUsers'))            app.register(getAllUsers);
  if (all.includes('updateUserById'))         app.register(updateUserById);
  if (all.includes('deleteUserById'))         app.register(deleteUserById);
  return app;
}

// ---------------------------------------------------------------------------
// GET /users/friend-requests
// ---------------------------------------------------------------------------

describe('GET /users/friend-requests', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFriendRequestFindMany.mockReset();
    mockFriendRequestCount.mockReset();
    app = buildApp(undefined, ['getFriendRequests']);
    mockFriendRequestFindMany.mockResolvedValue([]);
    mockFriendRequestCount.mockResolvedValue(0);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with paginated empty list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/friend-requests' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with friend requests when found', async () => {
    mockFriendRequestFindMany.mockResolvedValue([makeFriendRequest()]);
    mockFriendRequestCount.mockResolvedValue(1);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/friend-requests' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx(), ['getFriendRequests']);
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/users/friend-requests' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockFriendRequestFindMany.mockReset();
    mockFriendRequestFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users/friend-requests' });
    expect(res.statusCode).toBe(500);
  });

  it('searches both sent and received requests', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/users/friend-requests' });
    expect(mockFriendRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ senderId: USER_ID }),
            expect.objectContaining({ receiverId: USER_ID }),
          ]),
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /users/friend-requests
// ---------------------------------------------------------------------------

describe('POST /users/friend-requests', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockFriendRequestFindFirst.mockReset();
    mockFriendRequestCreate.mockReset();
    mockUserPrefFindUnique.mockReset();
    app = buildApp(undefined, ['sendFriendRequest']);
    mockUserFindUnique.mockResolvedValue(makeReceiver());
    mockFriendRequestFindFirst.mockResolvedValue(null);
    mockFriendRequestCreate.mockResolvedValue(makeFriendRequest());
    mockUserPrefFindUnique.mockResolvedValue(null);
    mockCreateFriendRequestNotification.mockResolvedValue(undefined);
    mockSendFriendRequestEmail.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 and creates friend request', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/friend-requests',
      payload: { receiverId: RECEIVER_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Friend request sent successfully');
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx(), ['sendFriendRequest']);
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST',
      url: '/users/friend-requests',
      payload: { receiverId: RECEIVER_ID },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when sender tries to add themselves', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/friend-requests',
      payload: { receiverId: USER_ID },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when receiver not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/friend-requests',
      payload: { receiverId: RECEIVER_ID },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when request already exists', async () => {
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/friend-requests',
      payload: { receiverId: RECEIVER_ID },
    });
    expect(res.statusCode).toBe(400);
  });

  it('calls notificationService after creating request', async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/users/friend-requests',
      payload: { receiverId: RECEIVER_ID },
    });
    expect(mockCreateFriendRequestNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: RECEIVER_ID, requesterId: USER_ID })
    );
  });

  it('returns 500 on DB error', async () => {
    mockUserFindUnique.mockReset();
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/users/friend-requests',
      payload: { receiverId: RECEIVER_ID },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /users/friend-requests/:id
// ---------------------------------------------------------------------------

describe('PATCH /users/friend-requests/:id', () => {
  let app: FastifyInstance;

  function makeUpdatedRequest(overrides: any = {}) {
    return {
      ...makeFriendRequest(),
      status: 'accepted',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFriendRequestFindFirst.mockReset();
    mockFriendRequestDelete.mockReset();
    mockFriendRequestUpdate.mockReset();
    mockConversationFindFirst.mockReset();
    mockConversationCreate.mockReset();
    mockUserFindUnique.mockReset();
    mockUserPrefFindUnique.mockReset();
    app = buildApp(defaultAuthCtx(RECEIVER_ID), ['respondToFriendRequest']);
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest());
    mockFriendRequestDelete.mockResolvedValue(undefined);
    mockFriendRequestUpdate.mockResolvedValue(makeUpdatedRequest());
    mockConversationFindFirst.mockResolvedValue({ id: CONV_ID });
    mockConversationCreate.mockResolvedValue({ id: CONV_ID });
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, email: null, displayName: 'Sender', username: 'sender', systemLanguage: 'en' });
    mockUserPrefFindUnique.mockResolvedValue(null);
    mockCreateFriendAcceptedNotification.mockResolvedValue(undefined);
    mockCreateSystemNotification.mockResolvedValue(undefined);
    mockSendFriendAcceptedEmail.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when receiver accepts request', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Friend request accepted');
  });

  it('returns 200 when receiver rejects request', async () => {
    mockFriendRequestUpdate.mockResolvedValue(makeUpdatedRequest({ status: 'rejected' }));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'reject' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.message).toBe('Friend request rejected');
  });

  it('returns 200 when sender cancels request', async () => {
    // Rebuild app with sender auth context
    await app.close();
    app = buildApp(defaultAuthCtx(USER_ID), ['respondToFriendRequest']);
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest());
    mockFriendRequestDelete.mockResolvedValue(undefined);
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'cancel' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.message).toBe('Friend request cancelled successfully');
    expect(mockFriendRequestDelete).toHaveBeenCalled();
  });

  it('returns 403 when non-sender tries to cancel', async () => {
    // App is built with RECEIVER_ID but request.senderId = USER_ID (different)
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'cancel' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when non-receiver tries to accept', async () => {
    await app.close();
    // Rebuild as third-party user (neither sender nor receiver)
    const thirdPartyId = '507f1f77bcf86cd799439055';
    app = buildApp(defaultAuthCtx(thirdPartyId), ['respondToFriendRequest']);
    mockFriendRequestFindFirst.mockResolvedValue(makeFriendRequest());
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when request not found or already processed', async () => {
    mockFriendRequestFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp(unauthCtx(), ['respondToFriendRequest']);
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('creates conversation when none exists on accept', async () => {
    mockConversationFindFirst.mockResolvedValue(null);
    await app.ready();
    await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(mockConversationCreate).toHaveBeenCalled();
  });

  it('skips conversation creation when one already exists', async () => {
    mockConversationFindFirst.mockResolvedValue({ id: CONV_ID });
    await app.ready();
    await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(mockConversationCreate).not.toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockFriendRequestFindFirst.mockReset();
    mockFriendRequestFindFirst.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /users/:userId/affiliate-token
// ---------------------------------------------------------------------------

describe('GET /users/:userId/affiliate-token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockReset();
    mockAffiliateTokenFindFirst.mockReset();
    app = buildApp(undefined, ['getAffiliateToken']);
    mockUserFindUnique.mockResolvedValue({ id: USER_ID });
    mockAffiliateTokenFindFirst.mockResolvedValue({ token: 'aff-token-abc' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with affiliate token when found', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}/affiliate-token` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ token: 'aff-token-abc' });
  });

  it('returns 200 with null when no active token exists', async () => {
    mockAffiliateTokenFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}/affiliate-token` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeNull();
  });

  it('returns 404 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}/affiliate-token` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindUnique.mockReset();
    mockUserFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/users/${USER_ID}/affiliate-token` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Stub routes
// ---------------------------------------------------------------------------

describe('Stub routes (GET /users, PUT /users/:id, DELETE /users/:id)', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp(undefined, ['getAllUsers', 'updateUserById', 'deleteUserById']);
  });

  afterEach(async () => { await app.close(); });

  it('GET /users returns 200 with stub message', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/users' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('PUT /users/:id returns 200 with stub message', async () => {
    await app.ready();
    const res = await app.inject({ method: 'PUT', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('DELETE /users/:id returns 200 with stub message', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/users/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });
});
