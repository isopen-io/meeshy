/**
 * Extended tests for devices.ts — covers the .catch() error handler bodies
 * in fire-and-forget notification/email chains (lines 266, 289, 474, 503, 520).
 *
 * When a notification or email service call rejects, the .catch() handler logs the
 * error and the HTTP response is still 200 (fire-and-forget semantics).
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
  sendFriendRequest,
  respondToFriendRequest,
} from '../../../../routes/users/devices';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID   = '507f1f77bcf86cd799439022';
const REQUEST_ID      = '507f1f77bcf86cd799439033';

const mockReceiver = {
  id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'Smith',
  avatar: null, email: 'bob@test.com', systemLanguage: 'en',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(mockReceiver),
      findFirst:  jest.fn<any>().mockResolvedValue(null),
    },
    friendRequest: {
      findMany:  jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count:     jest.fn<any>().mockResolvedValue(0),
      create:    jest.fn<any>().mockResolvedValue({
        id: REQUEST_ID, senderId: CURRENT_USER_ID, receiverId: OTHER_USER_ID,
        status: 'pending',
        sender: { id: CURRENT_USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'A', avatar: null },
        receiver: mockReceiver,
      }),
      update:    jest.fn<any>().mockResolvedValue({
        id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID,
        status: 'accepted',
        sender: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', avatar: null },
        receiver: { id: CURRENT_USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'A', avatar: null },
      }),
      delete:    jest.fn<any>().mockResolvedValue({}),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'conv-existing' }),
      create:    jest.fn<any>().mockResolvedValue({ id: 'conv-new' }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue({
        notification: { emailEnabled: true, contactRequestEnabled: true },
      }),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  notificationService?: any;
  emailService?: any;
} = {}): Promise<FastifyInstance> {
  const { prisma = makePrisma(), notificationService = null, emailService = null } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true, userId: CURRENT_USER_ID,
      registeredUser: { id: CURRENT_USER_ID },
    };
  });
  if (notificationService !== null) app.decorate('notificationService', notificationService);
  if (emailService !== null) app.decorate('emailService', emailService);

  await sendFriendRequest(app);
  await respondToFriendRequest(app);
  await app.ready();
  return app;
}

// ─── Line 266: notification catch in sendFriendRequest ────────────────────────

describe('POST /users/friend-requests — notification rejects (line 266)', () => {
  it('still returns 200 and logs the error when notification rejects', async () => {
    const notificationService = {
      createFriendRequestNotification: jest.fn<any>().mockRejectedValue(new Error('notif boom')),
    };
    const app = await buildApp({ notificationService });
    const res = await app.inject({
      method: 'POST', url: '/users/friend-requests',
      payload: { receiverId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve(); // drain the .catch() microtask
    await app.close();
  });
});

// ─── Line 289: email catch in sendFriendRequest ───────────────────────────────

describe('POST /users/friend-requests — email rejects (line 289)', () => {
  it('still returns 200 and logs the error when email service rejects', async () => {
    const emailService = {
      sendFriendRequestEmail: jest.fn<any>().mockRejectedValue(new Error('email boom')),
    };
    const app = await buildApp({ emailService });
    const res = await app.inject({
      method: 'POST', url: '/users/friend-requests',
      payload: { receiverId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

// ─── Line 474: notification catch in respondToFriendRequest accept ────────────

describe('PATCH /users/friend-requests/:id accept — notification rejects (line 474)', () => {
  it('still returns 200 when createFriendAcceptedNotification rejects', async () => {
    const notificationService = {
      createFriendRequestNotification: jest.fn<any>().mockResolvedValue(undefined),
      createFriendAcceptedNotification: jest.fn<any>().mockRejectedValue(new Error('notif boom')),
      createSystemNotification: jest.fn<any>().mockResolvedValue(undefined),
    };
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    const app = await buildApp({ prisma, notificationService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

// ─── Line 503: email catch in respondToFriendRequest accept ──────────────────

describe('PATCH /users/friend-requests/:id accept — email rejects (line 503)', () => {
  it('still returns 200 when sendFriendAcceptedEmail rejects', async () => {
    const emailService = {
      sendFriendRequestEmail: jest.fn<any>().mockResolvedValue(undefined),
      sendFriendAcceptedEmail: jest.fn<any>().mockRejectedValue(new Error('email boom')),
    };
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: OTHER_USER_ID, email: 'sender@test.com', displayName: 'Bob',
      username: 'bob', systemLanguage: 'en',
    });
    prisma.userPreferences.findUnique = jest.fn<any>().mockResolvedValue({
      notification: { emailEnabled: true, contactRequestEnabled: true },
    });
    const app = await buildApp({ prisma, emailService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

// ─── Line 520: notification catch in respondToFriendRequest reject ────────────

describe('PATCH /users/friend-requests/:id reject — notification rejects (line 520)', () => {
  it('still returns 200 when createSystemNotification rejects', async () => {
    const notificationService = {
      createFriendRequestNotification: jest.fn<any>().mockResolvedValue(undefined),
      createFriendAcceptedNotification: jest.fn<any>().mockResolvedValue(undefined),
      createSystemNotification: jest.fn<any>().mockRejectedValue(new Error('notif boom')),
    };
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    // Update returns a rejected request
    prisma.friendRequest.update = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID,
      status: 'rejected',
      sender: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', avatar: null },
      receiver: { id: CURRENT_USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'A', avatar: null },
    });
    const app = await buildApp({ prisma, notificationService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'reject' },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});
