/**
 * Unit tests for admin/anonymous-users.ts
 * Tests GET /anonymous-users
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../validation/helpers.js', () => ({ validateQuery: () => async () => {} }));
jest.mock('../../../validation/admin-schemas.js', () => ({ AnonymousUsersQuerySchema: {} }));
jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn().mockReturnValue({ offset: 0, limit: 20 }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { anonymousUsersAdminRoutes } from '../../../routes/admin/anonymous-users';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      ...overrides.participant,
    },
    ...overrides,
  };
}

async function buildApp(role = 'ADMIN'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });

  app.decorate('prisma', makePrisma() as any);

  await app.register(anonymousUsersAdminRoutes);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /anonymous-users — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (_req: any, reply: any) => {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(anonymousUsersAdminRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authenticate hook rejects', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /anonymous-users — USER role forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has USER role', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /anonymous-users — ANALYST role forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ANALYST'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has ANALYST role', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /anonymous-users — MODERATOR role allowed', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('MODERATOR'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when user has MODERATOR role', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /anonymous-users — ADMIN with search param', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ADMIN'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when search query param is provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users?search=alice' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /anonymous-users — ADMIN with status=active', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ADMIN'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when status=active filter is applied', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users?status=active' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /anonymous-users — ADMIN with status=inactive', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ADMIN'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 when status=inactive filter is applied', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users?status=inactive' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /anonymous-users — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (req: any) => {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'ADMIN' },
      };
    });
    a.decorate('prisma', makePrisma({
      participant: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        count: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
      },
    }) as any);
    await a.register(anonymousUsersAdminRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/anonymous-users' });
    expect(res.statusCode).toBe(500);
  });
});
