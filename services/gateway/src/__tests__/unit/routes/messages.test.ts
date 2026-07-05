/**
 * Unit tests for message routes (messages.ts)
 * Tests GET/PUT/DELETE /messages/:messageId, status, history, translations,
 * status-details, and attachment routes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

const mockDeleteAttachment = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    deleteAttachment: (...args: any[]) => mockDeleteAttachment(...args),
  })),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../utils/translation-transformer', () => ({
  transformTranslationsToArray: jest.fn().mockReturnValue([]),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    READ_STATUS_UPDATED: 'read-status:updated',
    MESSAGE_READ_STATUS_UPDATED: 'message:read-status-updated',
    ATTACHMENT_STATUS_UPDATED: 'attachment-status:updated',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

jest.mock('../../../validation/messages-schemas', () => ({
  MessageParamsSchema: {},
  AttachmentParamsSchema: {},
  UpdateMessageBodySchema: {},
  MessageStatusBodySchema: {},
  MessageStatusDetailsQuerySchema: {},
  AttachmentStatusBodySchema: {},
}));

const mockMarkMessagesAsRead = jest.fn().mockResolvedValue(undefined);
const mockGetLatestMessageSummary = jest.fn().mockResolvedValue({ readCount: 1 });
const mockGetMessageStatusDetails = jest.fn().mockResolvedValue({
  statuses: [],
  pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
});
const mockGetAttachmentStatusDetails = jest.fn().mockResolvedValue({
  statuses: [],
  pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
});
const mockMarkAudioAsListened = jest.fn().mockResolvedValue(undefined);
const mockMarkVideoAsWatched = jest.fn().mockResolvedValue(undefined);
const mockMarkImageAsViewed = jest.fn().mockResolvedValue(undefined);
const mockMarkAttachmentAsDownloaded = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: (...args: any[]) => mockMarkMessagesAsRead(...args),
    getLatestMessageSummary: (...args: any[]) => mockGetLatestMessageSummary(...args),
    getMessageStatusDetails: (...args: any[]) => mockGetMessageStatusDetails(...args),
    getAttachmentStatusDetails: (...args: any[]) => mockGetAttachmentStatusDetails(...args),
    markAudioAsListened: (...args: any[]) => mockMarkAudioAsListened(...args),
    markVideoAsWatched: (...args: any[]) => mockMarkVideoAsWatched(...args),
    markImageAsViewed: (...args: any[]) => mockMarkImageAsViewed(...args),
    markAttachmentAsDownloaded: (...args: any[]) => mockMarkAttachmentAsDownloaded(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const ATTACHMENT_ID = '507f1f77bcf86cd799439044';

const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  isAuthenticated: true,
  registeredUser: {
    id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith',
    displayName: 'Alice Smith', avatar: null, role: 'USER',
  },
};

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: PART_ID,
  content: 'Hello!',
  originalLanguage: 'fr',
  messageType: 'text',
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deliveredCount: 1,
  readCount: 0,
  deliveredToAllAt: null,
  readByAllAt: null,
  translations: null,
  sender: { id: PART_ID, userId: USER_ID, displayName: 'alice', avatar: null, type: 'registered', user: { username: 'alice' } },
  conversation: {
    id: CONV_ID,
    createdAt: new Date(),
    lastMessageAt: new Date('2026-07-01T00:00:00Z'),
    participants: [{ userId: USER_ID, role: 'member' }],
  },
  attachments: [],
};

const mockAttachment = {
  id: ATTACHMENT_ID,
  messageId: MSG_ID,
  message: {
    id: MSG_ID,
    conversationId: CONV_ID,
    conversation: {
      participants: [{ userId: USER_ID }],
    },
  },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    message: {
      findFirst: jest.fn().mockResolvedValue(mockMessage),
      update: jest.fn().mockResolvedValue({ ...mockMessage, isEdited: true }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...mockMessage, isEdited: true }),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID }),
      findMany: jest.fn().mockResolvedValue([{ userId: USER_ID }]),
    },
    messageAttachment: {
      findFirst: jest.fn().mockResolvedValue(mockAttachment),
    },
    conversation: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });

  app.decorate('translationService', {
    _processRetranslationAsync: jest.fn().mockResolvedValue(undefined),
  });

  app.decorate('socketIOHandler', { getManager: () => null });

  await messageRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /messages/:messageId ──────────────────────────────────────────────────

describe('GET /messages/:messageId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user not in conversation', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage,
      conversation: { ...mockMessage.conversation, participants: [] },
    });
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with message data', async () => {
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(500);
  });
});

// ─── PUT /messages/:messageId ─────────────────────────────────────────────────

describe('PUT /messages/:messageId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when content is empty and no attachments', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage, attachments: [],
    });
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on successful update', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect((app as any).prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: MSG_ID, deletedAt: null },
    }));
  });

  it('returns 404 without broadcasting when the message was deleted between read and write (concurrent delete race)', async () => {
    (app as any).prisma.message.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'X' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /messages/:messageId ──────────────────────────────────────────────

describe('DELETE /messages/:messageId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user lacks delete permission', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage,
      sender: { ...mockMessage.sender, userId: 'other-user' },
      conversation: {
        ...mockMessage.conversation,
        participants: [{ userId: USER_ID, role: 'member' }],
      },
    });
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful deletion', async () => {
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(500);
  });

  it('recomputes lastMessageAt via an optimistic-concurrency updateMany guarded on the pre-delete value', async () => {
    const lastNonDeletedAt = new Date('2026-07-02T00:00:00Z');
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce({ createdAt: lastNonDeletedAt });

    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.conversation.update).not.toHaveBeenCalled();
    expect((app as any).prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: CONV_ID, lastMessageAt: mockMessage.conversation.lastMessageAt },
      data: { lastMessageAt: lastNonDeletedAt },
    });
  });

  it('falls back to conversation.createdAt when every message in the conversation is deleted', async () => {
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);

    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: CONV_ID, lastMessageAt: mockMessage.conversation.lastMessageAt },
      data: { lastMessageAt: mockMessage.conversation.createdAt },
    });
  });
});

// ─── POST /messages/:messageId/status ─────────────────────────────────────────

describe('POST /messages/:messageId/status', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message or participant not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: { status: 'read' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when marking own message as read', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage,
      senderId: PART_ID,
      conversation: {
        ...mockMessage.conversation,
        participants: [{ id: PART_ID, userId: USER_ID }],
      },
    });
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: { status: 'read' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on successful status update', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage,
      senderId: 'other-part-id',
      conversation: {
        id: CONV_ID,
        createdAt: new Date(),
        participants: [{ id: PART_ID, userId: USER_ID }],
      },
    });
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: { status: 'read' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /messages/:messageId/history ─────────────────────────────────────────

describe('GET /messages/:messageId/history', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/history' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user lacks history permission', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage,
      sender: { userId: 'other-user' },
      conversation: {
        ...mockMessage.conversation,
        participants: [{ userId: USER_ID, role: 'member' }],
      },
    });
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/history' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with history (message author can view)', async () => {
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/history' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /messages/:messageId/translations ────────────────────────────────────

describe('GET /messages/:messageId/translations', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/translations' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user not a participant', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/translations' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with translations', async () => {
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/translations' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /messages/:messageId/status-details ──────────────────────────────────

describe('GET /messages/:messageId/status-details', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/status-details' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with status details', async () => {
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/status-details' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /attachments/:attachmentId/status-details ────────────────────────────

describe('GET /attachments/:attachmentId/status-details', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when attachment not found', async () => {
    (app as any).prisma.messageAttachment.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/attachments/' + ATTACHMENT_ID + '/status-details' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with attachment status details', async () => {
    const res = await app.inject({ method: 'GET', url: '/attachments/' + ATTACHMENT_ID + '/status-details' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /attachments/:attachmentId/status ───────────────────────────────────

describe('POST /attachments/:attachmentId/status', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when attachment not found', async () => {
    (app as any).prisma.messageAttachment.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 for listened action', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', complete: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 200 for viewed action', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'viewed' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 200 for downloaded action', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'downloaded' },
    });
    expect(res.statusCode).toBe(200);
  });
});
