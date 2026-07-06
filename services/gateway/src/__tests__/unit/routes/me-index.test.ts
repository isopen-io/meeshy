/**
 * Unit tests for me/index.ts
 * Tests GET /me (root me endpoint)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Stub out sub-route modules so only the root /me route is tested
jest.mock('../../../routes/me/preferences', () => ({
  userPreferencesRoutes: async () => {},
}));

jest.mock('../../../routes/me/delete-account', () => ({
  deleteAccountRoutes: async () => {},
}));

jest.mock('../../../routes/me/export', () => ({
  dataExportRoutes: async () => {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import meRoutes from '../../../routes/me/index';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const MOCK_USER = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatar: null,
  role: 'USER',
};

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(MOCK_USER),
      ...overrides.user,
    },
    ...overrides,
  };
}

async function buildApp(prismaOverrides: any = {}, authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
    };
  });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);

  await app.register(meRoutes);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /me — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({}, false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /me — no registered user in auth context', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const app2 = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app2.decorate('authenticate', async (req: any) => {
      (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: null };
    });
    app2.decorate('prisma', makePrisma() as any);
    await app2.register(meRoutes);
    await app2.ready();
    app = app2;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when registeredUser is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /me — user not found in DB', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ user: { findUnique: jest.fn<any>().mockResolvedValue(null) } });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when user is not found', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /me — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with user data', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(USER_ID);
    expect(body.data.username).toBe('alice');
    expect(body.data.role).toBe('USER');
  });
});

describe('GET /me — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ user: { findUnique: jest.fn<any>().mockRejectedValue(new Error('DB failure')) } });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(500);
  });
});
