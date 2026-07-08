/**
 * @jest-environment node
 *
 * Tests for MessageHandler.handleMessageEdit and handleMessageDelete.
 * These methods were added in feat(gateway): implement WebSocket message:edit
 * and message:delete handlers but had 0% test coverage.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer, Socket } from 'socket.io';

// ── Module-level mocks ─────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    })),
    warn: jest.fn(),
  },
  performanceLogger: {
    withTiming: jest.fn().mockImplementation((_n: unknown, fn: () => unknown) => fn()),
  },
}));

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockGetConnectedUser = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (...a: any[]) => mockGetConnectedUser(...a),
  extractJWTToken: jest.fn(),
  extractSessionToken: jest.fn(),
  normalizeConversationId: (...a: any[]) => mockNormalizeConversationId(...a),
}));

const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: (...a: any[]) => mockValidateSocketEvent(...a),
}));

const mockValidateMessageLength = jest.fn() as jest.Mock<any>;
jest.mock('../../../config/message-limits', () => ({
  validateMessageLength: (...a: any[]) => mockValidateMessageLength(...a),
  MESSAGE_LIMITS: { MAX_MESSAGE_LENGTH: 5000 },
}));

const mockCheckLimit = jest.fn() as jest.Mock<any>;
const mockGetRateLimitInfo = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: () => ({
    checkLimit: (...a: any[]) => mockCheckLimit(...a),
    getRateLimitInfo: (...a: any[]) => mockGetRateLimitInfo(...a),
  }),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    MESSAGE_SEND_PER_CONVERSATION: { maxRequests: 10, windowMs: 10000, keyPrefix: 'socket:message:send-conv' },
    MESSAGE_EDIT: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:edit' },
    MESSAGE_DELETE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:delete' },
  },
}));

const mockIsBlockedBetween = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/blocking', () => ({
  isBlockedBetween: (...a: any[]) => mockIsBlockedBetween(...a),
}));

const mockResolveParticipant = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipant: (...a: any[]) => mockResolveParticipant(...a),
}));

const mockGroupSocketsByLanguage = jest.fn() as jest.Mock<any>;
const mockFilterMessagePayloadForLanguages = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/message-payload-filter', () => ({
  groupSocketsByLanguage: (...a: any[]) => mockGroupSocketsByLanguage(...a),
  filterMessagePayloadForLanguages: (...a: any[]) => mockFilterMessagePayloadForLanguages(...a),
}));

const mockGetCacheStore = jest.fn() as jest.Mock<any>;
const mockCacheGet = jest.fn() as jest.Mock<any>;
const mockCacheSet = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => mockGetCacheStore(),
}));

const mockResolveMentionedUsers = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...a: any[]) => mockResolveMentionedUsers(...a),
}));

jest.mock('../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: jest.fn(),
  postReplyToFromMetadata: jest.fn(() => null),
  POST_REPLY_SNAPSHOT_SELECT: { id: true },
}));

jest.mock('../../serializeAttachmentForSocket', () => ({
  serializeAttachmentForSocket: jest.fn((a: unknown) => a),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: jest.fn(() => Promise.resolve()) },
}));

jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: { onNewMessage: jest.fn(() => Promise.resolve()) },
}));

// ── After all mocks, import the class ──────────────────────────────────────

import { MessageHandler, type MessageHandlerDependencies } from '../MessageHandler';

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_MSG_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VALID_CONV_ID = 'c1d2e3f4a5b6c1d2e3f4a5b6';
const USER_ID = 'user0011223344556677889900';
const PARTICIPANT_ID = 'part0011223344556677889900';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSocket(overrides: Partial<Socket> = {}): jest.Mocked<Socket> {
  return {
    id: 'socket-1',
    emit: jest.fn(),
    broadcast: { to: jest.fn(() => ({ emit: jest.fn() })) },
    ...overrides,
  } as unknown as jest.Mocked<Socket>;
}

function makeIO(): jest.Mocked<SocketIOServer> {
  const mockEmit = jest.fn();
  const mockToResult = { emit: mockEmit, to: jest.fn().mockReturnThis(), except: jest.fn().mockReturnThis() };
  return {
    to: jest.fn(() => mockToResult),
    sockets: { adapter: { rooms: new Map() } },
  } as unknown as jest.Mocked<SocketIOServer>;
}

function makePrisma(overrides: Record<string, unknown> = {}): jest.Mocked<PrismaClient> {
  return {
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    post: { findUnique: jest.fn() },
    ...overrides,
  } as unknown as jest.Mocked<PrismaClient>;
}

function makeTranslationService() {
  return { retranslateMessageAsync: jest.fn(() => Promise.resolve()) } as any;
}

function makeAttachmentService() {
  return {
    getAttachment: jest.fn() as jest.Mock<any>,
    deleteAttachment: jest.fn(() => Promise.resolve()) as jest.Mock<any>,
  };
}

function makeReadStatusService() {
  return {
    getUnreadCountsForParticipants: jest.fn() as jest.Mock<any>,
    markMessagesAsReceived: jest.fn() as jest.Mock<any>,
    getLatestMessageSummary: jest.fn() as jest.Mock<any>,
  };
}

function makePrivacyService() {
  return {
    shouldShowReadReceipts: jest.fn() as jest.Mock<any>,
    getPreferencesForUsers: jest.fn() as jest.Mock<any>,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}): MessageHandlerDependencies {
  return {
    io: makeIO(),
    prisma: makePrisma(),
    messagingService: { handleMessage: jest.fn() } as any,
    translationService: makeTranslationService(),
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: { createMessageNotification: jest.fn() } as any,
    connectedUsers: new Map<string, any>(),
    socketToUser: new Map<string, string>(),
    stats: { messages_processed: 0, errors: 0 },
    agentClient: null,
    attachmentService: makeAttachmentService() as any,
    readStatusService: makeReadStatusService() as any,
    privacyPreferencesService: makePrivacyService() as any,
    ...overrides,
  } as MessageHandlerDependencies;
}

function makeSocketUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID, socketId: 'socket-1', isAnonymous: false,
    language: 'fr', resolvedLanguages: ['fr'], userId: USER_ID,
    participantId: PARTICIPANT_ID, ...overrides,
  };
}

function makeMessageRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_MSG_ID,
    conversationId: VALID_CONV_ID,
    senderId: PARTICIPANT_ID,
    content: 'Original content',
    originalLanguage: 'fr',
    sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'User', avatar: null },
    attachments: [],
    conversation: {
      createdAt: new Date('2024-01-01'),
      lastMessageAt: new Date('2024-05-01'),
      participants: [],
    },
    ...overrides,
  };
}

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('MessageHandler — handleMessageEdit', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: 'Edited content' },
    });
    mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);

    deps = makeDeps();
    handler = new MessageHandler(deps);
    socket = makeSocket();
    callback = jest.fn();

    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });
  });

  it('returns error on schema validation failure', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Invalid payload' });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: '' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Invalid payload' }));
  });

  it('returns error when user not in socketToUser map', async () => {
    deps.socketToUser.clear();

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns error when user is anonymous', async () => {
    deps.connectedUsers.set(USER_ID, makeSocketUser({ isAnonymous: true }));

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Authentication required') })
    );
  });

  it('returns error when rate limit exceeded', async () => {
    mockCheckLimit.mockResolvedValue(false);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 45000 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('45') }));
  });

  it('returns error when message not found (not author or different user)', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(null);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not found') })
    );
  });

  it('returns error when edited content is empty and no attachments', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({ attachments: [] })
    );
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: '   ' },
    });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: '   ' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('cannot be empty') })
    );
  });

  it('allows edit with empty content when message has attachments', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(
      makeMessageRecord({ attachments: [{ id: 'att-1' }] })
    );
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: '' },
    });
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: '' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('updates message in database on success, guarded against a concurrent delete', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(deps.prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: VALID_MSG_ID, deletedAt: null },
      data: expect.objectContaining({ content: 'Edited content', isEdited: true, translations: null }),
    }));
  });

  it('rejects the edit and does not broadcast when the message was deleted between read and write', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 0 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not found') })
    );
    expect(deps.io.to).not.toHaveBeenCalled();
  });

  it('broadcasts MESSAGE_EDITED to conversation room on success', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    const ioToMock = (deps.io.to as jest.Mock<any>);
    expect(ioToMock).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
    const mockToResult = ioToMock.mock.results[0]?.value as any;
    expect(mockToResult.emit).toHaveBeenCalledWith('message:edited', expect.objectContaining({
      id: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
    }));
  });

  it('calls callback with success and messageId on success', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true, data: { messageId: VALID_MSG_ID },
    });
  });

  it('triggers retranslation asynchronously after edit', async () => {
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: 'Edited' },
    });
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited' }, callback);

    expect((deps.translationService as any).retranslateMessageAsync).toHaveBeenCalledWith(
      VALID_MSG_ID,
      expect.objectContaining({ id: VALID_MSG_ID, content: 'Edited' })
    );
  });

  it('handles unexpected exception and returns error callback', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockRejectedValue(new Error('DB failure'));

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Failed to edit') })
    );
  });

  it('works without callback (no crash)', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockRejectedValue(new Error('fail'));

    await expect(
      handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'x' }, undefined)
    ).resolves.not.toThrow();
  });

  it('enqueues the edit for an offline participant into the delivery queue', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const offlineUserId = 'user-offline-edit-00112233445566';
    deps = makeDeps({ deliveryQueue: { enqueue } as any });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID },
      { id: 'part-offline-edit', userId: offlineUserId },
    ]);

    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(offlineUserId, expect.objectContaining({
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      eventType: 'edited',
      payload: expect.objectContaining({ id: VALID_MSG_ID, content: 'Edited content' }),
    }));
  });
});

// ── handleMessageDelete ────────────────────────────────────────────────────

describe('MessageHandler — handleMessageDelete', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;

  function setupSuccessfulDelete(overrides: {
    senderUserId?: string;
    memberRole?: string;
    globalRole?: string;
    attachments?: { id: string }[];
  } = {}) {
    const { senderUserId = USER_ID, memberRole, globalRole, attachments = [] } = overrides;
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({
      id: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      senderId: PARTICIPANT_ID,
      sender: { id: PARTICIPANT_ID, userId: senderUserId },
      conversation: {
        createdAt: new Date('2024-01-01'),
        lastMessageAt: new Date('2024-05-01'),
        participants: memberRole ? [{ role: memberRole }] : [],
      },
      attachments,
    });
    if (globalRole) {
      (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: globalRole });
    }
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({ createdAt: new Date('2024-06-01') });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID },
    });
    mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);

    deps = makeDeps();
    handler = new MessageHandler(deps);
    socket = makeSocket();
    callback = jest.fn();

    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });
  });

  it('returns error on schema validation failure', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Invalid' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Invalid' }));
  });

  it('returns error when user not in socketToUser map', async () => {
    deps.socketToUser.clear();

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns error when user is anonymous', async () => {
    deps.connectedUsers.set(USER_ID, makeSocketUser({ isAnonymous: true }));

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Authentication required') })
    );
  });

  it('returns error when rate limit exceeded', async () => {
    mockCheckLimit.mockResolvedValue(false);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 20000 });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('20') }));
  });

  it('returns error when message not found', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(null);

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not found') })
    );
  });

  it('allows message author to delete their own message', async () => {
    setupSuccessfulDelete({ senderUserId: USER_ID });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows conversation admin to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', memberRole: 'admin' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows conversation moderator to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', memberRole: 'moderator' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows global ADMIN to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', globalRole: 'ADMIN' });
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'ADMIN' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows global BIGBOSS to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', globalRole: 'BIGBOSS' });
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'BIGBOSS' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('allows global MODERATOR to delete any message', async () => {
    setupSuccessfulDelete({ senderUserId: 'other-user', globalRole: 'MODERATOR' });
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'MODERATOR' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
  });

  it('returns unauthorized when user has no delete permission', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue({
      id: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      senderId: PARTICIPANT_ID,
      sender: { id: PARTICIPANT_ID, userId: 'another-user-id' },
      conversation: {
        createdAt: new Date('2024-01-01'),
        participants: [{ role: 'member' }],
      },
      attachments: [],
    });
    (deps.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ role: 'USER' });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not authorized') })
    );
  });

  it('soft-deletes message by setting deletedAt', async () => {
    setupSuccessfulDelete();

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(deps.prisma.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: VALID_MSG_ID },
      data: expect.objectContaining({ deletedAt: expect.any(Date), translations: null }),
    }));
  });

  it('recomputes conversation lastMessageAt, guarded against cursor regression', async () => {
    const lastMsgDate = new Date('2024-06-15');
    const convLastMessageAt = new Date('2024-05-01');
    (deps.prisma.message.findFirst as jest.Mock<any>)
      .mockResolvedValueOnce({
        id: VALID_MSG_ID, conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        sender: { id: PARTICIPANT_ID, userId: USER_ID },
        conversation: { createdAt: new Date('2024-01-01'), lastMessageAt: convLastMessageAt, participants: [] },
        attachments: [],
      })
      .mockResolvedValueOnce({ createdAt: lastMsgDate });
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    // Optimistic-concurrency guard: the write only lands while lastMessageAt is
    // still the value read at handler start — a racing message:new advances it,
    // the guard mismatches, and the cursor never regresses onto the deleted message.
    expect(deps.prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: VALID_CONV_ID, lastMessageAt: convLastMessageAt },
      data: { lastMessageAt: lastMsgDate },
    });
  });

  it('falls back to conversation.createdAt when all messages are deleted', async () => {
    const convCreatedAt = new Date('2024-01-01');
    const convLastMessageAt = new Date('2024-05-01');
    (deps.prisma.message.findFirst as jest.Mock<any>)
      .mockResolvedValueOnce({
        id: VALID_MSG_ID, conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        sender: { id: PARTICIPANT_ID, userId: USER_ID },
        conversation: { createdAt: convCreatedAt, lastMessageAt: convLastMessageAt, participants: [] },
        attachments: [],
      })
      .mockResolvedValueOnce(null);
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(deps.prisma.conversation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { lastMessageAt: convCreatedAt },
    }));
  });

  it('broadcasts MESSAGE_DELETED to conversation room', async () => {
    setupSuccessfulDelete();

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    const ioToMock = (deps.io.to as jest.Mock<any>);
    expect(ioToMock).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
    const mockToResult = ioToMock.mock.results[0]?.value as any;
    expect(mockToResult.emit).toHaveBeenCalledWith('message:deleted', {
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
    });
  });

  it('deletes attachments before soft-deleting message', async () => {
    setupSuccessfulDelete({ attachments: [{ id: 'att-1' }, { id: 'att-2' }] });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect((deps.attachmentService as any).deleteAttachment).toHaveBeenCalledWith('att-1');
    expect((deps.attachmentService as any).deleteAttachment).toHaveBeenCalledWith('att-2');
  });

  it('continues soft-delete even if attachment deletion fails', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({
      id: VALID_MSG_ID, conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
      sender: { id: PARTICIPANT_ID, userId: USER_ID },
      conversation: { createdAt: new Date('2024-01-01'), lastMessageAt: new Date('2024-05-01'), participants: [] },
      attachments: [{ id: 'att-bad' }],
    });
    (deps.attachmentService as any).deleteAttachment.mockRejectedValue(new Error('S3 error'));
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({ createdAt: new Date() });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true, data: { messageId: VALID_MSG_ID } });
    expect(deps.prisma.message.update).toHaveBeenCalled();
  });

  it('handles unexpected exception and returns error callback', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockRejectedValue(new Error('DB crash'));

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Failed to delete') })
    );
  });

  it('works without callback (no crash)', async () => {
    (deps.prisma.message.findFirst as jest.Mock<any>).mockRejectedValue(new Error('fail'));

    await expect(
      handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, undefined)
    ).resolves.not.toThrow();
  });

  it('enqueues the delete for an offline participant into the delivery queue', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const offlineUserId = 'user-offline-del-00112233445566';
    deps = makeDeps({ deliveryQueue: { enqueue } as any });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    setupSuccessfulDelete({ senderUserId: USER_ID });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID },
      { id: 'part-offline-del', userId: offlineUserId },
    ]);

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(offlineUserId, expect.objectContaining({
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      eventType: 'deleted',
      payload: expect.objectContaining({ messageId: VALID_MSG_ID, conversationId: VALID_CONV_ID }),
    }));
  });

  it('enqueues the delete for the OFFLINE original author when an admin deletes their message', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const offlineAuthorUserId = 'user-offline-author-001122334455';
    deps = makeDeps({ deliveryQueue: { enqueue } as any });
    handler = new MessageHandler(deps);
    deps.socketToUser.set('socket-1', USER_ID);          // admin (the deleter) is online
    deps.connectedUsers.set(USER_ID, makeSocketUser());
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    // Admin USER_ID deletes a message AUTHORED by an offline user. The author's
    // participant id (message.senderId = PARTICIPANT_ID) is NOT the deleter — the
    // skip arg must exclude the deleter, never the author, or the offline author
    // never learns their moderated message was removed.
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({
      id: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
      senderId: PARTICIPANT_ID,
      sender: { id: PARTICIPANT_ID, userId: offlineAuthorUserId },
      conversation: {
        createdAt: new Date('2024-01-01'),
        lastMessageAt: new Date('2024-05-01'),
        participants: [{ id: 'deleter-participant', role: 'admin' }],
      },
      attachments: [],
    });
    (deps.prisma.message.update as jest.Mock<any>).mockResolvedValue({ id: VALID_MSG_ID });
    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValueOnce({ createdAt: new Date('2024-06-01') });
    (deps.prisma.conversation.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([
      { id: 'deleter-participant', userId: USER_ID },        // the deleter (online → skipped anyway)
      { id: PARTICIPANT_ID, userId: offlineAuthorUserId },   // the author == message.senderId, OFFLINE
    ]);

    await handler.handleMessageDelete(socket, { messageId: VALID_MSG_ID }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    // Before the fix the author was skipped (p.id === message.senderId) and the
    // enqueue never happened; only the deleter should be excluded.
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(offlineAuthorUserId, expect.objectContaining({
      eventType: 'deleted',
      messageId: VALID_MSG_ID,
      conversationId: VALID_CONV_ID,
    }));
  });
});
