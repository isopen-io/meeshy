/**
 * Unit tests for user blocking routes (blocking.ts)
 * Tests POST /users/:userId/block, DELETE /users/:userId/block,
 * GET /users/me/blocked-users.
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

import { blockUser, unblockUser, getBlockedUsers } from '../../../../routes/users/blocking';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID  = '507f1f77bcf86cd799439022';
const INVALID_ID      = 'not-a-mongo-id';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany:   jest.fn<any>().mockResolvedValue([]),
      update:     jest.fn<any>().mockResolvedValue({}),
    },
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

  await blockUser(app);
  await unblockUser(app);
  await getBlockedUsers(app);
  await app.ready();
  return { app, prisma };
}

// ─── POST /users/:userId/block ─────────────────────────────────────────────────

describe('POST /users/:userId/block — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/:userId/block — invalid ID', () => {
  it('returns 400 for non-Mongo ID', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/users/${INVALID_ID}/block` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/:userId/block — self block', () => {
  it('returns 400 when blocking own user ID', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/users/${CURRENT_USER_ID}/block` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/:userId/block — target not found', () => {
  it('returns 404 when target user does not exist', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /users/:userId/block — already blocked', () => {
  it('returns 409 when target is already in blocked list', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>()
      .mockResolvedValueOnce({ id: TARGET_USER_ID })        // target exists
      .mockResolvedValueOnce({ blockedUserIds: [TARGET_USER_ID] }); // current user's list
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe('POST /users/:userId/block — success', () => {
  it('returns 200 and calls prisma.user.update with push', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>()
      .mockResolvedValueOnce({ id: TARGET_USER_ID })       // target exists
      .mockResolvedValueOnce({ blockedUserIds: [] });       // current user — not blocked yet
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CURRENT_USER_ID },
        data: { blockedUserIds: { push: TARGET_USER_ID } },
      })
    );
    await app.close();
  });
});

describe('POST /users/:userId/block — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── DELETE /users/:userId/block ───────────────────────────────────────────────

describe('DELETE /users/:userId/block — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'DELETE', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /users/:userId/block — invalid ID', () => {
  it('returns 400 for non-Mongo ID', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/users/${INVALID_ID}/block` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('DELETE /users/:userId/block — not in blocked list', () => {
  it('returns 404 when target is not blocked', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ blockedUserIds: [] });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /users/:userId/block — success', () => {
  it('returns 200 and calls prisma.user.update with set (filtered)', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      blockedUserIds: [TARGET_USER_ID, '507f1f77bcf86cd799439033'],
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CURRENT_USER_ID },
        data: { blockedUserIds: { set: ['507f1f77bcf86cd799439033'] } },
      })
    );
    await app.close();
  });
});

describe('DELETE /users/:userId/block — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/users/${TARGET_USER_ID}/block` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /users/me/blocked-users ──────────────────────────────────────────────

describe('GET /users/me/blocked-users — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /users/me/blocked-users — no blocked users', () => {
  it('returns 200 with empty array when blocked list is empty', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ blockedUserIds: [] });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 with empty array when current user not found', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /users/me/blocked-users — with blocked users', () => {
  it('returns 200 with user details for each blocked user', async () => {
    const prisma = makePrisma();
    const blockedUser = { id: TARGET_USER_ID, username: 'bob', displayName: 'Bob', avatar: null };
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ blockedUserIds: [TARGET_USER_ID] });
    prisma.user.findMany = jest.fn<any>().mockResolvedValue([blockedUser]);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [TARGET_USER_ID] } } })
    );
    await app.close();
  });
});

describe('GET /users/me/blocked-users — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/me/blocked-users' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
