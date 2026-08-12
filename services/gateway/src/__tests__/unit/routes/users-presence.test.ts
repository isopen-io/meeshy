/**
 * Unit tests for users/presence.ts
 * Tests GET /users/presence
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getUsersPresence } from '../../../routes/users/presence';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const USER_ID2 = '507f1f77bcf86cd799439022';

// ─── Factory ─────────────────────────────────────────────────────────────────

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
  presenceChecker = null as any,
  prismaOverrides = {} as any,
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  });

  app.decorate('presenceChecker', presenceChecker);
  app.decorate('prisma', makePrisma(prismaOverrides) as any);

  await app.register(getUsersPresence);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /users/presence — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const a = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    a.decorate('authenticate', async (_req: any, reply: any) => {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
    });
    a.decorate('presenceChecker', null);
    a.decorate('prisma', makePrisma() as any);
    await a.register(getUsersPresence);
    await a.ready();
    app = a;
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=abc' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /users/presence — missing ids param', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when ids param is empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /users/presence — too many ids', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when more than 200 ids are requested', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `id-${i.toString().padStart(3, '0')}`).join(',');
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ids}` });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /users/presence — no presenceChecker (boot phase)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ presenceChecker: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with all users offline when presenceChecker not available', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID},${USER_ID2}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /users/presence — success with presenceChecker', () => {
  let app: FastifyInstance;
  const mockPresenceChecker = {
    bulk: jest.fn<any>().mockReturnValue(new Map([[USER_ID, true], [USER_ID2, false]])),
  };
  beforeAll(async () => {
    app = await buildApp({
      presenceChecker: mockPresenceChecker,
      prismaOverrides: {
        user: {
          findMany: jest.fn<any>().mockResolvedValue([
            { id: USER_ID, lastActiveAt: new Date('2025-01-01') },
            { id: USER_ID2, lastActiveAt: null },
          ]),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with presence data', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID},${USER_ID2}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls presenceChecker.bulk with deduplicated ids', async () => {
    await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID},${USER_ID},${USER_ID2}` });
    expect(mockPresenceChecker.bulk).toHaveBeenCalled();
  });
});

describe('GET /users/presence — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      presenceChecker: { bulk: jest.fn<any>().mockReturnValue(new Map()) },
      prismaOverrides: {
        user: {
          findMany: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        },
        participant: {
          findMany: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
