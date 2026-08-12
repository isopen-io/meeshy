/**
 * Extended unit tests for devices.ts routes.
 * Covers branches missing from devices.test.ts:
 * - sendFriendRequest: notification + email paths, DB error
 * - respondToFriendRequest: create-new-conversation, notification + email for accept,
 *   notification for reject, DB error
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

const mockFriendRequest = {
  id: REQUEST_ID,
  senderId: CURRENT_USER_ID,
  receiverId: OTHER_USER_ID,
  status: 'pending',
  sender: { id: CURRENT_USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'A', avatar: null },
  receiver: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', avatar: null },
};

const mockUpdatedRequest = {
  id: REQUEST_ID,
  senderId: OTHER_USER_ID,
  receiverId: CURRENT_USER_ID,
  status: 'accepted',
  sender: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', avatar: null },
  receiver: { id: CURRENT_USER_ID, username: 'alice', displayName: 'Alice', firstName: 'Alice', lastName: 'A', avatar: null },
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
      create:    jest.fn<any>().mockResolvedValue(mockFriendRequest),
      update:    jest.fn<any>().mockResolvedValue(mockUpdatedRequest),
      delete:    jest.fn<any>().mockResolvedValue({}),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create:    jest.fn<any>().mockResolvedValue({ id: 'conv-new' }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

function makeNotificationService() {
  return {
    createFriendRequestNotification: jest.fn<any>().mockResolvedValue(undefined),
    createFriendAcceptedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createSystemNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makeEmailService() {
  return {
    sendFriendRequestEmail: jest.fn<any>().mockResolvedValue(undefined),
    sendFriendAcceptedEmail: jest.fn<any>().mockResolvedValue(undefined),
  };
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
  notificationService?: ReturnType<typeof makeNotificationService> | null;
  emailService?: ReturnType<typeof makeEmailService> | null;
  socketIOHandler?: { getManager: jest.Mock<any> } | null;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma>; notificationService: any; emailService: any }> {
  const {
    auth = 'authenticated',
    prisma = makePrisma(),
    notificationService = null,
    emailService = null,
    socketIOHandler = null,
  } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: CURRENT_USER_ID, registeredUser: { id: CURRENT_USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });
  if (notificationService) app.decorate('notificationService', notificationService);
  if (emailService) app.decorate('emailService', emailService);
  if (socketIOHandler) app.decorate('socketIOHandler', socketIOHandler);

  await sendFriendRequest(app);
  await respondToFriendRequest(app);
  await app.ready();
  return { app, prisma, notificationService, emailService };
}

// ─── sendFriendRequest: notification path ─────────────────────────────────────

describe('POST /users/friend-requests — with notificationService', () => {
  it('sends notification to receiver', async () => {
    const notificationService = makeNotificationService();
    const { app } = await buildApp({ notificationService });
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: OTHER_USER_ID } });
    expect(res.statusCode).toBe(200);
    expect(notificationService.createFriendRequestNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: OTHER_USER_ID, requesterId: CURRENT_USER_ID })
    );
    await app.close();
  });
});

// ─── sendFriendRequest: email path (prefs allow) ──────────────────────────────

describe('POST /users/friend-requests — with emailService (prefs allow)', () => {
  it('sends email to receiver when preferences allow', async () => {
    const emailService = makeEmailService();
    const prisma = makePrisma();
    prisma.userPreferences.findUnique = jest.fn<any>().mockResolvedValue({
      notification: { emailEnabled: true, contactRequestEnabled: true },
    });
    const { app } = await buildApp({ prisma, emailService });
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: OTHER_USER_ID } });
    expect(res.statusCode).toBe(200);
    expect(emailService.sendFriendRequestEmail).toHaveBeenCalled();
    await app.close();
  });
});

// ─── sendFriendRequest: email suppressed by prefs ─────────────────────────────

describe('POST /users/friend-requests — email suppressed by prefs', () => {
  it('does not send email when contactRequestEnabled=false', async () => {
    const emailService = makeEmailService();
    const prisma = makePrisma();
    prisma.userPreferences.findUnique = jest.fn<any>().mockResolvedValue({
      notification: { emailEnabled: true, contactRequestEnabled: false },
    });
    const { app } = await buildApp({ prisma, emailService });
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: OTHER_USER_ID } });
    expect(res.statusCode).toBe(200);
    expect(emailService.sendFriendRequestEmail).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── sendFriendRequest: DB error ──────────────────────────────────────────────

describe('POST /users/friend-requests — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/users/friend-requests', payload: { receiverId: OTHER_USER_ID } });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── respondToFriendRequest: accept creates new conversation ─────────────────

describe('PATCH /users/friend-requests/:id — accept creates new conversation', () => {
  it('creates a direct conversation when none exists', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    prisma.conversation.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversation.create).toHaveBeenCalled();
    await app.close();
  });

  it('auto-joins both users\' connected sockets to the new DM conversation room', async () => {
    const joinUserToConversationRoom = jest.fn<any>().mockResolvedValue(undefined);
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    prisma.conversation.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({
      prisma,
      socketIOHandler: { getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom }) },
    });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(OTHER_USER_ID, 'conv-new');
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(CURRENT_USER_ID, 'conv-new');
    await app.close();
  });
});

// ─── respondToFriendRequest: accept with notificationService + emailService ──

describe('PATCH /users/friend-requests/:id — accept with notifications + email', () => {
  it('sends notification and email to original sender on accept', async () => {
    const notificationService = makeNotificationService();
    const emailService = makeEmailService();
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    prisma.conversation.findFirst = jest.fn<any>().mockResolvedValue({ id: 'conv-existing' });
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: OTHER_USER_ID, email: 'bob@test.com', displayName: 'Bob', username: 'bob', systemLanguage: 'en',
    });
    prisma.userPreferences.findUnique = jest.fn<any>().mockResolvedValue({
      notification: { emailEnabled: true, contactRequestEnabled: true },
    });
    const { app } = await buildApp({ prisma, notificationService, emailService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    expect(notificationService.createFriendAcceptedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: OTHER_USER_ID })
    );
    expect(emailService.sendFriendAcceptedEmail).toHaveBeenCalled();
    await app.close();
  });
});

// ─── respondToFriendRequest: reject with notificationService ─────────────────

describe('PATCH /users/friend-requests/:id — reject with notificationService', () => {
  it('sends notification to original sender on reject', async () => {
    const notificationService = makeNotificationService();
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    const { app } = await buildApp({ prisma, notificationService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'reject' },
    });
    expect(res.statusCode).toBe(200);
    expect(notificationService.createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: OTHER_USER_ID })
    );
    await app.close();
  });
});

// ─── respondToFriendRequest: DB error ─────────────────────────────────────────

describe('PATCH /users/friend-requests/:id — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── respondToFriendRequest: accept, emailService but sender has no email ─────

describe('PATCH /users/friend-requests/:id — accept, sender has no email', () => {
  it('does not send email when sender has no email address', async () => {
    const emailService = makeEmailService();
    const prisma = makePrisma();
    prisma.friendRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: REQUEST_ID, senderId: OTHER_USER_ID, receiverId: CURRENT_USER_ID, status: 'pending',
    });
    prisma.conversation.findFirst = jest.fn<any>().mockResolvedValue({ id: 'conv-1' });
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      id: OTHER_USER_ID, email: null, displayName: 'Bob', username: 'bob', systemLanguage: 'en',
    });
    const { app } = await buildApp({ prisma, emailService });
    const res = await app.inject({
      method: 'PATCH', url: `/users/friend-requests/${REQUEST_ID}`, payload: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    expect(emailService.sendFriendAcceptedEmail).not.toHaveBeenCalled();
    await app.close();
  });
});
