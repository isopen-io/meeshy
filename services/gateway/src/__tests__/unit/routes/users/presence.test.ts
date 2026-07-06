/**
 * Unit tests for users presence route (presence.ts)
 * Tests GET /users/presence.
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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getUsersPresence } from '../../../../routes/users/presence';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID_1 = '507f1f77bcf86cd799439011';
const USER_ID_2 = '507f1f77bcf86cd799439022';
const CURRENT_USER_ID = '507f1f77bcf86cd799439099';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    ...overrides,
  } as any;
}

function makePresenceChecker(onlineIds: string[] = []) {
  return {
    bulk: jest.fn<any>((ids: string[]) => {
      const map = new Map<string, boolean>();
      for (const id of ids) {
        map.set(id, onlineIds.includes(id));
      }
      return map;
    }),
  };
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
  presenceChecker?: ReturnType<typeof makePresenceChecker> | null;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma(), presenceChecker = makePresenceChecker() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('presenceChecker', presenceChecker);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await getUsersPresence(app);
  await app.ready();
  return { app, prisma };
}

// ─── GET /users/presence ───────────────────────────────────────────────────────

describe('GET /users/presence — missing ids param', () => {
  it('returns 400 when ids param is omitted', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /users/presence — too many ids', () => {
  it('returns 400 when more than 200 ids are provided', async () => {
    const { app } = await buildApp();
    const ids = Array.from({ length: 201 }, (_, i) => `id${i}`).join(',');
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${ids}` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /users/presence — presenceChecker not mounted', () => {
  it('returns 200 with all users offline when presenceChecker is null', async () => {
    const { app } = await buildApp({ presenceChecker: null });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID_1},${USER_ID_2}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/presence — success with online users', () => {
  it('returns 200 with presence data for each id', async () => {
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockResolvedValue([
      { id: USER_ID_1, lastActiveAt: new Date('2024-01-01') },
    ]);
    const checker = makePresenceChecker([USER_ID_1]);
    const { app } = await buildApp({ prisma, presenceChecker: checker });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID_1},${USER_ID_2}` });
    expect(res.statusCode).toBe(200);
    expect(checker.bulk).toHaveBeenCalledWith([USER_ID_1, USER_ID_2]);
    await app.close();
  });

  it('deduplicates repeated ids', async () => {
    const checker = makePresenceChecker();
    const { app } = await buildApp({ presenceChecker: checker });
    const res = await app.inject({
      method: 'GET', url: `/users/presence?ids=${USER_ID_1},${USER_ID_1}`,
    });
    expect(res.statusCode).toBe(200);
    expect(checker.bulk).toHaveBeenCalledWith([USER_ID_1]);
    await app.close();
  });
});

describe('GET /users/presence — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/users/presence?ids=${USER_ID_1}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
