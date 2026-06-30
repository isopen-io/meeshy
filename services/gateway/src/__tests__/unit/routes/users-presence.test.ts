/**
 * Unit tests for users/presence.ts
 * Tests GET /users/presence
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getUsersPresence } from '../../../routes/users/presence';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const USER_ID_2 = '507f1f77bcf86cd799439022';

// ─── App factory ──────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.user,
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.participant,
    },
    ...overrides,
  };
}

async function buildApp({
  authenticated = true,
  presenceChecker = null as any,
  prisma = makePrisma(),
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID };
  });
  app.decorate('prisma', prisma as any);
  if (presenceChecker !== undefined) {
    app.decorate('presenceChecker', presenceChecker as any);
  }

  await getUsersPresence(app);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /users/presence — missing ids param', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when ids param is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /users/presence — empty ids after dedup', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with empty users array for whitespace-only ids', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=,,' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.users).toHaveLength(0);
  });
});

describe('GET /users/presence — too many ids', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when more than 200 ids provided', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `user-${i}`).join(',');
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ids}` });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /users/presence — presenceChecker not available', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ presenceChecker: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with all users offline when no presenceChecker', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID}` });
    expect(res.statusCode).toBe(200);
    const { users } = res.json().data;
    expect(users).toHaveLength(1);
    expect(users[0].isOnline).toBe(false);
    expect(users[0].lastActiveAt).toBeNull();
  });
});

describe('GET /users/presence — with presenceChecker, success', () => {
  let app: FastifyInstance;
  const mockBulk = jest.fn<any>();
  beforeAll(async () => {
    mockBulk.mockReturnValue(new Map([[USER_ID, true], [USER_ID_2, false]]));
    const lastActive = new Date('2025-01-01');

    app = await buildApp({
      presenceChecker: { bulk: mockBulk },
      prisma: makePrisma({
        user: {
          findMany: jest.fn<any>().mockResolvedValue([
            { id: USER_ID, lastActiveAt: lastActive },
          ]),
        },
        participant: {
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with presence from presenceChecker and lastActiveAt from DB', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/users/presence?ids=${USER_ID},${USER_ID_2}`,
    });
    expect(res.statusCode).toBe(200);
    const { users } = res.json().data;
    expect(users).toHaveLength(2);
    const user1 = users.find((u: any) => u.userId === USER_ID);
    const user2 = users.find((u: any) => u.userId === USER_ID_2);
    expect(user1.isOnline).toBe(true);
    expect(user2.isOnline).toBe(false);
    expect(user2.lastActiveAt).toBeNull();
  });
});

describe('GET /users/presence — anonymous participant lastActiveAt', () => {
  let app: FastifyInstance;
  const ANON_ID = 'anon-participant-1';
  beforeAll(async () => {
    const lastActive = new Date('2025-06-01');
    app = await buildApp({
      presenceChecker: { bulk: jest.fn<any>().mockReturnValue(new Map()) },
      prisma: makePrisma({
        user: { findMany: jest.fn<any>().mockResolvedValue([]) },
        participant: {
          findMany: jest.fn<any>().mockResolvedValue([
            { id: ANON_ID, lastActiveAt: lastActive },
          ]),
        },
      }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns lastActiveAt from participant table for anonymous ids', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ANON_ID}` });
    expect(res.statusCode).toBe(200);
    const { users } = res.json().data;
    expect(users[0].userId).toBe(ANON_ID);
    expect(users[0].lastActiveAt).not.toBeNull();
  });
});

describe('GET /users/presence — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      presenceChecker: { bulk: jest.fn<any>().mockReturnValue(new Map()) },
      prisma: makePrisma({
        user: { findMany: jest.fn<any>().mockRejectedValue(new Error('DB failure')) },
      }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
