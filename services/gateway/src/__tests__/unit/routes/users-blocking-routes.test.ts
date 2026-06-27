/**
 * users-blocking-routes.test.ts
 *
 * Unit tests for src/routes/users/blocking.ts
 * Covers: POST /users/:userId/block, DELETE /users/:userId/block,
 *         GET /users/me/blocked-users
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

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  isValidMongoId: jest.fn((id: string) =>
    typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id)
  ),
}));

const mockWithMutationLog = jest.fn<any>(async ({ op }: any) => op());
jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: (...args: any[]) => mockWithMutationLog(...args),
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import { blockUser, unblockUser, getBlockedUsers } from '../../../routes/users/blocking';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID        = '507f1f77bcf86cd799439011';
const TARGET_USER_ID = '507f1f77bcf86cd799439022';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUser = {
  findUnique: jest.fn<any>(),
  findMany:   jest.fn<any>(),
  update:     jest.fn<any>(),
};

const mockPrisma: any = {
  user: mockUser,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = authContext ?? {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER' },
      userId: USER_ID,
    };
  });
  app.register(blockUser);
  app.register(unblockUser);
  app.register(getBlockedUsers);
  return app;
}

// ---------------------------------------------------------------------------
// POST /users/:userId/block
// ---------------------------------------------------------------------------

describe('POST /users/:userId/block', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWithMutationLog.mockImplementation(async ({ op }: any) => op());
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when user blocked successfully', async () => {
    await app.ready();
    mockUser.findUnique
      .mockResolvedValueOnce({ id: TARGET_USER_ID })              // target exists
      .mockResolvedValueOnce({ blockedUserIds: [] });              // current user
    mockUser.update.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: `/users/${TARGET_USER_ID}/block`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('User blocked');
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ isAuthenticated: false, registeredUser: null, userId: null });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'POST',
      url: `/users/${TARGET_USER_ID}/block`,
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid userId format', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/users/invalid-id/block',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Invalid user ID');
  });

  it('returns 400 when blocking yourself', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/users/${USER_ID}/block`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('cannot block yourself');
  });

  it('returns 404 when target user not found', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: `/users/${TARGET_USER_ID}/block`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when user is already blocked', async () => {
    await app.ready();
    mockUser.findUnique
      .mockResolvedValueOnce({ id: TARGET_USER_ID })
      .mockResolvedValueOnce({ blockedUserIds: [TARGET_USER_ID] });

    const res = await app.inject({
      method: 'POST',
      url: `/users/${TARGET_USER_ID}/block`,
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUser.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: `/users/${TARGET_USER_ID}/block`,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /users/:userId/block
// ---------------------------------------------------------------------------

describe('DELETE /users/:userId/block', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWithMutationLog.mockImplementation(async ({ op }: any) => op());
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when user unblocked successfully', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue({ blockedUserIds: [TARGET_USER_ID] });
    mockUser.update.mockResolvedValue({});

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${TARGET_USER_ID}/block`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('User unblocked');
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ isAuthenticated: false, registeredUser: null, userId: null });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'DELETE',
      url: `/users/${TARGET_USER_ID}/block`,
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid userId format', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'DELETE',
      url: '/users/bad-format/block',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when user not in blocked list', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue({ blockedUserIds: [] });

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${TARGET_USER_ID}/block`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when currentUser not found', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${TARGET_USER_ID}/block`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUser.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${TARGET_USER_ID}/block`,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /users/me/blocked-users
// ---------------------------------------------------------------------------

describe('GET /users/me/blocked-users', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty list when no blocked users', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue({ blockedUserIds: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/users/me/blocked-users',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('returns 200 with empty list when user not found', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/users/me/blocked-users',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
  });

  it('returns 200 with blocked user list', async () => {
    await app.ready();
    mockUser.findUnique.mockResolvedValue({ blockedUserIds: [TARGET_USER_ID] });
    mockUser.findMany.mockResolvedValue([
      { id: TARGET_USER_ID, username: 'bob', displayName: null, avatar: null }
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/users/me/blocked-users',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(TARGET_USER_ID);
    expect(body.data[0].username).toBe('bob');
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ isAuthenticated: false, registeredUser: null, userId: null });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: '/users/me/blocked-users',
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockUser.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: '/users/me/blocked-users',
    });

    expect(res.statusCode).toBe(500);
  });
});
