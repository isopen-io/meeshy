/**
 * Unit tests for admin/dashboard.ts
 * Tests GET /dashboard, POST /dashboard/invalidate-cache
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

const mockCacheGet = jest.fn<any>().mockResolvedValue(null);
const mockCacheSet = jest.fn<any>().mockResolvedValue(undefined);
const mockCacheDel = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: (...a: any[]) => mockCacheGet(...a),
    set: (...a: any[]) => mockCacheSet(...a),
    del: (...a: any[]) => mockCacheDel(...a),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { dashboardRoutes } from '../../../routes/admin/dashboard';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factory ─────────────────────────────────────────────────────────────────

function makePrisma() {
  const mockCount = jest.fn<any>().mockResolvedValue(42);
  return {
    user: { count: mockCount },
    participant: { count: mockCount },
    message: { count: mockCount },
    community: { count: mockCount },
    conversationShareLink: { count: mockCount },
    report: { count: mockCount },
    communityMember: { count: mockCount },
    conversation: { count: mockCount },
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

  await app.register(dashboardRoutes);
  await app.ready();
  return app;
}

// ─── GET /dashboard ───────────────────────────────────────────────────────────

describe('GET /dashboard — unauthorized (no auth)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false });
    a.decorate('authenticate', async (_req: any, reply: any) => {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    });
    a.decorate('prisma', makePrisma() as any);
    await a.register(dashboardRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when authenticate hook rejects', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /dashboard — forbidden (USER role)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has USER role', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /dashboard — forbidden (MODERATOR role)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('MODERATOR'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user has MODERATOR role', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /dashboard — success (ADMIN)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null); // no cache
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with statistics', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.headers['cache-control']).toContain('private');
  });
});

describe('GET /dashboard — success (ANALYST)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('ANALYST');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for ANALYST role', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /dashboard — success (AUDIT)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    app = await buildApp('AUDIT');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for AUDIT role', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /dashboard — cached response', () => {
  let app: FastifyInstance;
  const cachedData = JSON.stringify({
    statistics: { totalUsers: 100 },
    recentActivity: { newUsers: 5 },
  });
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(cachedData);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    await app.close();
  });

  it('returns 200 from cache when cache hit', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.headers['cache-control']).toContain('max-age=600');
  });
});

describe('GET /dashboard — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheGet.mockResolvedValue(null);
    const a = Fastify({ logger: false });
    a.decorate('authenticate', async (req: any) => {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'ADMIN' },
      };
    });
    const errorPrisma = { ...makePrisma(), user: { count: jest.fn<any>().mockRejectedValue(new Error('DB crash')) } };
    a.decorate('prisma', errorPrisma as any);
    await a.register(dashboardRoutes);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /dashboard/invalidate-cache ─────────────────────────────────────────

describe('POST /dashboard/invalidate-cache — USER role forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('USER'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when USER tries to invalidate cache', async () => {
    const res = await app.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /dashboard/invalidate-cache — ANALYST role forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('ANALYST'); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when ANALYST tries to invalidate cache (view-only role)', async () => {
    const res = await app.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /dashboard/invalidate-cache — success (ADMIN)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheDel.mockResolvedValue(undefined);
    app = await buildApp('ADMIN');
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and deletes cache for ADMIN', async () => {
    const res = await app.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockCacheDel).toHaveBeenCalled();
  });
});

describe('POST /dashboard/invalidate-cache — success (BIGBOSS)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp('BIGBOSS'); });
  afterAll(async () => { await app.close(); });

  it('returns 200 for BIGBOSS', async () => {
    const res = await app.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /dashboard/invalidate-cache — cache error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCacheDel.mockRejectedValue(new Error('Redis error'));
    app = await buildApp('ADMIN');
  });
  afterAll(async () => {
    mockCacheDel.mockResolvedValue(undefined);
    await app.close();
  });

  it('returns 500 when cache deletion fails', async () => {
    const res = await app.inject({ method: 'POST', url: '/dashboard/invalidate-cache' });
    expect(res.statusCode).toBe(500);
  });
});
