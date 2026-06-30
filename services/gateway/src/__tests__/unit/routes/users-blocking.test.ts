/**
 * Unit tests for users/blocking.ts
 * Tests POST /users/:userId/block, DELETE /users/:userId/block, GET /users/me/blocked-users
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const mockIsValidMongoId = jest.fn<any>((id: string) => /^[0-9a-f]{24}$/i.test(id));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  isValidMongoId: (id: string) => mockIsValidMongoId(id),
}));

const mockWithMutationLog = jest.fn<any>(async ({ op }: any) => op());

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: (...a: any[]) => mockWithMutationLog(...a),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { blockUser, unblockUser, getBlockedUsers } from '../../../routes/users/blocking';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const TARGET_ID = '507f1f77bcf86cd799439022';
const INVALID_ID = 'bad-id';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_AUTH = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };

function makePrisma(overrides: any = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
      ...overrides.user,
    },
    mutationLog: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({}),
      ...overrides.mutationLog,
    },
    ...overrides,
  };
}

async function buildApp(prismaOverrides: any = {}, authOverrides: any = {}): Promise<FastifyInstance> {
  const authContext = { ...DEFAULT_AUTH, ...authOverrides };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = authContext;
  });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);

  await blockUser(app);
  await unblockUser(app);
  await getBlockedUsers(app);
  await app.ready();
  return app;
}

// ─── POST /users/:userId/block ────────────────────────────────────────────────

describe('POST /users/:userId/block — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({}, { isAuthenticated: false, registeredUser: undefined });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /users/:userId/block — invalid ID format', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({});
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid user ID', async () => {
    mockIsValidMongoId.mockReturnValueOnce(false);
    const res = await app.inject({ method: 'POST', url: `/users/${INVALID_ID}/block` });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /users/:userId/block — block self', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when blocking yourself', async () => {
    mockIsValidMongoId.mockReturnValue(true);
    const res = await app.inject({ method: 'POST', url: `/users/${USER_ID}/block` });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /users/:userId/block — user not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: { findUnique: jest.fn<any>().mockResolvedValue(null), update: jest.fn<any>().mockResolvedValue({}) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when target user not found', async () => {
    mockIsValidMongoId.mockReturnValue(true);
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /users/:userId/block — already blocked', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const mockFindUnique = jest.fn<any>()
      .mockResolvedValueOnce({ id: TARGET_ID })      // target user exists
      .mockResolvedValueOnce({ blockedUserIds: [TARGET_ID] }); // current user already has target blocked

    app = await buildApp({
      user: { findUnique: mockFindUnique, update: jest.fn<any>().mockResolvedValue({}) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 409 when user is already blocked', async () => {
    mockIsValidMongoId.mockReturnValue(true);
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /users/:userId/block — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const mockFindUnique = jest.fn<any>()
      .mockResolvedValueOnce({ id: TARGET_ID })       // target user exists
      .mockResolvedValueOnce({ blockedUserIds: [] }); // current user has empty list

    app = await buildApp({
      user: { findUnique: mockFindUnique, update: jest.fn<any>().mockResolvedValue({}) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when user blocked successfully', async () => {
    mockIsValidMongoId.mockReturnValue(true);
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBe('User blocked');
  });
});

describe('POST /users/:userId/block — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: { findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')), update: jest.fn<any>().mockResolvedValue({}) },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    mockIsValidMongoId.mockReturnValue(true);
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /users/:userId/block ─────────────────────────────────────────────

describe('DELETE /users/:userId/block — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({}, { isAuthenticated: false, registeredUser: undefined }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /users/:userId/block — invalid ID', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid user ID', async () => {
    mockIsValidMongoId.mockReturnValueOnce(false);
    const res = await app.inject({ method: 'DELETE', url: `/users/${INVALID_ID}/block` });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /users/:userId/block — not in blocked list', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when user is not in blocked list', async () => {
    mockIsValidMongoId.mockReturnValue(true);
    const res = await app.inject({ method: 'DELETE', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /users/:userId/block — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [TARGET_ID] }),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when user unblocked successfully', async () => {
    mockIsValidMongoId.mockReturnValue(true);
    const res = await app.inject({ method: 'DELETE', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBe('User unblocked');
  });
});

describe('DELETE /users/:userId/block — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: {
        findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    mockIsValidMongoId.mockReturnValue(true);
    const res = await app.inject({ method: 'DELETE', url: `/users/${TARGET_ID}/block` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /users/me/blocked-users ──────────────────────────────────────────────

describe('GET /users/me/blocked-users — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({}, { isAuthenticated: false, registeredUser: undefined }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /users/me/blocked-users — no blocked users', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });
});

describe('GET /users/me/blocked-users — user not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty array when user not found', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });
});

describe('GET /users/me/blocked-users — with blocked users', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const blockedUser = { id: TARGET_ID, username: 'bob', displayName: 'Bob', avatar: null };
    app = await buildApp({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [TARGET_ID] }),
        findMany: jest.fn<any>().mockResolvedValue([blockedUser]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with blocked users list', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toHaveLength(1);
    expect(data[0].username).toBe('bob');
  });
});

describe('GET /users/me/blocked-users — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      user: {
        findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')),
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(500);
  });
});
