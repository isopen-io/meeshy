/**
 * Extended tests for devices.ts — covers additional branch paths:
 *   - sendFriendRequest: shouldEmail=false (prefs disable it) → emailService block skipped (line 278+)
 *   - sendFriendRequest: receiver has no email → emailService+email block skipped
 *   - respondToFriendRequest accept: existingConversation returned → else branch (lines 456-457)
 *   - respondToFriendRequest accept: accepter has no displayName → username fallback (line 495)
 *   - respondToFriendRequest reject: receiver has no displayName → username fallback (line 514)
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob',
        lastName: 'Smith', avatar: null, email: 'bob@test.com', systemLanguage: 'en',
      }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    friendRequest: {
      findMany:  jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count:     jest.fn<any>().mockResolvedValue(0),
      create:    jest.fn<any>().mockResolvedValue({
        id: REQUEST_ID, senderId: CURRENT_USER_ID, receiverId: OTHER_USER_ID,
        status: 'pending',
        sender: { id: CURRENT_USER_ID, username: 'alice', displayName: null,
                  firstName: 'Alice', lastName: 'A', avatar: null },
        receiver: { id: OTHER_USER_ID, username: 'bob', displayName: null,
                    firstName: 'Bob', lastName: 'B', avatar: null },
      }),
      update:    jest.fn<any>().mockResolvedValue({
        id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID,
        status: 'accepted',
        sender: { id: OTHER_USER_ID, username: 'bob', displayName: null,
                  firstName: 'Bob', lastName: 'B', avatar: null },
        receiver: { id: CURRENT_USER_ID, username: 'alice', displayName: null,
                    firstName: 'Alice', lastName: 'A', avatar: null },
      }),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
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

// ─── sendFriendRequest: shouldEmail=false path ────────────────────────────────

describe('POST /users/friend-requests — shouldEmail=false (prefs disabled)', () => {
  it('skips email when contactRequestEnabled is false', async () => {
    const prisma = makePrisma({
      userPreferences: {
        findUnique: jest.fn<any>().mockResolvedValue({
          notification: { emailEnabled: true, contactRequestEnabled: false },
        }),
      },
    });
    const emailService = { sendFriendRequestEmail: jest.fn<any>().mockResolvedValue(undefined) };
    const app = await buildApp({ prisma, emailService });
    const res = await app.inject({
      method: 'POST', url: '/users/friend-requests',
      payload: { receiverId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(emailService.sendFriendRequestEmail).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── sendFriendRequest: receiver has no email → email block skipped ───────────

describe('POST /users/friend-requests — receiver has no email', () => {
  it('skips emailService block when receiver.email is null', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: OTHER_USER_ID, username: 'bob', displayName: 'Bob',
          firstName: 'Bob', lastName: 'Smith', avatar: null,
          email: null,  // no email
          systemLanguage: 'en',
        }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
    });
    const emailService = { sendFriendRequestEmail: jest.fn<any>().mockResolvedValue(undefined) };
    const app = await buildApp({ prisma, emailService });
    const res = await app.inject({
      method: 'POST', url: '/users/friend-requests',
      payload: { receiverId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(emailService.sendFriendRequestEmail).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── sendFriendRequest: sender has no displayName (uses username fallback) ────

describe('POST /users/friend-requests — sender has no displayName (line 280)', () => {
  it('uses username fallback in senderName when displayName is null', async () => {
    const emailService = { sendFriendRequestEmail: jest.fn<any>().mockResolvedValue(undefined) };
    const app = await buildApp({ emailService });
    const res = await app.inject({
      method: 'POST', url: '/users/friend-requests',
      payload: { receiverId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    // The sender's displayName is null in makePrisma, so username 'alice' is used
    expect(emailService.sendFriendRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ senderName: 'alice' })
    );
    await app.close();
  });

  it('uses firstName+lastName when displayName and username are both null', async () => {
    const prisma = makePrisma({
      friendRequest: {
        findMany:  jest.fn<any>().mockResolvedValue([]),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        count:     jest.fn<any>().mockResolvedValue(0),
        create:    jest.fn<any>().mockResolvedValue({
          id: REQUEST_ID, senderId: CURRENT_USER_ID, receiverId: OTHER_USER_ID,
          status: 'pending',
          sender: { id: CURRENT_USER_ID, username: null, displayName: null,
                    firstName: 'Alice', lastName: 'Smith', avatar: null },
          receiver: { id: OTHER_USER_ID, username: 'bob', displayName: null,
                      firstName: 'Bob', lastName: 'B', avatar: null },
        }),
        update:    jest.fn<any>().mockResolvedValue({}),
        delete:    jest.fn<any>().mockResolvedValue({}),
      },
    });
    const emailService = { sendFriendRequestEmail: jest.fn<any>().mockResolvedValue(undefined) };
    const app = await buildApp({ prisma, emailService });
    const res = await app.inject({
      method: 'POST', url: '/users/friend-requests',
      payload: { receiverId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(emailService.sendFriendRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ senderName: 'Alice Smith' })
    );
    await app.close();
  });
});

// ─── respondToFriendRequest accept: existingConversation else branch (456-457) ─

describe('PATCH /users/friend-requests/:id accept — existing conversation (line 456-457)', () => {
  it('uses existing conversation id instead of creating a new one', async () => {
    const prisma = makePrisma({
      conversation: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: 'conv-existing-123' }),
        create:    jest.fn<any>().mockResolvedValue({ id: 'conv-new' }),
      },
    });
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── respondToFriendRequest accept: accepter has no displayName (line 495) ────

describe('PATCH /users/friend-requests/:id accept — accepter displayName fallback', () => {
  it('uses username when accepter displayName is null (line 495)', async () => {
    const emailService = {
      sendFriendRequestEmail: jest.fn<any>().mockResolvedValue(undefined),
      sendFriendAcceptedEmail: jest.fn<any>().mockResolvedValue(undefined),
    };
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: OTHER_USER_ID, email: 'sender@test.com', displayName: null,
          username: 'bob', systemLanguage: 'en',
        }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
      userPreferences: {
        findUnique: jest.fn<any>().mockResolvedValue({
          notification: { emailEnabled: true, contactRequestEnabled: true },
        }),
      },
    });
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    const app = await buildApp({ prisma, emailService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    // accepter (receiver of the update) has no displayName → falls back to username
    expect(emailService.sendFriendAcceptedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ accepterName: 'alice' })
    );
    await app.close();
  });

  it('uses firstName+lastName when accepter has no displayName or username (line 495)', async () => {
    const emailService = {
      sendFriendRequestEmail: jest.fn<any>().mockResolvedValue(undefined),
      sendFriendAcceptedEmail: jest.fn<any>().mockResolvedValue(undefined),
    };
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: OTHER_USER_ID, email: 'sender@test.com', displayName: null,
          username: null, systemLanguage: 'en',
        }),
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
      friendRequest: {
        findMany:  jest.fn<any>().mockResolvedValue([]),
        findFirst: jest.fn<any>().mockResolvedValue({
          id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
        }),
        count:     jest.fn<any>().mockResolvedValue(0),
        create:    jest.fn<any>().mockResolvedValue({ id: REQUEST_ID }),
        update:    jest.fn<any>().mockResolvedValue({
          id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID,
          status: 'accepted',
          sender: { id: OTHER_USER_ID, username: null, displayName: null,
                    firstName: 'Bob', lastName: 'B', avatar: null },
          receiver: { id: CURRENT_USER_ID, username: null, displayName: null,
                      firstName: 'Alice', lastName: 'A', avatar: null },
        }),
        delete:    jest.fn<any>().mockResolvedValue({}),
      },
      userPreferences: {
        findUnique: jest.fn<any>().mockResolvedValue({
          notification: { emailEnabled: true, contactRequestEnabled: true },
        }),
      },
    });
    const app = await buildApp({ prisma, emailService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    expect(emailService.sendFriendAcceptedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ accepterName: 'Alice A' })
    );
    await app.close();
  });
});

// ─── respondToFriendRequest reject: receiver has no displayName (line 514) ────

describe('PATCH /users/friend-requests/:id reject — receiver displayName fallback (line 514)', () => {
  it('uses username fallback when receiver displayName is null', async () => {
    const notificationService = {
      createSystemNotification: jest.fn<any>().mockResolvedValue(undefined),
    };
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    // updatedRequest.receiver has no displayName → falls back to username
    prisma.friendRequest.update = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID,
      status: 'rejected',
      sender: { id: OTHER_USER_ID, username: 'bob', displayName: null,
                firstName: 'Bob', lastName: 'B', avatar: null },
      receiver: { id: CURRENT_USER_ID, username: 'alice', displayName: null,
                  firstName: 'Alice', lastName: 'A', avatar: null },
    });
    const app = await buildApp({ prisma, notificationService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`,
      payload: { action: 'reject' },
    });
    expect(res.statusCode).toBe(200);
    expect(notificationService.createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('alice'),
      })
    );
    await app.close();
  });
});
