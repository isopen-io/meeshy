/**
 * Extended tests for presence.ts — covers the branch where ids deduplication
 * results in an empty array (line 68: ids.length === 0 after split+filter).
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439099';

function makePrisma() {
  return {
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

async function buildApp(opts: {
  presenceChecker?: any;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma());
  app.decorate('presenceChecker', opts.presenceChecker ?? null);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: CURRENT_USER_ID };
  });

  await getUsersPresence(app);
  await app.ready();
  return app;
}

// ─── Line 68: ids deduplication results in empty array ────────────────────────

describe('GET /users/presence — ids is comma-only (empty after dedup)', () => {
  it('returns 200 with empty users array when ids contains only commas', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=,%2C' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.users).toEqual([]);
    await app.close();
  });

  it('returns 200 with empty users when ids is a single whitespace-trimmed empty value', async () => {
    const app = await buildApp();
    // ?ids=, → splits to ['', ''] → filter removes both → empty array
    const res = await app.inject({ method: 'GET', url: '/users/presence?ids=,' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.users).toEqual([]);
    await app.close();
  });
});

// ─── Line 104: presenceMap.get(id) ?? false right-side branch ─────────────────

describe('GET /users/presence — sparse presenceMap (line 104 ?? false)', () => {
  it('returns isOnline:false for ids absent from the presenceChecker Map', async () => {
    const USER_A = '507f1f77bcf86cd799439011';
    const USER_B = '507f1f77bcf86cd799439022';

    // presenceChecker.bulk returns a Map that only includes USER_A (USER_B absent)
    const sparsePresenceChecker = {
      bulk: jest.fn<any>().mockReturnValue(new Map([[USER_A, true]])),
    };

    const app = await buildApp({ presenceChecker: sparsePresenceChecker });
    const res = await app.inject({
      method: 'GET',
      url: `/users/presence?ids=${USER_A},${USER_B}`,
    });
    expect(res.statusCode).toBe(200);
    const users = res.json().data.users as Array<{ userId: string; isOnline: boolean }>;
    const userA = users.find(u => u.userId === USER_A);
    const userB = users.find(u => u.userId === USER_B);
    expect(userA?.isOnline).toBe(true);
    // USER_B absent from presenceMap → Map.get() returns undefined → ?? false
    expect(userB?.isOnline).toBe(false);
    await app.close();
  });
});
