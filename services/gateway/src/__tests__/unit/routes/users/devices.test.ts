/**
 * Unit tests for user devices/friends routes (devices.ts)
 * Tests friend requests, admin stubs.
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

import {
  getFriendRequests,
  sendFriendRequest,
  respondToFriendRequest,
  getAllUsers,
  updateUserById,
  deleteUserById,
} from '../../../../routes/users/devices';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID   = '507f1f77bcf86cd799439022';
const REQUEST_ID      = '507f1f77bcf86cd799439033';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique:  jest.fn<any>().mockResolvedValue(null),
      findFirst:   jest.fn<any>().mockResolvedValue(null),
    },
    friendRequest: {
      findMany:   jest.fn<any>().mockResolvedValue([]),
      findFirst:  jest.fn<any>().mockResolvedValue(null),
      count:      jest.fn<any>().mockResolvedValue(0),
      create:     jest.fn<any>().mockResolvedValue({ id: REQUEST_ID, senderId: CURRENT_USER_ID, receiverId: OTHER_USER_ID, status: 'pending', sender: {}, receiver: {} }),
      update:     jest.fn<any>().mockResolvedValue({ id: REQUEST_ID, senderId: CURRENT_USER_ID, receiverId: OTHER_USER_ID, status: 'accepted', sender: {}, receiver: {} }),
      delete:     jest.fn<any>().mockResolvedValue({}),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create:    jest.fn<any>().mockResolvedValue({ id: 'conv-1' }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
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

  await getFriendRequests(app);
  await sendFriendRequest(app);
  await respondToFriendRequest(app);
  await getAllUsers(app);
  await updateUserById(app);
  await deleteUserById(app);
  await app.ready();
  return { app, prisma };
}

// ─── GET /users/friend-requests ────────────────────────────────────────────────

describe('GET /users/friend-requests — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/users/friend-requests' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /users/friend-requests — empty list', () => {
  it('returns 200 with empty array', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/friend-requests' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /users/friend-requests — with pagination', () => {
  it('passes offset and limit to DB query', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    await app.inject({ method: 'GET', url: '/users/friend-requests?offset=5&limit=10' });
    expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 10 })
    );
    await app.close();
  });
});

describe('GET /users/friend-requests — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findMany = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/users/friend-requests' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /users/friend-requests ───────────────────────────────────────────────

describe('POST /users/friend-requests — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: OTHER_USER_ID } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /users/friend-requests — self-add', () => {
  it('returns 400 when sending request to self', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: CURRENT_USER_ID } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/friend-requests — receiver not found', () => {
  it('returns 404 when receiver does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: OTHER_USER_ID } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /users/friend-requests — duplicate request', () => {
  it('returns 400 when request already exists', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID });
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({ id: REQUEST_ID });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: OTHER_USER_ID } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /users/friend-requests — success', () => {
  it('returns 200 with new friend request', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID, username: 'bob', email: null });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: OTHER_USER_ID } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

// ─── PATCH /users/friend-requests/:id ─────────────────────────────────────────

describe('PATCH /users/friend-requests/:id — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'accept' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PATCH /users/friend-requests/:id — not found', () => {
  it('returns 404 when request does not exist', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'cancel' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /users/friend-requests/:id — cancel by non-sender', () => {
  it('returns 403 when non-sender tries to cancel', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending'
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'cancel' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('PATCH /users/friend-requests/:id — cancel success', () => {
  it('returns 200 when sender cancels their own request', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: CURRENT_USER_ID, receiverId: OTHER_USER_ID, status: 'pending'
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'cancel' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.friendRequest.delete).toHaveBeenCalledWith({ where: { id: REQUEST_ID } });
    await app.close();
  });
});

describe('PATCH /users/friend-requests/:id — accept by non-receiver', () => {
  it('returns 403 when non-receiver tries to accept', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: CURRENT_USER_ID, receiverId: OTHER_USER_ID, status: 'pending'
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'accept' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('PATCH /users/friend-requests/:id — accept success', () => {
  it('returns 200 when receiver accepts the request', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending'
    });
    prisma.conversation.findFirst = jest.fn<any>().mockResolvedValue({ id: 'conv-1' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'accept' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('PATCH /users/friend-requests/:id — reject success', () => {
  it('returns 200 when receiver rejects the request', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending'
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'reject' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Stub routes ──────────────────────────────────────────────────────────────

describe('GET /users — stub', () => {
  it('returns 200 with placeholder message', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PUT /users/:id — stub', () => {
  it('returns 200 with placeholder message', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/users/some-id' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /users/:id — stub', () => {
  it('returns 200 with placeholder message', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/users/some-id' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
