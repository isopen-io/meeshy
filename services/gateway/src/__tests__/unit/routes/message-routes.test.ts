/**
 * message-routes.test.ts
 *
 * Unit tests for src/routes/messages.ts (GET/PUT/DELETE /messages/:id,
 * POST /messages/:id/status, GET /messages/:id/translations, etc.)
 *
 * Covers the HTTP layer: auth guards, 404/403 gates, happy-path 200/201,
 * and error handling (500). Service internals are mocked.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must come before any imports that pull these in
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn((_prisma: any, _opts: any) =>
    async (request: any) => {
      if (!request._authContext) {
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      }
      request.authContext = request._authContext;
    }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody:  jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

const mockDeleteAttachment = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    deleteAttachment: mockDeleteAttachment,
  })),
}));

const mockMarkMessagesAsRead   = jest.fn<any>().mockResolvedValue(undefined);
const mockGetLatestMessageSummary = jest.fn<any>().mockResolvedValue({ readByAll: false });
const mockGetMessageStatusDetails = jest.fn<any>().mockResolvedValue({ statuses: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } });
const mockGetAttachmentStatusDetails = jest.fn<any>().mockResolvedValue({ statuses: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } });
const mockMarkAudioAsListened  = jest.fn<any>().mockResolvedValue(undefined);
const mockMarkVideoAsWatched   = jest.fn<any>().mockResolvedValue(undefined);
const mockMarkImageAsViewed    = jest.fn<any>().mockResolvedValue(undefined);
const mockMarkAttachmentAsDownloaded = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead:          mockMarkMessagesAsRead,
    getLatestMessageSummary:     mockGetLatestMessageSummary,
    getMessageStatusDetails:     mockGetMessageStatusDetails,
    getAttachmentStatusDetails:  mockGetAttachmentStatusDetails,
    markAudioAsListened:         mockMarkAudioAsListened,
    markVideoAsWatched:          mockMarkVideoAsWatched,
    markImageAsViewed:           mockMarkImageAsViewed,
    markAttachmentAsDownloaded:  mockMarkAttachmentAsDownloaded,
  })),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../utils/translation-transformer', () => ({
  transformTranslationsToArray: jest.fn(() => []),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    READ_STATUS_UPDATED: 'read-status:updated',
    ATTACHMENT_STATUS_UPDATED: 'attachment-status:updated',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import messageRoutes from '../../../routes/messages';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MSG_ID  = '507f1f77bcf86cd799439011';
const ATT_ID  = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const USER_ID = '507f1f77bcf86cd799439014';
const PART_ID = '507f1f77bcf86cd799439015';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockPrisma: any = {
  message: {
    findFirst:  jest.fn<any>(),
    findUnique: jest.fn<any>(),
    update:     jest.fn<any>(),
  },
  participant: {
    findFirst:  jest.fn<any>(),
    findMany:   jest.fn<any>().mockResolvedValue([]),
  },
  conversation: {
    update: jest.fn<any>().mockResolvedValue({}),
  },
  messageAttachment: {
    findFirst: jest.fn<any>(),
  },
};

// ---------------------------------------------------------------------------
// Mock Socket.IO
// ---------------------------------------------------------------------------

const mockEmit = jest.fn();
const mockTo   = jest.fn().mockReturnValue({ emit: mockEmit, to: jest.fn().mockReturnValue({ emit: mockEmit }) });
const mockIO   = { to: mockTo };
const mockSocketIOHandler = {
  getManager: jest.fn(() => ({ getIO: jest.fn(() => mockIO) })),
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function makeAuthContext(overrides: Record<string, any> = {}) {
  return {
    isAuthenticated: true,
    userId: USER_ID,
    participantId: PART_ID,
    isAnonymous: false,
    registeredUser: { id: USER_ID, role: 'USER' },
    sessionToken: undefined,
    ...overrides,
  };
}

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('translationService', null);
  app.decorate('socketIOHandler', mockSocketIOHandler);
  app.decorate('notificationService', null);
  app.register(messageRoutes);
  return app;
}

function injectWithAuth(
  app: FastifyInstance,
  method: string,
  url: string,
  opts: { body?: any; authContext?: any } = {}
) {
  const authCtx = opts.authContext ?? makeAuthContext();
  return app.inject({
    method: method as any,
    url,
    payload: opts.body,
    headers: {
      'content-type': 'application/json',
      'x-test-auth': JSON.stringify(authCtx),
    },
    // Fastify inject passes request through preValidation; we set authContext
    // via the mocked createUnifiedAuthMiddleware which reads request._authContext.
    // Simulate it by setting it in the beforeSend hook via a custom decorator.
  } as any);
}

// The mocked auth middleware reads `request._authContext`.
// Since Fastify inject doesn't run hooks by default in a special way,
// we need to inject auth through a preHandler hook that runs before our route.
function buildAuthApp(authContext?: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('translationService', null);
  app.decorate('socketIOHandler', mockSocketIOHandler);
  app.decorate('notificationService', null);

  // Override the mocked auth middleware: attach authContext before route handler
  const { createUnifiedAuthMiddleware } = require('../../../middleware/auth');
  (createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      if (authContext === null) {
        // Simulate missing auth context (returns 401 upstream)
        reply401(req);
        return;
      }
      req.authContext = authContext ?? makeAuthContext();
    }
  );

  app.register(messageRoutes);
  return app;
}

function reply401(req: any) {
  // Simulate preValidation rejecting the request — Fastify stops the chain
  // when preValidation throws. We re-throw an error with statusCode 401.
  const e: any = new Error('Unauthorized');
  e.statusCode = 401;
  throw e;
}

// ---------------------------------------------------------------------------
// Test helpers: factory functions for mock DB responses
// ---------------------------------------------------------------------------

function makeMessage(overrides: any = {}) {
  return {
    id: MSG_ID,
    content: 'Hello',
    conversationId: CONV_ID,
    senderId: PART_ID,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    expiresAt: null,
    isViewOnce: false,
    maxViewOnceCount: null,
    viewOnceCount: 0,
    isBlurred: false,
    pinnedAt: null,
    effectFlags: 0,
    pinnedBy: null,
    validatedMentions: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deliveredToAllAt: null,
    receivedByAllAt: null,
    readByAllAt: null,
    deliveredCount: 0,
    readCount: 0,
    reactionSummary: [],
    reactionCount: 0,
    encryptedContent: null,
    encryptionMetadata: null,
    isEncrypted: false,
    encryptionMode: null,
    translations: null,
    sender: {
      id: PART_ID,
      userId: USER_ID,
      displayName: 'Alice',
      avatar: null,
      isOnline: true,
      type: 'user',
      user: { id: USER_ID, username: 'alice', avatar: null, isOnline: true }
    },
    conversation: {
      participants: [{ userId: USER_ID, role: 'member' }],
      createdAt: new Date('2026-01-01'),
    },
    attachments: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /messages/:messageId
// ---------------------------------------------------------------------------

describe('GET /messages/:messageId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildAuthApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with message when user is a participant', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(makeMessage());

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MSG_ID);
  });

  it('returns 404 when message does not exist', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a participant', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(
      makeMessage({ conversation: { participants: [], createdAt: new Date() } })
    );

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 when DB throws', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /messages/:messageId
// ---------------------------------------------------------------------------

describe('PUT /messages/:messageId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildAuthApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 404 when message not found or not owned by user', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PUT', url: `/messages/${MSG_ID}`,
      payload: { content: 'Updated' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when content is empty and message has no attachments', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(
      makeMessage({ sender: { userId: USER_ID }, attachments: [] })
    );

    const res = await app.inject({
      method: 'PUT', url: `/messages/${MSG_ID}`,
      payload: { content: '' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on successful edit', async () => {
    await app.ready();
    const msg = makeMessage({ sender: { userId: USER_ID }, attachments: [] });
    mockPrisma.message.findFirst.mockResolvedValue(msg);
    mockPrisma.message.update.mockResolvedValue({ ...msg, content: 'Updated', isEdited: true, editedAt: new Date() });

    const res = await app.inject({
      method: 'PUT', url: `/messages/${MSG_ID}`,
      payload: { content: 'Updated' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'PUT', url: `/messages/${MSG_ID}`,
      payload: { content: 'Updated' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /messages/:messageId
// ---------------------------------------------------------------------------

describe('DELETE /messages/:messageId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildAuthApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'DELETE', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the author and has no admin role', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(
      makeMessage({
        sender: { userId: 'other-user', displayName: 'Bob', user: { username: 'bob' } },
        conversation: {
          participants: [{ userId: USER_ID, role: 'member' }],
          createdAt: new Date(),
        },
      })
    );

    const res = await app.inject({ method: 'DELETE', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 when the message author deletes their own message', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(
      makeMessage({
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', user: { username: 'alice' } },
        conversation: {
          participants: [{ userId: USER_ID, role: 'member' }],
          createdAt: new Date(),
        },
        attachments: [],
      })
    );
    mockPrisma.message.update.mockResolvedValue({ deletedAt: new Date() });
    mockPrisma.message.findFirst
      .mockResolvedValueOnce(makeMessage({ sender: { userId: USER_ID } })) // first call
      .mockResolvedValueOnce(null); // lastNonDeletedMessage

    const res = await app.inject({ method: 'DELETE', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 200 when an admin deletes any message', async () => {
    await app.ready();
    const adminApp = buildAuthApp(makeAuthContext({ registeredUser: { id: USER_ID, role: 'ADMIN' } }));
    await adminApp.ready();

    mockPrisma.message.findFirst.mockResolvedValue(
      makeMessage({
        sender: { id: 'other-part', userId: 'other-user', displayName: 'Bob', user: { username: 'bob' } },
        conversation: {
          participants: [{ userId: USER_ID, role: 'member' }],
          createdAt: new Date(),
        },
        attachments: [],
      })
    );
    mockPrisma.message.update.mockResolvedValue({ deletedAt: new Date() });
    mockPrisma.message.findFirst.mockResolvedValueOnce(makeMessage()).mockResolvedValueOnce(null);

    const res = await adminApp.inject({ method: 'DELETE', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    await adminApp.close();
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'DELETE', url: `/messages/${MSG_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /messages/:messageId/translations
// ---------------------------------------------------------------------------

describe('GET /messages/:messageId/translations', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildAuthApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty translations array when message has no translations', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue({
      id: MSG_ID, content: 'Hello', originalLanguage: 'fr', translations: null, conversationId: CONV_ID,
    });
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PART_ID });

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/translations` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.messageId).toBe(MSG_ID);
    expect(Array.isArray(body.data.translations)).toBe(true);
  });

  it('returns 404 when message is not found', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/translations` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a participant', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue({
      id: MSG_ID, content: 'Hello', originalLanguage: 'fr', translations: null, conversationId: CONV_ID,
    });
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/translations` });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /messages/:messageId/history
// ---------------------------------------------------------------------------

describe('GET /messages/:messageId/history', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildAuthApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with history for message author', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(makeMessage({
      sender: { userId: USER_ID },
      conversation: { participants: [{ userId: USER_ID, role: 'member' }] },
    }));

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/history` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.messageId).toBe(MSG_ID);
  });

  it('returns 404 when message not found', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/history` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when non-author, non-admin tries to view history', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(makeMessage({
      sender: { userId: 'other-user' },
      conversation: { participants: [{ userId: USER_ID, role: 'member' }] },
    }));

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/history` });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /messages/:messageId/status (mark as read)
// ---------------------------------------------------------------------------

describe('POST /messages/:messageId/status', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildAuthApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 404 when message not found or user not a participant', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST', url: `/messages/${MSG_ID}/status`,
      payload: { status: 'read' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when trying to mark own message as read', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(makeMessage({
      senderId: PART_ID, // same as participant ID
      conversation: { participants: [{ id: PART_ID, userId: USER_ID }] },
    }));

    const res = await app.inject({
      method: 'POST', url: `/messages/${MSG_ID}/status`,
      payload: { status: 'read' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 when marking another\'s message as read', async () => {
    await app.ready();
    const othersPartId = 'other-participant-id';
    mockPrisma.message.findFirst.mockResolvedValue(makeMessage({
      senderId: othersPartId, // different participant
      conversation: {
        participants: [{ id: PART_ID, userId: USER_ID }],
        createdAt: new Date(),
      },
    }));
    mockPrisma.participant.findMany.mockResolvedValue([{ userId: USER_ID }]);

    const res = await app.inject({
      method: 'POST', url: `/messages/${MSG_ID}/status`,
      payload: { status: 'read' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMarkMessagesAsRead).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /messages/:messageId/status-details
// ---------------------------------------------------------------------------

describe('GET /messages/:messageId/status-details', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildAuthApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with paginated status details', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(makeMessage());

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/status-details` });
    expect(res.statusCode).toBe(200);
    expect(mockGetMessageStatusDetails).toHaveBeenCalledWith(MSG_ID, expect.objectContaining({ offset: 0, limit: 20 }));
  });

  it('returns 404 when message not found', async () => {
    await app.ready();
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/status-details` });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /attachments/:attachmentId/status
// ---------------------------------------------------------------------------

describe('POST /attachments/:attachmentId/status', () => {
  let app: FastifyInstance;

  const makeAttachment = (overrides: any = {}) => ({
    id: ATT_ID,
    messageId: MSG_ID,
    message: {
      id: MSG_ID,
      conversationId: CONV_ID,
      conversation: {
        participants: [{ userId: USER_ID }],
      },
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildAuthApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 404 when attachment not found or user not a participant', async () => {
    await app.ready();
    mockPrisma.messageAttachment.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATT_ID}/status`,
      payload: { action: 'listened' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 when marking audio as listened', async () => {
    await app.ready();
    mockPrisma.messageAttachment.findFirst.mockResolvedValue(makeAttachment());

    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATT_ID}/status`,
      payload: { action: 'listened', complete: true }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMarkAudioAsListened).toHaveBeenCalled();
  });

  it('returns 200 when marking image as viewed', async () => {
    await app.ready();
    mockPrisma.messageAttachment.findFirst.mockResolvedValue(makeAttachment());

    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATT_ID}/status`,
      payload: { action: 'viewed' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMarkImageAsViewed).toHaveBeenCalled();
  });

  it('returns 200 when marking attachment as downloaded', async () => {
    await app.ready();
    mockPrisma.messageAttachment.findFirst.mockResolvedValue(makeAttachment());

    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATT_ID}/status`,
      payload: { action: 'downloaded' }, headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMarkAttachmentAsDownloaded).toHaveBeenCalled();
  });
});
