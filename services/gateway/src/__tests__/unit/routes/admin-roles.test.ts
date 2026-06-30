/**
 * Unit tests for admin/roles.ts
 * Tests PATCH /users/:id/role and PATCH /users/:id/status
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const mockGetUserPermissions = jest.fn<any>();
const mockCanManageUser = jest.fn<any>().mockReturnValue(true);

jest.mock('../../../routes/admin/services/PermissionsService', () => ({
  permissionsService: {
    getUserPermissions: (...a: any[]) => mockGetUserPermissions(...a),
    canManageUser: (...a: any[]) => mockCanManageUser(...a),
  },
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock('../../../middleware/auth', () => ({
  authUserCacheKey: (id: string) => `auth:user:${id}`,
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRoleRoutes } from '../../../routes/admin/roles';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID = '507f1f77bcf86cd799439022';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: TARGET_USER_ID, username: 'bob', role: 'USER' }),
      update: jest.fn<any>().mockResolvedValue({ id: TARGET_USER_ID, username: 'bob', role: 'ADMIN', updatedAt: new Date() }),
      ...overrides.user,
    },
    ...overrides,
  };
}

async function buildApp(role = 'ADMIN', prismaOverrides: any = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  mockGetUserPermissions.mockReturnValue({
    canAccessAdmin: ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(role),
    canManageUsers: ['BIGBOSS', 'ADMIN'].includes(role),
  });

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });

  app.decorate('prisma', makePrisma(prismaOverrides) as any);

  await app.register(registerRoleRoutes);
  await app.ready();
  return app;
}

// ─── PATCH /users/:id/role ────────────────────────────────────────────────────

describe('PATCH /users/:id/role — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    mockGetUserPermissions.mockReturnValue({ canAccessAdmin: false, canManageUsers: false });
    a.decorate('authenticate', async (_req: any, reply: any) => {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(registerRoleRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authenticate hook rejects', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/role`,
      payload: { role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /users/:id/role — MODERATOR (canAccessAdmin=true, canManageUsers=false)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('MODERATOR');
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when MODERATOR lacks canManageUsers permission', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/role`,
      payload: { role: 'USER' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /users/:id/role — user not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('ADMIN', {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(null),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when target user does not exist', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/role`,
      payload: { role: 'USER' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /users/:id/role — can't manage target user (same level)", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValueOnce(false);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller cannot manage the target user role', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/role`,
      payload: { role: 'USER' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("PATCH /users/:id/role — can't assign role (too high)", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    // First call (check target user) succeeds, second call (check new role) fails
    mockCanManageUser.mockReturnValueOnce(true).mockReturnValueOnce(false);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller cannot assign the requested role', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/role`,
      payload: { role: 'BIGBOSS' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /users/:id/role — ADMIN success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when ADMIN successfully updates role', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/role`,
      payload: { role: 'MODERATOR' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('PATCH /users/:id/role — invalid body (missing role)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when role field is missing from body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/role`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /users/:id/role — DB error on findUnique', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('ADMIN', {
      user: {
        findUnique: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        update: jest.fn<any>().mockResolvedValue(null),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error during findUnique', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/role`,
      payload: { role: 'USER' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── PATCH /users/:id/status ──────────────────────────────────────────────────

describe('PATCH /users/:id/status — MODERATOR (no canManageUsers)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('MODERATOR');
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when MODERATOR lacks canManageUsers permission', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/status`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /users/:id/status — user not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('ADMIN', {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue(null),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when target user does not exist', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/status`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /users/:id/status — can't manage user", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValueOnce(false);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when caller cannot manage the target user', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/status`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /users/:id/status — deactivate success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('ADMIN', {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: TARGET_USER_ID, username: 'bob', role: 'USER' }),
        update: jest.fn<any>().mockResolvedValue({
          id: TARGET_USER_ID,
          username: 'bob',
          isActive: false,
          deactivatedAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when user is successfully deactivated', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/status`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('PATCH /users/:id/status — activate success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('ADMIN', {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: TARGET_USER_ID, username: 'bob', role: 'USER' }),
        update: jest.fn<any>().mockResolvedValue({
          id: TARGET_USER_ID,
          username: 'bob',
          isActive: true,
          deactivatedAt: null,
          updatedAt: new Date(),
        }),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when user is successfully activated', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/status`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('PATCH /users/:id/status — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCanManageUser.mockReturnValue(true);
    app = await buildApp('ADMIN', {
      user: {
        findUnique: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        update: jest.fn<any>().mockResolvedValue(null),
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET_USER_ID}/status`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(500);
  });
});
