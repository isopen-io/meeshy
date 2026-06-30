/**
 * Unit tests for user preferences routes (preferences.ts)
 * Tests GET /users/search and GET /users/:userId/stats.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { searchUsers, getUserStats } from '../../../../routes/users/preferences';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID  = '507f1f77bcf86cd799439022';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany:  jest.fn<any>().mockResolvedValue([]),
      count:     jest.fn<any>().mockResolvedValue(0),
    },
    message: {
      count:   jest.fn<any>().mockResolvedValue(0),
      groupBy: jest.fn<any>().mockResolvedValue([]),
    },
    participant: {
      count: jest.fn<any>().mockResolvedValue(0),
    },
    friendRequest: {
      count: jest.fn<any>().mockResolvedValue(0),
    },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ n: 0 }),
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await searchUsers(app);
  await getUserStats(app);
  await app.ready();
  return { app, prisma };
}

// ─── GET /users/search ─────────────────────────────────────────────────────────

describe('GET /users/search — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/users/search?q=alice' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /users/search — short query', () => {
  it('returns 400 when q is shorter than 2 chars (schema validation)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=a' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 200 with empty results when q is missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/search' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 with empty results when q is whitespace-only', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/search?q=%20%20' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /users/search — with results', () => {
  it('returns 200 with matching users', async () => {
    const prisma = makePrisma();
    const mockUser = { id: TARGET_USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith', email: 'alice@test.com', isOnline: true, lastActiveAt: null, systemLanguage: 'en' };
    prisma.user.findMany = jest.fn<any>().mockResolvedValue([mockUser]);
    prisma.user.count = jest.fn<any>().mockResolvedValue(1);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/search?q=alice' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('passes offset and limit to the DB query', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/users/search?q=test&offset=10&limit=5' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
    await app.close();
  });
});

describe('GET /users/search — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/search?q=test' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /users/:userId/stats ──────────────────────────────────────────────────

describe('GET /users/:userId/stats — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /users/:userId/stats — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /users/:userId/stats — success by MongoId', () => {
  it('returns 200 with stats when user is found by ID', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({
      id: TARGET_USER_ID,
      createdAt: new Date('2024-01-01'),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/:userId/stats — success by username', () => {
  it('returns 200 when user is found by username string', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({
      id: TARGET_USER_ID,
      createdAt: new Date('2024-01-01'),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/alice/stats' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /users/:userId/stats — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/users/${TARGET_USER_ID}/stats` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
