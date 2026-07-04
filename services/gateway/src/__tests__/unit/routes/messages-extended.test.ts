/**
 * Extended unit tests for messages.ts routes.
 * Covers branches missing from messages.test.ts:
 * - DELETE with non-empty attachments (attachment deletion loop)
 * - DELETE with socketIO manager (socket emit)
 * - PUT with socketIO manager (socket emit)
 * - PUT without translationService (warn branch)
 * - POST /status with invalid status (400)
 * - POST /status with socketIO manager (socket emit)
 * - POST /attachments/status with 'watched' action
 * - POST /attachments/status with socketIO manager (socket emit)
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
const mockMarkAudioAsListened = jest.fn().mockResolvedValue(undefined);
const mockMarkVideoAsWatched = jest.fn().mockResolvedValue(undefined);
const mockMarkImageAsViewed = jest.fn().mockResolvedValue(undefined);
const mockMarkAttachmentAsDownloaded = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: (...args: any[]) => mockMarkMessagesAsRead(...args),
    getLatestMessageSummary: (...args: any[]) => mockGetLatestMessageSummary(...args),
    getMessageStatusDetails: jest.fn().mockResolvedValue({ statuses: [], pagination: {} }),
    getAttachmentStatusDetails: jest.fn().mockResolvedValue({ statuses: [], pagination: {} }),
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
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
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

// ─── Socket mock ──────────────────────────────────────────────────────────────

function makeMockSocketIO() {
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit, to: jest.fn().mockReturnThis() });
  return {
    mockEmit,
    mockTo,
    manager: {
      getIO: () => ({ to: mockTo }),
    },
  };
}

// ─── App factories ────────────────────────────────────────────────────────────

async function buildApp(opts: {
  socketIOManager?: any;
  translationService?: any;
  messageOverride?: any;
  attachmentOverride?: any;
} = {}): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    message: {
      findFirst: jest.fn().mockResolvedValue(opts.messageOverride ?? mockMessage),
      update: jest.fn().mockResolvedValue({ ...mockMessage, isEdited: true }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...mockMessage, isEdited: true }),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID }),
      findMany: jest.fn().mockResolvedValue([{ userId: USER_ID }]),
    },
    messageAttachment: {
      findFirst: jest.fn().mockResolvedValue(opts.attachmentOverride ?? mockAttachment),
    },
    conversation: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });

  if (opts.translationService !== undefined) {
    if (opts.translationService !== null) {
      app.decorate('translationService', opts.translationService);
    }
  } else {
    app.decorate('translationService', {
      _processRetranslationAsync: jest.fn().mockResolvedValue(undefined),
    });
  }

  const socketHandlerArg = opts.socketIOManager
    ? { getManager: () => opts.socketIOManager }
    : { getManager: () => null };
  app.decorate('socketIOHandler', socketHandlerArg);

  await messageRoutes(app);
  await app.ready();
  return app;
}

// ─── DELETE /messages/:messageId — with attachments ───────────────────────────

describe('DELETE /messages/:messageId — with attachments', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const msgWithAttachments = {
      ...mockMessage,
      attachments: [{ id: ATTACHMENT_ID }, { id: 'attach-2' }],
    };
    app = await buildApp({ messageOverride: msgWithAttachments });
  });
  afterAll(async () => { await app.close(); });

  it('calls deleteAttachment for each attachment', async () => {
    mockDeleteAttachment.mockClear();
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce({ ...mockMessage, attachments: [{ id: ATTACHMENT_ID }, { id: 'attach-2' }] })
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
    expect(mockDeleteAttachment).toHaveBeenCalledTimes(2);
    expect(mockDeleteAttachment).toHaveBeenCalledWith(ATTACHMENT_ID);
    expect(mockDeleteAttachment).toHaveBeenCalledWith('attach-2');
  });

  it('continues deletion even if one attachment deleteAttachment fails', async () => {
    mockDeleteAttachment.mockClear();
    mockDeleteAttachment.mockRejectedValueOnce(new Error('S3 fail'));
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce({ ...mockMessage, attachments: [{ id: ATTACHMENT_ID }, { id: 'attach-2' }] })
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
  });
});

// ─── DELETE /messages/:messageId — with socketIO ──────────────────────────────

describe('DELETE /messages/:messageId — with socketIO manager', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  beforeAll(async () => {
    const { mockEmit: emit, manager } = makeMockSocketIO();
    mockEmit = emit;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('emits MESSAGE_DELETED to conversation room', async () => {
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('message:deleted', expect.objectContaining({ messageId: MSG_ID }));
  });
});

// ─── PUT /messages/:messageId — with socketIO ─────────────────────────────────

describe('PUT /messages/:messageId — with socketIO manager', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  beforeAll(async () => {
    const { mockEmit: emit, manager } = makeMockSocketIO();
    mockEmit = emit;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('emits MESSAGE_EDITED to conversation room', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('message:edited', expect.any(Object));
  });
});

// ─── PUT /messages/:messageId — no translationService ────────────────────────

describe('PUT /messages/:messageId — without translationService', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ translationService: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 even when translationService is absent', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ─── POST /messages/:messageId/status — invalid status ───────────────────────

describe('POST /messages/:messageId/status — invalid status', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid status value', async () => {
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: { status: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when status is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /messages/:messageId/status — with socketIO ────────────────────────

describe('POST /messages/:messageId/status — with socketIO manager', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  beforeAll(async () => {
    const { mockEmit: emit, manager } = makeMockSocketIO();
    mockEmit = emit;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('emits READ_STATUS_UPDATED via socketIO', async () => {
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
    expect(mockEmit).toHaveBeenCalledWith('read-status:updated', expect.any(Object));
  });
});

// ─── POST /attachments/:id/status — watched action ───────────────────────────

describe('POST /attachments/:attachmentId/status — watched action', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 for watched action and calls markVideoAsWatched', async () => {
    mockMarkVideoAsWatched.mockClear();
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'watched', complete: true, playPositionMs: 1000, durationMs: 5000 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMarkVideoAsWatched).toHaveBeenCalledWith(
      USER_ID, ATTACHMENT_ID,
      expect.objectContaining({ watchPositionMs: 1000, watchDurationMs: 5000, complete: true })
    );
  });
});

// ─── POST /attachments/:id/status — invalid action ───────────────────────────

describe('POST /attachments/:attachmentId/status — invalid action', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid action value', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /attachments/:id/status — with socketIO ────────────────────────────

describe('POST /attachments/:attachmentId/status — with socketIO manager', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  beforeAll(async () => {
    const { mockEmit: emit, manager } = makeMockSocketIO();
    mockEmit = emit;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('emits ATTACHMENT_STATUS_UPDATED via socketIO', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', complete: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('attachment-status:updated', expect.objectContaining({
      attachmentId: ATTACHMENT_ID,
      action: 'listened',
    }));
  });
});

// ─── Error paths not covered in messages.test.ts ─────────────────────────────

describe('POST /messages/:messageId/status — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on unexpected DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: { status: 'read' },
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /messages/:messageId/history — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/history' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /messages/:messageId/translations — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/translations' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /messages/:messageId/status-details — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/status-details' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /attachments/:attachmentId/status-details — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.messageAttachment.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'GET', url: '/attachments/' + ATTACHMENT_ID + '/status-details' });
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /attachments/:attachmentId/status — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.messageAttachment.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened' },
    });
    expect(res.statusCode).toBe(500);
  });
});
