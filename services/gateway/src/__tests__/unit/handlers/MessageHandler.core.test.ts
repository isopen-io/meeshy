/**
 * @jest-environment node
 *
 * Comprehensive unit tests for MessageHandler covering:
 * - handleMessageSend
 * - handleMessageSendWithAttachments
 * - broadcastNewMessage
 * - Private helpers: _sendError, _sendResponse, _getUserContext, _parseTranslations,
 *   _buildMessagePayload, _serializeAttachmentsField, _updateUnreadCounts,
 *   _resolveMentionUserIds, _notifyAgent, _emitMessageNewByLanguage
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ============================================================
// MODULE MOCKS — must come before any imports
// ============================================================

// All mocks typed as jest.fn<() => any> to avoid TS2556 issues with spread args
const mockCheckLimit: any = jest.fn(async () => true);
const mockGetRateLimitInfo: any = jest.fn(() => ({ resetIn: 5000 }));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({
    checkLimit: (...a: any[]) => mockCheckLimit(...a),
    getRateLimitInfo: (...a: any[]) => mockGetRateLimitInfo(...a),
  }),
  SOCKET_RATE_LIMITS: { MESSAGE_SEND: 'message:send' },
}));

const mockValidateSocketEvent: any = jest.fn(() => ({ success: true, data: {} }));
jest.mock('../../../middleware/validation.js', () => ({
  validateSocketEvent: (...a: any[]) => mockValidateSocketEvent(...a),
}));

const mockValidateMessageLength: any = jest.fn(() => ({ isValid: true, error: undefined }));
jest.mock('../../../config/message-limits', () => ({
  validateMessageLength: (...a: any[]) => mockValidateMessageLength(...a),
}));

const mockGetConnectedUser: any = jest.fn(() => null);
const mockNormalizeConversationId: any = jest.fn(async () => 'conv-normalized');
jest.mock('../../../socketio/utils/socket-helpers', () => ({
  getConnectedUser: (...a: any[]) => mockGetConnectedUser(...a),
  normalizeConversationId: (...a: any[]) => mockNormalizeConversationId(...a),
  extractJWTToken: jest.fn(),
  extractSessionToken: jest.fn(),
}));

const mockResolveParticipant: any = jest.fn(async () => ({ participantId: 'participant-1' }));
jest.mock('../../../socketio/utils/participant-resolver.js', () => ({
  resolveParticipant: (...a: any[]) => mockResolveParticipant(...a),
}));

const mockConversationStatsUpdateOnNewMessage: any = jest.fn(async () => null);
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...a: any[]) => mockConversationStatsUpdateOnNewMessage(...a),
  },
}));

const mockConversationMessageStatsOnNewMessage: any = jest.fn(async () => null);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    onNewMessage: (...a: any[]) => mockConversationMessageStatsOnNewMessage(...a),
  },
}));

const mockResolveMentionedUsers: any = jest.fn(async () => []);
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...a: any[]) => mockResolveMentionedUsers(...a),
}));

const mockIsBlockedBetween: any = jest.fn(async () => false);
jest.mock('../../../utils/blocking', () => ({
  isBlockedBetween: (...a: any[]) => mockIsBlockedBetween(...a),
}));

const cacheGet: any = jest.fn(async () => null);
const cacheSet: any = jest.fn(async () => undefined);
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: (...a: any[]) => cacheGet(...a), set: (...a: any[]) => cacheSet(...a) }),
}));

const mockSerializeAttachment: any = jest.fn((att: any) => att);
jest.mock('../../../socketio/serializeAttachmentForSocket', () => ({
  serializeAttachmentForSocket: (...a: any[]) => mockSerializeAttachment(...a),
}));

const mockBuildPostReplyTo: any = jest.fn((post: any) => ({ snapshot: post }));
const mockPostReplyToFromMetadata: any = jest.fn(() => null);
jest.mock('../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: (...a: any[]) => mockBuildPostReplyTo(...a),
  postReplyToFromMetadata: (...a: any[]) => mockPostReplyToFromMetadata(...a),
  POST_REPLY_SNAPSHOT_SELECT: { id: true, content: true },
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentForwardPreviewSelect: { id: true, mimeType: true },
  attachmentMediaSelect: { id: true, mimeType: true, url: true },
}));

jest.mock('../../../services/MessagingService', () => ({ MessagingService: jest.fn() }));
jest.mock('../../../services/StatusService', () => ({ StatusService: jest.fn() }));
jest.mock('../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({ MessageTranslationService: jest.fn() }));
jest.mock('../../../services/attachments/AttachmentService', () => ({ AttachmentService: jest.fn() }));

const mockGroupSocketsByLanguage: any = jest.fn(() => []);
const mockFilterMessagePayloadForLanguages: any = jest.fn((payload: any) => payload);
jest.mock('../../../socketio/utils/message-payload-filter.js', () => ({
  groupSocketsByLanguage: (...a: any[]) => mockGroupSocketsByLanguage(...a),
  filterMessagePayloadForLanguages: (...a: any[]) => mockFilterMessagePayloadForLanguages(...a),
}));

const mockEnhancedLogger = {
  child: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
};
const mockPerformanceLogger = {
  withTiming: jest.fn(async (_name: any, fn: () => Promise<any>, _meta: any) => fn()),
};
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: mockEnhancedLogger,
  performanceLogger: mockPerformanceLogger,
}));

// Now import the SUT
import { MessageHandler } from '../../../socketio/handlers/MessageHandler';
import type { MessageHandlerDependencies } from '../../../socketio/handlers/MessageHandler';

// ============================================================
// TYPE HELPERS
// ============================================================

interface SocketUser {
  id: string;
  socketId: string;
  isAnonymous: boolean;
  language: string;
  resolvedLanguages: string[];
  participantId?: string;
  userId?: string;
  displayName?: string;
}

const defaultSocketUser: SocketUser = {
  id: 'user-1',
  socketId: 'socket-1',
  isAnonymous: false,
  language: 'fr',
  resolvedLanguages: ['fr'],
  userId: 'user-1',
  participantId: 'participant-1',
  displayName: 'Alice',
};

// ============================================================
// FACTORIES
// ============================================================

function makeSocket(id = 'socket-1') {
  const broadcastEmit = jest.fn();
  const broadcastTo = jest.fn(() => ({ emit: broadcastEmit }));
  return {
    id,
    emit: jest.fn(),
    broadcast: { to: broadcastTo, emit: broadcastEmit },
    _broadcastEmit: broadcastEmit,
  } as any;
}

function makeMockIo(rooms?: Map<string, Set<string>>) {
  const emitFn = jest.fn();
  const exceptFn = jest.fn(() => ({ emit: emitFn }));
  const toFn = jest.fn();

  const chainable: any = {
    emit: emitFn,
    except: exceptFn,
    to: (...args: unknown[]) => {
      toFn(...args);
      return chainable;
    },
  };

  return {
    to: (...args: unknown[]) => {
      toFn(...args);
      return chainable;
    },
    sockets: {
      adapter: {
        rooms: rooms ?? new Map(),
      },
    },
    _emit: emitFn,
    _except: exceptFn,
    _to: toFn,
  } as any;
}

function makeMockPrisma(overrides: Record<string, any> = {}) {
  return {
    conversation: {
      findUnique: jest.fn(async () => null),
      ...overrides.conversation,
    },
    message: {
      findUnique: jest.fn(async () => null),
      ...overrides.message,
    },
    participant: {
      findMany: jest.fn(async () => []),
      ...overrides.participant,
    },
    post: {
      findUnique: jest.fn(async () => null),
      ...overrides.post,
    },
    user: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      ...overrides.user,
    },
  } as any;
}

function makeMockMessagingService(msgOverride: object = {}) {
  const defaultMsg = {
    id: 'msg-server-1',
    conversationId: 'conv-abc',
    senderId: 'participant-1',
    content: 'hello world',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    clientMessageId: 'cid_12345678-1234-4000-8000-123456789012',
    originalLanguage: 'fr',
    sender: { id: 'participant-1', userId: 'user-1', displayName: 'Alice', username: 'alice', avatar: null },
    attachments: [],
    translations: [],
    messageType: 'text',
    replyToId: null,
    storyReplyToId: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    isEncrypted: false,
    encryptionMode: null,
    encryptedContent: null,
    encryptionMetadata: null,
    ...msgOverride,
  };

  return {
    handleMessage: jest.fn(async () => ({
      success: true as boolean,
      data: defaultMsg,
      error: undefined as string | undefined,
    })),
  };
}

function makeMockAttachmentService(attachments: any[] = []) {
  return {
    getAttachment: jest.fn(async (id: string) =>
      attachments.find((a) => a.id === id) ?? null
    ),
  };
}

function makeMockReadStatusService() {
  return {
    markMessagesAsReceived: jest.fn(async () => undefined),
    getLatestMessageSummary: jest.fn(async () => ({ totalMembers: 2, deliveredCount: 1, readCount: 0 })),
    getUnreadCountsForParticipants: jest.fn(async () => new Map<string, number>()),
  };
}

function makeMockPrivacyPreferencesService() {
  return {
    getPreferencesForUsers: jest.fn(async (users: Array<{ id: string }>) =>
      new Map(users.map((u) => [u.id, { showReadReceipts: true }]))
    ),
  };
}

interface HandlerOptions {
  connectedUsers?: Map<string, SocketUser>;
  socketToUser?: Map<string, string>;
  messagingService?: any;
  prisma?: any;
  io?: any;
  attachmentService?: any;
  readStatusService?: any;
  privacyPreferencesService?: any;
  agentClient?: any;
  stats?: { messages_processed: number; errors: number };
}

function makeHandler(opts: HandlerOptions = {}) {
  const io = opts.io ?? makeMockIo();
  const prisma = opts.prisma ?? makeMockPrisma();
  const messagingService = opts.messagingService ?? makeMockMessagingService();
  const connectedUsers = opts.connectedUsers ?? new Map<string, SocketUser>();
  const socketToUser = opts.socketToUser ?? new Map<string, string>();
  const stats = opts.stats ?? { messages_processed: 0, errors: 0 };

  const deps: MessageHandlerDependencies = {
    io,
    prisma,
    messagingService,
    translationService: {} as any,
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: {} as any,
    connectedUsers: connectedUsers as any,
    socketToUser,
    stats,
    attachmentService: opts.attachmentService ?? makeMockAttachmentService(),
    readStatusService: opts.readStatusService ?? makeMockReadStatusService(),
    privacyPreferencesService: opts.privacyPreferencesService ?? makeMockPrivacyPreferencesService(),
    agentClient: opts.agentClient ?? null,
  };

  return { handler: new MessageHandler(deps), io, prisma, messagingService, stats, connectedUsers, socketToUser };
}

function makeAuthenticatedSetup(userOverride: Partial<SocketUser> = {}) {
  const user: SocketUser = { ...defaultSocketUser, ...userOverride };
  const connectedUsers = new Map<string, SocketUser>();
  connectedUsers.set(user.userId!, user);

  const socketToUser = new Map<string, string>();
  socketToUser.set('socket-1', user.userId!);

  mockGetConnectedUser.mockReturnValue({ user });

  return { user, connectedUsers, socketToUser };
}

const VALID_CID = 'cid_12345678-1234-4000-8000-123456789012';

function makeValidSendData(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: 'conv-abc',
    content: 'hello world',
    clientMessageId: VALID_CID,
    ...overrides,
  };
}

// ============================================================
// TESTS: handleMessageSend
// ============================================================

describe('MessageHandler.handleMessageSend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockValidateMessageLength.mockReturnValue({ isValid: true });
    mockResolveParticipant.mockResolvedValue({ participantId: 'participant-1' });
    mockGetConnectedUser.mockReturnValue(null);
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  it('calls _sendError when schema validation fails', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Invalid schema' });
    const socket = makeSocket();
    const cb = jest.fn();
    const { handler } = makeHandler();

    await handler.handleMessageSend(socket, makeValidSendData() as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.anything());
  });

  it('sends error when user is not authenticated (socket not in socketToUser)', async () => {
    const socket = makeSocket();
    const cb = jest.fn();
    const { handler } = makeHandler();

    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });

    await handler.handleMessageSend(socket, makeValidSendData() as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
  });

  it('sends error when getConnectedUser returns null', async () => {
    const socketToUser = new Map([['socket-1', 'user-1']]);
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    mockGetConnectedUser.mockReturnValue(null);
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });

    const { handler } = makeHandler({ socketToUser });
    await handler.handleMessageSend(socket, makeValidSendData() as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
  });

  it('sends error and emits ERROR event when rate limit exceeded', async () => {
    mockCheckLimit.mockResolvedValue(false);
    const { user, connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSend(socket, makeValidSendData() as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('Rate limit exceeded') }));
    void user;
  });

  it('sends error when rate limit exceeded without callback (no throw)', async () => {
    mockCheckLimit.mockResolvedValue(false);
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    // No callback — must not throw
    await expect(handler.handleMessageSend(socket, makeValidSendData() as any, undefined)).resolves.toBeUndefined();
  });

  it('sends error when message is too long (no encryptedPayload)', async () => {
    mockValidateMessageLength.mockReturnValue({ isValid: false, error: 'Too long' });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Too long' }));
  });

  it('skips length validation when encryptedPayload is set', async () => {
    mockValidateMessageLength.mockReturnValue({ isValid: false, error: 'Too long' });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData({ encryptedPayload: { ciphertext: 'abc' } });
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = makeMockMessagingService();
    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      messagingService,
    });
    await handler.handleMessageSend(socket, data as any, cb);

    // Should not early-return on length check
    expect(messagingService.handleMessage).toHaveBeenCalled();
  });

  it('sends USER_BLOCKED error when DM is blocked', async () => {
    // conversation.type === 'direct', blockedBetween true
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const prisma = makeMockPrisma({
      conversation: {
        findUnique: jest.fn(async () => ({
          type: 'direct',
          participants: [{ userId: 'user-1' }, { userId: 'other-user' }],
        })),
      },
    });

    cacheGet.mockResolvedValue(null);
    mockIsBlockedBetween.mockResolvedValue(true);

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      prisma,
    });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'USER_BLOCKED' }));
  });

  it('sends error when not a participant (resolveParticipantId returns null)', async () => {
    mockResolveParticipant.mockResolvedValue(null);
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Not a participant in this conversation',
    }));
  });

  it('successful send calls broadcastNewMessage and increments stats', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = makeMockMessagingService();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler, stats } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      messagingService,
      prisma,
    });

    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(messagingService.handleMessage).toHaveBeenCalled();
    expect(mockPerformanceLogger.withTiming).toHaveBeenCalled();
    expect(stats.messages_processed).toBe(1);

    const statsCalls: any = mockConversationMessageStatsOnNewMessage.mock.calls;
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(statsCalls[0][5]).toBe('fr');
  });

  it('skips broadcastNewMessage when isDuplicate is true', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = {
      handleMessage: jest.fn(async () => ({
        success: true,
        data: { id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi', createdAt: new Date(), isDuplicate: true, clientMessageId: VALID_CID, sender: null, translations: [] },
      })),
    };

    const { handler, stats } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      messagingService,
    });

    await handler.handleMessageSend(socket, data as any, cb);

    expect(mockPerformanceLogger.withTiming).not.toHaveBeenCalled();
    expect(stats.messages_processed).toBe(1);
  });

  it('catches exceptions, increments errors counter, and sends error', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = {
      handleMessage: jest.fn(async () => { throw new Error('DB explosion'); }),
    };

    const { handler, stats } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      messagingService,
    });

    await handler.handleMessageSend(socket, data as any, cb);

    expect(stats.errors).toBe(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to send message' }));
  });

  it('sends error when messagingService returns success:false', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = {
      handleMessage: jest.fn(async () => ({ success: false, error: 'Service failure' })),
    };

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Service failure' }));
  });

  it('works without a callback (no crash)', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await expect(handler.handleMessageSend(socket, data as any, undefined)).resolves.toBeUndefined();
  });

  it('works for anonymous users (isAnonymous=true, no DM block check)', async () => {
    const anonUser: SocketUser = {
      id: 'anon-socket-id',
      socketId: 'socket-1',
      isAnonymous: true,
      language: 'fr',
      resolvedLanguages: [],
      participantId: 'anon-participant',
    };
    const connectedUsers = new Map<string, SocketUser>([['anon-socket-id', anonUser]]);
    const socketToUser = new Map([['socket-1', 'anon-socket-id']]);

    mockGetConnectedUser.mockReturnValue({ user: anonUser });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    // Anonymous users skip DM block check
    expect(mockIsBlockedBetween).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('sends _sendResponse with createdAt as ISO string when createdAt is Date', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const isoDate = new Date('2026-06-01T12:00:00Z');
    const messagingService = makeMockMessagingService({ createdAt: isoDate });

    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ createdAt: isoDate.toISOString() }),
    }));
  });

  it('sends _sendResponse with createdAt as-is when already a string', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = makeMockMessagingService({ createdAt: '2026-06-01T12:00:00Z' });

    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdAt: '2026-06-01T12:00:00Z' }),
    }));
  });
});

// ============================================================
// TESTS: handleMessageSendWithAttachments
// ============================================================

describe('MessageHandler.handleMessageSendWithAttachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockValidateMessageLength.mockReturnValue({ isValid: true });
    mockResolveParticipant.mockResolvedValue({ participantId: 'participant-1' });
    mockGetConnectedUser.mockReturnValue(null);
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  function makeAttachmentData(overrides: Record<string, unknown> = {}) {
    return {
      conversationId: 'conv-abc',
      content: 'check this out',
      clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
      ...overrides,
    };
  }

  it('sends error when schema validation fails', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Bad schema' });
    const socket = makeSocket();
    const cb = jest.fn();
    const { handler } = makeHandler();

    await handler.handleMessageSendWithAttachments(socket, makeAttachmentData() as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.anything());
  });

  it('sends error when not authenticated', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeAttachmentData() });
    const socket = makeSocket();
    const cb = jest.fn();
    const { handler } = makeHandler();

    await handler.handleMessageSendWithAttachments(socket, makeAttachmentData() as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
  });

  it('sends error when rate limit exceeded', async () => {
    mockCheckLimit.mockResolvedValue(false);
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeAttachmentData() });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSendWithAttachments(socket, makeAttachmentData() as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.anything());
  });

  it('sends error when content is too long', async () => {
    mockValidateMessageLength.mockReturnValue({ isValid: false, error: 'Too long' });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData({ content: 'x'.repeat(5000) });
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Too long' }));
  });

  it('skips length check when content is empty or whitespace', async () => {
    mockValidateMessageLength.mockReturnValue({ isValid: false, error: 'Empty' });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData({ content: '   ' });
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1' },
    ]);

    const messagingService = makeMockMessagingService();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    // Should not send error for length — may succeed
    expect(mockValidateMessageLength).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('sends USER_BLOCKED error when DM blocked', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const prisma = makeMockPrisma({
      conversation: {
        findUnique: jest.fn(async () => ({
          type: 'direct',
          participants: [{ userId: 'user-1' }, { userId: 'other-user' }],
        })),
      },
    });
    cacheGet.mockResolvedValue(null);
    mockIsBlockedBetween.mockResolvedValue(true);

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'USER_BLOCKED' }));
  });

  it('sends error when not a participant', async () => {
    mockResolveParticipant.mockResolvedValue(null);
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Not a participant in this conversation',
    }));
  });

  it('sends error when attachment uploadedBy mismatches', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'other-user' },
    ]);

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('invalid'),
    }));
  });

  it('sends error when attachment not found (returns null)', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = { getAttachment: jest.fn(async () => null) };

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('successful send calls broadcastNewMessage and increments stats', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'image/jpeg' },
    ]);
    const messagingService = makeMockMessagingService({
      attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }],
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler, stats } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
    });

    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockPerformanceLogger.withTiming).toHaveBeenCalled();
    expect(stats.messages_processed).toBe(1);
  });

  it('catches exception and increments errors counter', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = {
      getAttachment: jest.fn(async () => { throw new Error('Storage failure'); }),
    };

    const { handler, stats } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(stats.errors).toBe(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to send message' }));
  });

  it('handles audio attachment type classification', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'audio/mp3' },
    ]);
    const messagingService = makeMockMessagingService({
      attachments: [{ id: 'att-1', mimeType: 'audio/mp3' }],
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
    });

    await handler.handleMessageSendWithAttachments(socket, data as any, cb);
    const statsCalls: any = mockConversationMessageStatsOnNewMessage.mock.calls;
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(statsCalls[0][4]).toEqual(expect.arrayContaining(['audio']));
  });

  it('forwards the saved message originalLanguage to the stats service (languageDistribution)', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = makeAttachmentData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'image/jpeg' },
    ]);
    const messagingService = makeMockMessagingService({
      attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }],
      originalLanguage: 'de',
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
    });

    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    const statsCalls: any = mockConversationMessageStatsOnNewMessage.mock.calls;
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(statsCalls[0][5]).toBe('de');
  });
});

// ============================================================
// TESTS: broadcastNewMessage
// ============================================================

describe('MessageHandler.broadcastNewMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
    cacheGet.mockResolvedValue(null);
  });

  function makeMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: 'msg-1',
      conversationId: 'conv-abc',
      senderId: 'participant-1',
      content: 'hello',
      createdAt: new Date(),
      originalLanguage: 'fr',
      sender: { id: 'participant-1', userId: 'user-sender', displayName: 'Alice', username: 'alice', avatar: null },
      attachments: [],
      translations: [],
      messageType: 'text',
      replyToId: null,
      storyReplyToId: null,
      forwardedFromId: null,
      forwardedFromConversationId: null,
      isEncrypted: false,
      encryptionMode: null,
      encryptedContent: null,
      encryptionMetadata: null,
      ...overrides,
    } as any;
  }

  it('emits MESSAGE_NEW to room.except(senderRoom) and senderPayload to senderRoom when senderUserId present', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => [{ userId: 'user-sender' }]) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const socket = makeSocket('socket-1');
    const msg = makeMessage();

    await handler.broadcastNewMessage(msg, 'conv-abc', socket);

    expect(io._to).toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith('message:new', expect.any(Object));
  });

  it('emits MESSAGE_NEW via senderSocket.broadcast when senderUserId is null (anonymous)', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const socket = makeSocket('socket-1');
    const msg = makeMessage({ sender: null });

    await handler.broadcastNewMessage(msg, 'conv-abc', socket);

    expect(socket._broadcastEmit).toHaveBeenCalledWith('message:new', expect.any(Object));
    expect(socket.emit).toHaveBeenCalledWith('message:new', expect.any(Object));
  });

  it('emits full room when no senderSocket and no senderUserId (REST path)', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(io._to).toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith('message:new', expect.any(Object));
  });

  it('fetches forwardedFrom message and attaches it to payload', async () => {
    const io = makeMockIo();
    const originalMsg = { id: 'orig-1', content: 'original', sender: null, attachments: [] };
    const prisma = makeMockPrisma({
      message: { findUnique: jest.fn(async (args: any) => {
        if (args.where?.id === 'orig-1') return originalMsg;
        return { translations: [] };
      })},
      participant: { findMany: jest.fn(async () => []) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ forwardedFromId: 'orig-1', sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(prisma.message.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'orig-1' },
    }));
    expect(io._emit).toHaveBeenCalledWith('message:new', expect.objectContaining({
      forwardedFrom: originalMsg,
    }));
  });

  it('fetches forwardedFromConversation when forwardedFromConversationId present', async () => {
    const io = makeMockIo();
    const origConv = { id: 'conv-orig', title: 'Original Conv', identifier: null, type: 'group', avatar: null };
    const prisma = makeMockPrisma({
      message: { findUnique: jest.fn(async () => ({ id: 'orig-1', content: 'x', sender: null, attachments: [] })) },
      conversation: { findUnique: jest.fn(async () => origConv) },
      participant: { findMany: jest.fn(async () => []) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ forwardedFromId: 'orig-1', forwardedFromConversationId: 'conv-orig', sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(io._emit).toHaveBeenCalledWith('message:new', expect.objectContaining({
      forwardedFromConversation: origConv,
    }));
  });

  it('uses postReplyTo from snapshot when storyReplyToId + metadata snapshot present', async () => {
    const snapshot = { id: 'post-1', content: 'story snapshot' };
    mockPostReplyToFromMetadata.mockReturnValue(snapshot);
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ storyReplyToId: 'post-1', metadata: { postReplyTo: snapshot }, sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(io._emit).toHaveBeenCalledWith('message:new', expect.objectContaining({
      postReplyTo: snapshot,
    }));
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to DB lookup when storyReplyToId but no snapshot in metadata', async () => {
    mockPostReplyToFromMetadata.mockReturnValue(null);
    const post = { id: 'post-1', content: 'live post' };
    mockBuildPostReplyTo.mockReturnValue({ snapshot: post });
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      post: { findUnique: jest.fn(async () => post) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ storyReplyToId: 'post-1', sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(prisma.post.findUnique).toHaveBeenCalled();
    expect(io._emit).toHaveBeenCalledWith('message:new', expect.objectContaining({
      postReplyTo: expect.any(Object),
    }));
  });

  it('skips postReplyTo when post not found in DB', async () => {
    mockPostReplyToFromMetadata.mockReturnValue(null);
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      post: { findUnique: jest.fn(async () => null) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ storyReplyToId: 'post-1', sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload).not.toHaveProperty('postReplyTo');
  });

  it('attaches mentionedUsers when content has mentions and resolved users found', async () => {
    const mentionedUsers = [{ id: 'user-2', username: 'bob' }];
    mockResolveMentionedUsers.mockResolvedValue(mentionedUsers);
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ content: 'hey @bob', sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(io._emit).toHaveBeenCalledWith('message:new', expect.objectContaining({
      mentionedUsers,
    }));
  });

  it('does NOT attach mentionedUsers when resolved list is empty', async () => {
    mockResolveMentionedUsers.mockResolvedValue([]);
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload).not.toHaveProperty('mentionedUsers');
  });

  it('emits CONVERSATION_UPDATED to each participant user room', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: {
        findMany: jest.fn(async () => [
          { userId: 'user-a' },
          { userId: 'user-b' },
          { userId: null },
        ]),
      },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const toArgs = io._to.mock.calls.map((c: any[]) => c[0]);
    expect(toArgs).toContain('user:user-a');
    expect(toArgs).toContain('user:user-b');
  });

  it('catches error in CONVERSATION_UPDATED silently', async () => {
    const io = makeMockIo();
    // participant.findMany throws on 2nd call (conversation:updated path)
    let findManyCallCount = 0;
    const findManyFn: any = jest.fn(async () => {
      findManyCallCount++;
      if (findManyCallCount === 2) throw new Error('DB error');
      return [{ userId: 'user-a' }];
    });
    const prisma = makeMockPrisma({
      participant: { findMany: findManyFn },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ sender: null });
    // Should not throw even if conversation:updated fails
    await expect(handler.broadcastNewMessage(msg, 'conv-abc')).resolves.toBeUndefined();
  });

  it('strips clientMessageId from broadcastPayload but keeps it in senderPayload', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ clientMessageId: VALID_CID, sender: null });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const allEmitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    // REST path: only one emit with broadcastPayload, no clientMessageId
    const broadcastPayload = allEmitCalls[0]?.[1] ?? {};
    expect(broadcastPayload).not.toHaveProperty('clientMessageId');
  });

  it('catches and swallows error in broadcastNewMessage top level', async () => {
    mockNormalizeConversationId.mockRejectedValue(new Error('normalize failure'));
    const io = makeMockIo();
    const prisma = makeMockPrisma();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = makeMessage();
    await expect(handler.broadcastNewMessage(msg, 'conv-abc')).resolves.toBeUndefined();
  });

  it('uses language filter when SOCKET_LANG_FILTER=true (senderUserId path)', async () => {
    const originalEnv = process.env.SOCKET_LANG_FILTER;
    process.env.SOCKET_LANG_FILTER = 'true';

    try {
      const rooms = new Map<string, Set<string>>();
      const room = 'conversation:conv-normalized';
      rooms.set(room, new Set(['socket-2', 'socket-3']));

      mockGroupSocketsByLanguage.mockReturnValue([
        { socketIds: ['socket-2'], languages: ['en'] },
      ]);
      mockFilterMessagePayloadForLanguages.mockImplementation((payload) => ({ ...payload as object, filtered: true }));

      const io = makeMockIo(rooms);
      const prisma = makeMockPrisma({
        participant: { findMany: jest.fn(async () => []) },
        message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      });
      const readStatusService = makeMockReadStatusService();
      const connectedUsers = new Map<string, SocketUser>();
      const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

      const msg = makeMessage();
      await handler.broadcastNewMessage(msg, 'conv-abc');

      expect(mockGroupSocketsByLanguage).toHaveBeenCalled();
      expect(mockFilterMessagePayloadForLanguages).toHaveBeenCalled();
    } finally {
      process.env.SOCKET_LANG_FILTER = originalEnv;
    }
  });

  it('uses language filter when SOCKET_LANG_FILTER=true (anonymous senderSocket path)', async () => {
    const originalEnv = process.env.SOCKET_LANG_FILTER;
    process.env.SOCKET_LANG_FILTER = 'true';

    try {
      const rooms = new Map<string, Set<string>>();
      rooms.set('conversation:conv-normalized', new Set(['socket-2']));
      mockGroupSocketsByLanguage.mockReturnValue([]);

      const io = makeMockIo(rooms);
      const prisma = makeMockPrisma({
        participant: { findMany: jest.fn(async () => []) },
        message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      });
      const readStatusService = makeMockReadStatusService();
      const connectedUsers = new Map<string, SocketUser>();
      const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

      const socket = makeSocket('socket-1');
      const msg = makeMessage({ sender: null });
      await handler.broadcastNewMessage(msg, 'conv-abc', socket);

      expect(mockGroupSocketsByLanguage).toHaveBeenCalled();
    } finally {
      process.env.SOCKET_LANG_FILTER = originalEnv;
    }
  });

  it('uses language filter when SOCKET_LANG_FILTER=true (REST path, no sender)', async () => {
    const originalEnv = process.env.SOCKET_LANG_FILTER;
    process.env.SOCKET_LANG_FILTER = 'true';

    try {
      const rooms = new Map<string, Set<string>>();
      rooms.set('conversation:conv-normalized', new Set(['socket-2']));
      mockGroupSocketsByLanguage.mockReturnValue([]);

      const io = makeMockIo(rooms);
      const prisma = makeMockPrisma({
        participant: { findMany: jest.fn(async () => []) },
        message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      });
      const readStatusService = makeMockReadStatusService();
      const connectedUsers = new Map<string, SocketUser>();
      const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

      const msg = makeMessage({ sender: null });
      await handler.broadcastNewMessage(msg, 'conv-abc');

      expect(mockGroupSocketsByLanguage).toHaveBeenCalled();
    } finally {
      process.env.SOCKET_LANG_FILTER = originalEnv;
    }
  });

  it('includes encryptedPayload in broadcast when message is e2ee encrypted', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({
      sender: null,
      isEncrypted: true,
      encryptionMode: 'e2ee',
      encryptedContent: 'cipher123',
      encryptionMetadata: { iv: 'test-iv' },
    });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload).toHaveProperty('encryptedPayload');
    expect(payload.encryptedPayload).toMatchObject({ ciphertext: 'cipher123', iv: 'test-iv' });
  });

  it('does NOT include encryptedPayload for non-e2ee messages', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = makeMessage({ sender: null, isEncrypted: false });
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.encryptedPayload).toBeUndefined();
  });
});

// ============================================================
// TESTS: _emitMessageNewByLanguage (via broadcastNewMessage with SOCKET_LANG_FILTER=true)
// ============================================================

describe('MessageHandler._emitMessageNewByLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  afterEach(() => {
    delete process.env.SOCKET_LANG_FILTER;
  });

  it('returns early when room is empty', async () => {
    process.env.SOCKET_LANG_FILTER = 'true';
    const rooms = new Map<string, Set<string>>();
    rooms.set('conversation:conv-normalized', new Set()); // empty room

    mockGroupSocketsByLanguage.mockReturnValue([]);

    const io = makeMockIo(rooms);
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = { id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi', createdAt: new Date(), sender: null, attachments: [], translations: [] } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(mockGroupSocketsByLanguage).not.toHaveBeenCalled();
  });

  it('does not emit when room has no entry', async () => {
    process.env.SOCKET_LANG_FILTER = 'true';
    const rooms = new Map<string, Set<string>>();
    // No entry for the room — adapter.rooms.get returns undefined

    const io = makeMockIo(rooms);
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = { id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi', createdAt: new Date(), sender: null, attachments: [], translations: [] } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(mockGroupSocketsByLanguage).not.toHaveBeenCalled();
  });

  it('emits per-group filtered payload for each language group', async () => {
    process.env.SOCKET_LANG_FILTER = 'true';

    const rooms = new Map<string, Set<string>>();
    rooms.set('conversation:conv-normalized', new Set(['socket-a', 'socket-b']));

    mockGroupSocketsByLanguage.mockReturnValue([
      { socketIds: ['socket-a'], languages: ['fr'] },
      { socketIds: ['socket-b'], languages: ['en'] },
    ]);
    let callCount = 0;
    mockFilterMessagePayloadForLanguages.mockImplementation((payload, langs) => ({
      ...payload as object,
      _filteredFor: langs,
      _callNum: ++callCount,
    }));

    const io = makeMockIo(rooms);
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = { id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi', createdAt: new Date(), sender: null, attachments: [], translations: [] } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(mockFilterMessagePayloadForLanguages).toHaveBeenCalledTimes(2);
    // 2 emits from lang filter + conversation:updated (but CONVERSATION_UPDATED may not be emitted without userId participants)
    expect(io._emit).toHaveBeenCalledTimes(2);
  });

  it('skips groups with empty socketIds', async () => {
    process.env.SOCKET_LANG_FILTER = 'true';

    const rooms = new Map<string, Set<string>>();
    rooms.set('conversation:conv-normalized', new Set(['socket-a']));

    mockGroupSocketsByLanguage.mockReturnValue([
      { socketIds: [], languages: ['fr'] },
      { socketIds: ['socket-a'], languages: ['en'] },
    ]);

    const io = makeMockIo(rooms);
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = { id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi', createdAt: new Date(), sender: null, attachments: [], translations: [] } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    // Only 1 filterMessagePayloadForLanguages call (for 'en' group with socket-a)
    expect(mockFilterMessagePayloadForLanguages).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// TESTS: _updateUnreadCounts (private, tested via broadcastNewMessage)
// ============================================================

describe('MessageHandler._updateUnreadCounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  it('returns early when senderId is null', async () => {
    const io = makeMockIo();
    const participantFindMany = jest.fn(async () => [{ id: 'p1', userId: 'u1', joinedAt: new Date() }]);
    const prisma = makeMockPrisma({
      participant: { findMany: participantFindMany },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = { id: 'msg-1', conversationId: 'conv-abc', senderId: null, content: 'hi', createdAt: new Date(), sender: null, attachments: [], translations: [] } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    // unread count update participants query should not be called for unread counts (but conversation:updated will still call findMany)
    // The key check: readStatusService.getUnreadCountsForParticipants should not be called with senderId=null
    expect(readStatusService.getUnreadCountsForParticipants).not.toHaveBeenCalled();
  });

  it('emits CONVERSATION_UNREAD_UPDATED per participant', async () => {
    const io = makeMockIo();
    const unreadCounts = new Map([['p2', 3]]);
    const readStatusService = {
      ...makeMockReadStatusService(),
      getUnreadCountsForParticipants: jest.fn(async () => unreadCounts),
    };
    const prisma = makeMockPrisma({
      participant: {
        findMany: jest.fn(async (_args: any) => {
          // conversation:updated + unreadCounts both call findMany
          return [{ id: 'p2', userId: 'u2', joinedAt: new Date() }];
        }),
      },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = { id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi', createdAt: new Date(), sender: null, attachments: [], translations: [] } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const unreadEmits = io._emit.mock.calls.filter((c: any[]) => c[0] === 'conversation:unread-updated');
    expect(unreadEmits.length).toBeGreaterThanOrEqual(1);
    expect(unreadEmits[0][1]).toMatchObject({ conversationId: 'conv-normalized', unreadCount: 3 });
  });

  it('catches error in _updateUnreadCounts silently', async () => {
    const io = makeMockIo();
    const readStatusService = {
      ...makeMockReadStatusService(),
      getUnreadCountsForParticipants: jest.fn(async () => { throw new Error('DB fail'); }),
    };
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => [{ id: 'p2', userId: 'u2', joinedAt: new Date() }]) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = { id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi', createdAt: new Date(), sender: null, attachments: [], translations: [] } as any;
    await expect(handler.broadcastNewMessage(msg, 'conv-abc')).resolves.toBeUndefined();
  });
});

// ============================================================
// TESTS: _parseTranslations (private, tested via _getMessageTranslations)
// ============================================================

describe('MessageHandler._parseTranslations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  function msgWithTranslations(translations: unknown) {
    return {
      id: 'msg-1',
      conversationId: 'conv-abc',
      senderId: 'p1',
      content: 'hi',
      createdAt: new Date(),
      sender: null,
      attachments: [],
      messageType: 'text',
      replyToId: null,
      storyReplyToId: null,
      forwardedFromId: null,
      forwardedFromConversationId: null,
      isEncrypted: false,
      encryptionMode: null,
      encryptedContent: null,
      encryptionMetadata: null,
      translations,
    } as any;
  }

  it('returns [] when translations is undefined (in-memory undefined → DB lookup)', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: undefined })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg: any = msgWithTranslations(undefined);
    delete msg.translations; // ensure property is truly absent
    await handler.broadcastNewMessage(msg, 'conv-abc');

    // The DB lookup returns undefined, _parseTranslations(undefined) = []
    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.translations).toEqual([]);
  });

  it('returns array as-is when translations is already an array', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const trans = [{ targetLanguage: 'en', content: 'hello' }];
    const msg = msgWithTranslations(trans);
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.translations).toEqual(trans);
  });

  it('converts object to [{targetLanguage, ...data}] array', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const transObj = { en: { content: 'hello' }, de: { content: 'hallo' } };
    const msg = msgWithTranslations(transObj);
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.translations).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetLanguage: 'en', content: 'hello' }),
      expect.objectContaining({ targetLanguage: 'de', content: 'hallo' }),
    ]));
    expect(payload.translations).toHaveLength(2);
  });

  it('returns [] when translations is null', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: null })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg: any = msgWithTranslations(undefined);
    delete msg.translations;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.translations).toEqual([]);
  });
});

// ============================================================
// TESTS: _resolveMentionUserIds (private)
// ============================================================

describe('MessageHandler._resolveMentionUserIds (via handleMessageSend notifyAgent path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  it('returns [] when usernames list is empty', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentClient = { sendEvent: jest.fn(async () => {}) };
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      agentClient,
      prisma,
    });

    await handler.handleMessageSend(socket, data as any, jest.fn());

    // With no validatedMentions, _resolveMentionUserIds([]) returns early []
    // agentClient.sendEvent is called with mentionedUserIds = []
    const sendEventCalls: any = (agentClient.sendEvent as any).mock.calls;
    expect(sendEventCalls.length).toBeGreaterThan(0);
    expect(sendEventCalls[0][0]).toMatchObject({ mentionedUserIds: [] });
  });

  it('queries prisma.user.findMany when usernames are present', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentClient = { sendEvent: jest.fn(async () => {}) };
    const userFindMany = jest.fn(async () => [{ id: 'user-bob' }]);
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      user: { findMany: userFindMany, findFirst: jest.fn(async () => null) },
    });

    const messagingService = makeMockMessagingService({ validatedMentions: ['bob'] });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      agentClient,
      prisma,
      messagingService,
    });

    await handler.handleMessageSend(socket, data as any, jest.fn());

    const findManyCalls: any = (userFindMany as any).mock.calls;
    expect(findManyCalls.length).toBeGreaterThan(0);
    expect(findManyCalls[0][0]).toMatchObject({ where: { username: { in: ['bob'] } } });
    const sendEventCalls: any = (agentClient.sendEvent as any).mock.calls;
    expect(sendEventCalls.length).toBeGreaterThan(0);
    expect(sendEventCalls[0][0]).toMatchObject({ mentionedUserIds: ['user-bob'] });
  });

  it('returns [] when prisma query throws', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentClient = { sendEvent: jest.fn(async () => {}) };
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      user: { findMany: jest.fn(async () => { throw new Error('DB'); }), findFirst: jest.fn(async () => null) },
    });

    const messagingService = makeMockMessagingService({ validatedMentions: ['bob'] });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      agentClient,
      prisma,
      messagingService,
    });

    await handler.handleMessageSend(socket, data as any, jest.fn());

    const sendEventCalls: any = (agentClient.sendEvent as any).mock.calls;
    expect(sendEventCalls.length).toBeGreaterThan(0);
    expect(sendEventCalls[0][0]).toMatchObject({ mentionedUserIds: [] });
  });
});

// ============================================================
// TESTS: _notifyAgent (private)
// ============================================================

describe('MessageHandler._notifyAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  it('does NOT call agentClient when agentClient is null', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentClient = null;
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      agentClient,
      prisma,
    });

    // Should not throw
    await expect(handler.handleMessageSend(socket, data as any, jest.fn())).resolves.toBeUndefined();
  });

  it('calls agentClient.sendEvent when agentClient present and message has content', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentSendEvent = jest.fn(async () => {});
    const agentClient = { sendEvent: agentSendEvent };
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      agentClient,
      prisma,
    });

    await handler.handleMessageSend(socket, data as any, jest.fn());

    const calls: any = (agentSendEvent as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toMatchObject({
      type: 'agent:new-message',
      conversationId: expect.any(String),
      messageId: expect.any(String),
    });
  });

  it('does NOT call agentClient when content is null', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentSendEvent = jest.fn(async () => {});
    const agentClient = { sendEvent: agentSendEvent };
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const messagingService = makeMockMessagingService({ content: null, senderId: 'p1' });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      agentClient,
      prisma,
      messagingService,
    });

    await handler.handleMessageSend(socket, data as any, jest.fn());
    expect(agentSendEvent).not.toHaveBeenCalled();
  });
});

// ============================================================
// TESTS: _sendError without callback
// ============================================================

describe('MessageHandler._sendError without callback', () => {
  it('does not throw when no callback provided (validation fail path)', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Schema invalid' });
    const socket = makeSocket();
    const { handler } = makeHandler();

    await expect(handler.handleMessageSend(socket, makeValidSendData() as any, undefined)).resolves.toBeUndefined();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Schema invalid' }));
  });

  it('includes code in _sendError when code is provided (USER_BLOCKED)', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const prisma = makeMockPrisma({
      conversation: {
        findUnique: jest.fn(async () => ({
          type: 'direct',
          participants: [{ userId: 'user-1' }, { userId: 'other' }],
        })),
      },
    });
    cacheGet.mockResolvedValue('1'); // cached as blocked

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'USER_BLOCKED' }));
  });
});

// ============================================================
// TESTS: _resolveParticipantId
// ============================================================

describe('MessageHandler._resolveParticipantId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockValidateMessageLength.mockReturnValue({ isValid: true });
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  it('returns fallbackParticipantId for anonymous users', async () => {
    const anonUser: SocketUser = {
      id: 'anon-socket-1',
      socketId: 'socket-1',
      isAnonymous: true,
      language: 'fr',
      resolvedLanguages: [],
      participantId: 'anon-participant-id',
    };
    const connectedUsers = new Map<string, SocketUser>([['anon-socket-1', anonUser]]);
    const socketToUser = new Map([['socket-1', 'anon-socket-1']]);
    mockGetConnectedUser.mockReturnValue({ user: anonUser });

    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    // Anonymous user resolveParticipant should NOT be called
    expect(mockResolveParticipant).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns null when userId is undefined for registered user (edge case)', async () => {
    const userWithoutId: SocketUser = {
      id: 'socket-1',
      socketId: 'socket-1',
      isAnonymous: false,
      language: 'fr',
      resolvedLanguages: [],
      // No userId
    };
    const connectedUsers = new Map<string, SocketUser>([['x', userWithoutId]]);
    const socketToUser = new Map([['socket-1', 'x']]);
    mockGetConnectedUser.mockReturnValue({ user: userWithoutId });

    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Not a participant in this conversation',
    }));
  });
});

// ============================================================
// TESTS: _serializeAttachmentsField
// ============================================================

describe('MessageHandler._serializeAttachmentsField', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  it('returns [] when attachments field is not an array', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: 'not-array', translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    expect(emitCalls[0]?.[1]?.attachments).toEqual([]);
  });

  it('maps each attachment through serializeAttachmentForSocket', async () => {
    const att1 = { id: 'att-1', mimeType: 'image/jpeg', transcription: null };
    const att2 = { id: 'att-2', mimeType: 'audio/mp3', transcription: 'hello' };
    mockSerializeAttachment.mockImplementation((a: Record<string, unknown>) => ({ ...a, serialized: true }));

    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [att1, att2], translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(mockSerializeAttachment).toHaveBeenCalledTimes(2);
    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    expect(emitCalls[0]?.[1]?.attachments).toEqual([
      { ...att1, serialized: true },
      { ...att2, serialized: true },
    ]);
  });
});

// ============================================================
// TESTS: _getMessageTranslations — DB fallback when in-memory is absent
// ============================================================

describe('MessageHandler._getMessageTranslations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  it('uses in-memory translations when present (short-circuits DB)', async () => {
    const io = makeMockIo();
    const messageFindUnique = jest.fn(async () => ({ translations: [] }));
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: messageFindUnique },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const trans = [{ targetLanguage: 'en', content: 'hello' }];
    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: trans,
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    // DB should NOT be queried for translations (only for participants in unread/conv:updated)
    const translationQueryCalls = messageFindUnique.mock.calls.filter(
      (c: any[]) => c[0]?.select?.translations === true
    );
    expect(translationQueryCalls).toHaveLength(0);
  });

  it('falls back to DB when translations property is absent', async () => {
    const io = makeMockIo();
    const dbTranslations = [{ targetLanguage: 'en', content: 'hello from db' }];
    const messageFindUnique = jest.fn(async () => ({ translations: dbTranslations }));
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: messageFindUnique },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg: any = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [],
    };
    // translations property not set — not undefined, but absent
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const translationQueryCalls = messageFindUnique.mock.calls.filter(
      (c: any[]) => c[0]?.select?.translations === true
    );
    expect(translationQueryCalls.length).toBeGreaterThan(0);
    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    expect(emitCalls[0]?.[1]?.translations).toEqual(dbTranslations);
  });
});

// ============================================================
// TESTS: _buildMessagePayload — sender field construction
// ============================================================

describe('MessageHandler._buildMessagePayload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
  });

  it('builds sender from Participant with nested user fields', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: {
        id: 'p1', userId: 'user-1', displayName: 'Alice', nickname: 'ali',
        avatar: null, type: 'USER',
        user: { username: 'alice', firstName: 'Alice', lastName: 'Smith', avatar: 'url' },
      },
      attachments: [], translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.sender).toMatchObject({
      id: 'p1',
      displayName: 'ali', // nickname takes precedence
      username: 'alice',
      userId: 'user-1',
    });
  });

  it('sender.displayName falls back to displayName when no nickname', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: {
        id: 'p1', userId: 'user-1', displayName: 'Alice', nickname: null,
        avatar: null, type: 'USER', user: undefined,
      },
      attachments: [], translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.sender.displayName).toBe('Alice');
  });

  it('sender is undefined when message.sender is absent', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: undefined, attachments: [], translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.sender).toBeUndefined();
  });
});

// ============================================================
// TESTS: Additional coverage for uncovered branches
// ============================================================

describe('MessageHandler — coverage gap tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
    mockCheckLimit.mockResolvedValue(true);
    mockValidateMessageLength.mockReturnValue({ isValid: true, error: undefined });
    mockResolveParticipant.mockResolvedValue({ participantId: 'participant-1' });
  });

  it('broadcastNewMessage: conversation:updated catch block (line 667)', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: {
        findMany: jest.fn(async () => { throw new Error('participant query failed'); }),
      },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const readStatusService = makeMockReadStatusService();
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any, readStatusService });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: [],
    } as any;
    await expect(handler.broadcastNewMessage(msg, 'conv-abc')).resolves.toBeUndefined();
  });

  it('broadcastNewMessage: auto-deliver .catch handler triggered (line 680)', async () => {
    const io = makeMockIo();
    const connectedUsers = new Map<string, SocketUser>([
      ['u-online', { id: 'u-online', socketId: 's1', isAnonymous: false, language: 'fr', resolvedLanguages: [], userId: 'u-online' }],
    ]);

    const autoDeliverPrisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => [
        { id: 'p-sender', userId: 'u-sender' },
        { id: 'p-online', userId: 'u-online', joinedAt: new Date() }
      ]) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const badReadStatus = {
      ...makeMockReadStatusService(),
      markMessagesAsReceived: jest.fn(async () => { throw new Error('boom'); }),
      getLatestMessageSummary: jest.fn(async () => { throw new Error('boom'); }),
      getUnreadCountsForParticipants: jest.fn(async () => new Map()),
    };
    const privacyService = {
      getPreferencesForUsers: jest.fn(async (users: any[]) =>
        new Map(users.map((u: any) => [u.id, { showReadReceipts: true }]))
      ),
    };

    const { handler } = makeHandler({
      io,
      prisma: autoDeliverPrisma,
      connectedUsers: connectedUsers as any,
      readStatusService: badReadStatus,
      privacyPreferencesService: privacyService as any,
    });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p-sender', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: [],
    } as any;
    await expect(handler.broadcastNewMessage(msg, 'conv-abc')).resolves.toBeUndefined();
  });

  it('handleMessageSend: conversationMessageStats .catch when stats rejects (line 276)', async () => {
    mockConversationMessageStatsOnNewMessage.mockRejectedValue(new Error('stats fail'));
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await expect(handler.handleMessageSend(socket, data as any, cb)).resolves.toBeUndefined();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('handleMessageSendWithAttachments: video attachment type classification (line 463)', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = {
      conversationId: 'conv-abc',
      content: '',
      clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'video/mp4' },
    ]);
    const messagingService = makeMockMessagingService({
      attachments: [{ id: 'att-1', mimeType: 'video/mp4' }],
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
    });

    await handler.handleMessageSendWithAttachments(socket, data as any, cb);
    const statsCalls: any[] = mockConversationMessageStatsOnNewMessage.mock.calls;
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(statsCalls[0][4]).toEqual(expect.arrayContaining(['video']));
  });

  it('handleMessageSendWithAttachments: file attachment type for unknown mimeType (line 464)', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = {
      conversationId: 'conv-abc',
      content: '',
      clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'application/pdf' },
    ]);
    const messagingService = makeMockMessagingService({
      attachments: [{ id: 'att-1', mimeType: 'application/pdf' }],
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
    });

    await handler.handleMessageSendWithAttachments(socket, data as any, cb);
    const statsCalls: any[] = mockConversationMessageStatsOnNewMessage.mock.calls;
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(statsCalls[0][4]).toEqual(expect.arrayContaining(['file']));
  });

  it('broadcastNewMessage: connectedUsers.values() callback exercised via captured updateOnNewMessage arg (line 506)', async () => {
    let capturedCallback: (() => string[]) | null = null;
    mockConversationStatsUpdateOnNewMessage.mockImplementation(async (_prisma: any, _convId: any, _lang: any, cb: any) => {
      capturedCallback = cb;
      return null;
    });

    const user1: SocketUser = { id: 'u1', socketId: 's1', isAnonymous: false, language: 'fr', resolvedLanguages: [], userId: 'u1' };
    const connectedUsers = new Map<string, SocketUser>([['u1', user1]]);

    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    expect(capturedCallback).not.toBeNull();
    if (capturedCallback) {
      const ids = (capturedCallback as () => string[])();
      expect(ids).toContain('u1');
    }
  });

  it('broadcastNewMessage: normalizeConversationId callback (line 493) calls prisma.conversation.findUnique', async () => {
    mockNormalizeConversationId.mockImplementation(async (_id: any, finder: any) => {
      await finder({ id: 'conv-abc' });
      return 'conv-normalized';
    });

    const io = makeMockIo();
    const convFindUnique: any = jest.fn(async () => ({ id: 'conv-abc', identifier: null }));
    const prisma = makeMockPrisma({
      conversation: { findUnique: convFindUnique },
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const callArgs: any[] = convFindUnique.mock.calls;
    expect(callArgs.length).toBeGreaterThan(0);
    expect(callArgs[0][0]).toMatchObject({ where: { id: 'conv-abc' } });
  });

  it('_emitMessageNewByLanguage: debug log block (lines 708-710) with smaller payload', async () => {
    const originalEnv = process.env.SOCKET_LANG_FILTER;
    process.env.SOCKET_LANG_FILTER = 'true';

    try {
      const rooms = new Map<string, Set<string>>();
      rooms.set('conversation:conv-normalized', new Set(['socket-a']));

      mockGroupSocketsByLanguage.mockReturnValue([
        { socketIds: ['socket-a'], languages: ['fr'] },
      ]);
      mockFilterMessagePayloadForLanguages.mockReturnValue({ id: 'msg-1' });

      const io = makeMockIo(rooms);
      const prisma = makeMockPrisma({
        participant: { findMany: jest.fn(async () => []) },
        message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      });
      const connectedUsers = new Map<string, SocketUser>();
      const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

      const msg = {
        id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
        createdAt: new Date(), sender: null, attachments: [],
        translations: [{ targetLanguage: 'en', content: 'hi' }],
      } as any;
      await handler.broadcastNewMessage(msg, 'conv-abc');

      expect(mockFilterMessagePayloadForLanguages).toHaveBeenCalled();
    } finally {
      process.env.SOCKET_LANG_FILTER = originalEnv;
    }
  });

  it('handleMessageSend: data.content undefined → stats called with empty string (line 276 ?? branch)', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const validatedData = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data: validatedData });

    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const rawData = { conversationId: 'conv-abc', clientMessageId: VALID_CID };

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageSend(socket, rawData as any, cb);

    const statsCalls: any[] = mockConversationMessageStatsOnNewMessage.mock.calls;
    expect(statsCalls.length).toBeGreaterThan(0);
    expect(typeof statsCalls[0][3]).toBe('string');
  });

  it('handleMessageSend: _sendResponse with no clientMessageId → stripped from response', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = makeMockMessagingService({ clientMessageId: undefined });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    const cbArg: any = cb.mock.calls[0]?.[0] ?? {};
    expect(cbArg.success).toBe(true);
    expect(cbArg.data?.clientMessageId).toBeUndefined();
  });

  it('handleMessageSend: _sendResponse when response.data is undefined → failure response', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = {
      handleMessage: jest.fn(async () => ({ success: false, error: 'No data', data: undefined })),
    };

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

// ============================================================
// TESTS: Branch coverage boosters
// ============================================================

describe('MessageHandler — branch coverage boosters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockPostReplyToFromMetadata.mockReturnValue(null);
    mockCheckLimit.mockResolvedValue(true);
    mockValidateMessageLength.mockReturnValue({ isValid: true, error: undefined });
    mockResolveParticipant.mockResolvedValue({ participantId: 'participant-1' });
  });

  // Cover line 220: expiresAt branch (truthy case)
  it('handleMessageSend: expiresAt in data → passed as Date to messagingService', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const validatedData = makeValidSendData({ expiresAt: '2026-12-31T00:00:00Z' });
    mockValidateSocketEvent.mockReturnValue({ success: true, data: validatedData });

    const messagingService = makeMockMessagingService();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService, prisma });
    await handler.handleMessageSend(socket, validatedData as any, cb);

    const mhArgs: any[] = (messagingService.handleMessage as any).mock.calls;
    expect(mhArgs.length).toBeGreaterThan(0);
    expect(mhArgs[0][0].expiresAt).toBeInstanceOf(Date);
  });

  // Cover lines 258-264: sender?.displayName ?? sender?.username (when displayName falsy, use username)
  it('handleMessageSend: _notifyAgent sender with null displayName uses username as senderDisplayName', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentSendEvent: any = jest.fn(async () => {});
    const agentClient = { sendEvent: agentSendEvent };

    // Message with sender.displayName = null, sender.user.username = 'alice_user'
    const messagingService = makeMockMessagingService({
      sender: { id: 'p1', userId: 'user-1', displayName: null, username: 'alice_user', avatar: null, user: { username: 'alice_user' } },
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, agentClient, messagingService, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    const calls: any[] = agentSendEvent.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].senderDisplayName).toBe('alice_user');
    expect(calls[0][0].senderUsername).toBe('alice_user');
  });

  // Cover branches 20/21/22 (lines 258-264): sender present, displayName non-null
  it('handleMessageSend: _notifyAgent sender with displayName → used as senderDisplayName', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentSendEvent: any = jest.fn(async () => {});
    const agentClient = { sendEvent: agentSendEvent };

    const messagingService = makeMockMessagingService({
      sender: { id: 'p1', userId: 'user-1', displayName: 'Alice Display', username: 'alice', avatar: null },
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, agentClient, messagingService, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    const calls: any[] = agentSendEvent.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].senderDisplayName).toBe('Alice Display');
  });

  // Cover branch 10 (line 160): validation.error fallback to 'Message invalide'
  it('handleMessageSend: message length error with no error message → fallback to Message invalide', async () => {
    mockValidateMessageLength.mockReturnValue({ isValid: false, error: undefined });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Message invalide',
    }));
  });

  // Cover branches in sendWithAttachments: DM block not blocked (line 348-359 else path)
  it('handleMessageSendWithAttachments: DM not blocked → proceeds normally', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = {
      conversationId: 'conv-abc',
      content: 'hi',
      clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const prisma = makeMockPrisma({
      conversation: {
        findUnique: jest.fn(async () => ({
          type: 'direct',
          participants: [{ userId: 'user-1' }, { userId: 'other-user' }],
        })),
      },
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    cacheGet.mockResolvedValue(null);
    mockIsBlockedBetween.mockResolvedValue(false);

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'image/jpeg' },
    ]);
    const messagingService = makeMockMessagingService();

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      prisma,
      attachmentService,
      messagingService,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // Cover branch 44 (line 430): response.success=false in sendWithAttachments
  it('handleMessageSendWithAttachments: response.success=false → skips broadcast, calls _sendResponse', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = {
      conversationId: 'conv-abc',
      content: 'hi',
      clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'image/jpeg' },
    ]);
    const messagingService = {
      handleMessage: jest.fn(async () => ({ success: false, error: 'Service error' })),
    };

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Service error' }));
    expect(mockPerformanceLogger.withTiming).not.toHaveBeenCalled();
  });

  // Cover branches 46-48 (lines 442-448): _notifyAgent sender info in sendWithAttachments
  it('handleMessageSendWithAttachments: _notifyAgent called with sender info', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = {
      conversationId: 'conv-abc',
      content: 'hi',
      clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const agentSendEvent: any = jest.fn(async () => {});
    const agentClient = { sendEvent: agentSendEvent };

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'image/jpeg' },
    ]);
    const messagingService = makeMockMessagingService({
      attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }],
      sender: { id: 'p1', userId: 'user-1', displayName: 'Alice', username: 'alice', avatar: null },
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
      agentClient,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    const calls: any[] = agentSendEvent.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].senderDisplayName).toBe('Alice');
  });

  // Cover branch 57 (line 475): handleMessageSendWithAttachments → success response data.id
  it('handleMessageSendWithAttachments: _sendResponse echoes createdAt as ISO string', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = {
      conversationId: 'conv-abc',
      content: 'hi',
      clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const isoDate = new Date('2026-06-01T12:00:00Z');
    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'image/jpeg' },
    ]);
    const messagingService = makeMockMessagingService({ createdAt: isoDate });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ createdAt: isoDate.toISOString() }),
    }));
  });

  // Cover branch 6 (line 146): rate limit getRateLimitInfo with participantId fallback
  it('handleMessageSend: rate limit exceeded, user has no userId → uses participantId for rate limit key', async () => {
    mockCheckLimit.mockResolvedValue(false);
    const anonUser: SocketUser = {
      id: 'anon-socket-1',
      socketId: 'socket-1',
      isAnonymous: false,
      language: 'fr',
      resolvedLanguages: [],
      participantId: 'anon-participant',
      // No userId
    };
    const connectedUsers = new Map<string, SocketUser>([['anon-x', anonUser]]);
    const socketToUser = new Map([['socket-1', 'anon-x']]);
    mockGetConnectedUser.mockReturnValue({ user: anonUser });

    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
  });

  // Cover branch 59 (line 513): translations Promise.allSettled failure branch
  it('broadcastNewMessage: stats updateOnNewMessage rejects → still uses translations', async () => {
    mockConversationStatsUpdateOnNewMessage.mockRejectedValue(new Error('stats fail'));
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: [{ targetLanguage: 'fr', content: 'hi' }],
    } as any;
    await expect(handler.broadcastNewMessage(msg, 'conv-abc')).resolves.toBeUndefined();

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    expect(emitCalls.length).toBeGreaterThan(0);
  });

  // Cover branch 62 (line 534): forwardedFromConversationId falsy → no conversation lookup
  it('broadcastNewMessage: forwardedFromId present but no forwardedFromConversationId', async () => {
    const io = makeMockIo();
    const originalMsg = { id: 'orig-1', content: 'original', sender: null, attachments: [] };
    const prisma = makeMockPrisma({
      message: { findUnique: jest.fn(async () => originalMsg) },
      conversation: { findUnique: jest.fn(async () => null) },
      participant: { findMany: jest.fn(async () => []) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: [],
      forwardedFromId: 'orig-1', forwardedFromConversationId: null,
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    // conversation.findUnique should NOT be called (no forwardedFromConversationId)
    const convCalls: any[] = (prisma.conversation.findUnique as any).mock.calls;
    expect(convCalls.length).toBe(0);
  });

  // Cover branch 79 (line 702): originalLanguage fallback to 'fr'
  it('_emitMessageNewByLanguage: uses fr as originalLanguage fallback when not present', async () => {
    const originalEnv = process.env.SOCKET_LANG_FILTER;
    process.env.SOCKET_LANG_FILTER = 'true';

    try {
      const rooms = new Map<string, Set<string>>();
      rooms.set('conversation:conv-normalized', new Set(['socket-a']));
      mockGroupSocketsByLanguage.mockReturnValue([]);

      const io = makeMockIo(rooms);
      const prisma = makeMockPrisma({
        participant: { findMany: jest.fn(async () => []) },
        message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      });
      const connectedUsers = new Map<string, SocketUser>();
      const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

      const msg = {
        id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
        createdAt: new Date(), sender: null, attachments: [], translations: [],
        originalLanguage: null,
      } as any;
      await handler.broadcastNewMessage(msg, 'conv-abc');

      // groupSocketsByLanguage was called with 'fr' as originalLanguage
      expect(mockGroupSocketsByLanguage).toHaveBeenCalled();
      const gslArgs: any[] = mockGroupSocketsByLanguage.mock.calls;
      expect(gslArgs[0][0].originalLanguage).toBe('fr');
    } finally {
      process.env.SOCKET_LANG_FILTER = originalEnv;
    }
  });

  // Cover branch 147 (line 1158): response.error fallback in _sendResponse
  it('_sendResponse: response.error absent → fallback error message', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = {
      handleMessage: jest.fn(async () => ({ success: false, data: undefined, error: undefined })),
    };

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService });
    await handler.handleMessageSend(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Failed to send message',
    }));
  });

  // Cover branch 101 (line 890): _parseTranslations with falsy non-null value (empty string)
  it('broadcastNewMessage: translations as empty string → returns []', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: '',
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    expect(emitCalls[0]?.[1]?.translations).toEqual([]);
  });

  // Cover branch 119 (line 957): sender.avatar || senderUser?.avatar — when sender has avatar
  it('broadcastNewMessage: _buildMessagePayload uses sender.avatar when present', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: {
        id: 'p1', userId: 'user-1', displayName: 'Alice', nickname: null,
        avatar: 'avatar-url', type: 'USER', user: { avatar: 'user-avatar', username: 'alice', firstName: 'A', lastName: 'B' },
      },
      attachments: [], translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.sender?.avatar).toBe('avatar-url');
  });

  // Cover branch: sender.avatar null → falls back to user.avatar
  it('broadcastNewMessage: _buildMessagePayload falls back to senderUser.avatar when sender.avatar null', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: {
        id: 'p1', userId: 'user-1', displayName: 'Alice', nickname: null,
        avatar: null, type: 'USER', user: { avatar: 'user-avatar-url', username: 'alice', firstName: 'A', lastName: 'B' },
      },
      attachments: [], translations: [],
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.sender?.avatar).toBe('user-avatar-url');
  });

  // Cover branch: validateMessageLength error in sendWithAttachments with no error message
  it('handleMessageSendWithAttachments: length error with no error message → fallback to Message invalide', async () => {
    mockValidateMessageLength.mockReturnValue({ isValid: false, error: undefined });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = {
      conversationId: 'conv-abc',
      content: 'x'.repeat(5000),
      clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Message invalide',
    }));
  });

  // Cover branch 128/130 (lines 1052/1054): senderDisplayName/senderUsername when sender is null in _notifyAgent
  it('handleMessageSend: _notifyAgent with no sender object → senderDisplayName undefined', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const agentSendEvent: any = jest.fn(async () => {});
    const agentClient = { sendEvent: agentSendEvent };

    const messagingService = makeMockMessagingService({ sender: null, senderId: 'p1' });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, agentClient, messagingService, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    const calls: any[] = agentSendEvent.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].senderDisplayName).toBeUndefined();
    expect(calls[0][0].senderUsername).toBeUndefined();
  });

  // Cover branch 59 (line 513): translations rejected (prisma throws during _getMessageTranslations DB fallback)
  it('broadcastNewMessage: _getMessageTranslations DB throws → uses [] fallback', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => { throw new Error('DB failed'); }) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    // msg without translations property → triggers DB lookup which will fail
    const msg: any = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [],
    };
    delete msg.translations;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    // Should complete without throwing; payload.translations = []
    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    expect(emitCalls[0]?.[1]?.translations).toEqual([]);
  });

  // Cover branch 101 (line 890): _parseTranslations when data is not an object (primitive)
  it('broadcastNewMessage: translations object with primitive values → spread {} fallback', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    // translations is an object where value is a string (not an object)
    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [],
      translations: { en: 'hello string', fr: null },
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    expect(emitCalls[0]?.[1]?.translations).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetLanguage: 'en' }),
      expect.objectContaining({ targetLanguage: 'fr' }),
    ]));
  });

  // Cover branch 146 (line 1152): createdAt undefined → no createdAt in response
  it('_sendResponse: createdAt undefined → not included in response data', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData();
    mockValidateSocketEvent.mockReturnValue({ success: true, data });

    const messagingService = makeMockMessagingService({ createdAt: undefined });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService, prisma });
    await handler.handleMessageSend(socket, data as any, cb);

    const cbArg: any = cb.mock.calls[0]?.[0] ?? {};
    expect(cbArg.success).toBe(true);
    expect(cbArg.data?.createdAt).toBeUndefined();
  });

  // Cover branch: sendWithAttachments rate limit with userId=undefined (participantId fallback)
  it('handleMessageSendWithAttachments: rate limit exceeded with no userId uses participantId', async () => {
    mockCheckLimit.mockResolvedValue(false);
    const anonUser: SocketUser = {
      id: 'anon-x',
      socketId: 'socket-1',
      isAnonymous: false,
      language: 'fr',
      resolvedLanguages: [],
      participantId: 'p-fallback',
    };
    const connectedUsers = new Map<string, SocketUser>([['anon-x', anonUser]]);
    const socketToUser = new Map([['socket-1', 'anon-x']]);
    mockGetConnectedUser.mockReturnValue({ user: anonUser });

    const data = {
      conversationId: 'conv-abc', content: 'hi', clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');

    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageSendWithAttachments(socket, data as any, undefined);

    // Should complete without throw, rate limit check was called
    expect(mockCheckLimit).toHaveBeenCalled();
  });

  // Cover: sendWithAttachments - anonymous user skips DM block (branch 37 false path)
  it('handleMessageSendWithAttachments: anonymous user skips DM block check', async () => {
    const anonUser: SocketUser = {
      id: 'anon-1',
      socketId: 'socket-1',
      isAnonymous: true,
      language: 'fr',
      resolvedLanguages: [],
      participantId: 'anon-p',
    };
    const connectedUsers = new Map<string, SocketUser>([['anon-1', anonUser]]);
    const socketToUser = new Map([['socket-1', 'anon-1']]);
    mockGetConnectedUser.mockReturnValue({ user: anonUser });

    const data = {
      conversationId: 'conv-abc', content: '', clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'anon-p', mimeType: 'image/jpeg' },
    ]);
    const messagingService = makeMockMessagingService();
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    expect(mockIsBlockedBetween).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // Cover sendWithAttachments _notifyAgent when sender is null (branches 46/47/48)
  it('handleMessageSendWithAttachments: _notifyAgent with null sender → senderDisplayName undefined', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const data = {
      conversationId: 'conv-abc', content: 'hi', clientMessageId: VALID_CID,
      attachmentIds: ['61a41a4b5c5e4f4a5c5e4f4a'],
    };
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const socket = makeSocket('socket-1');
    const cb = jest.fn();

    const agentSendEvent: any = jest.fn(async () => {});
    const agentClient = { sendEvent: agentSendEvent };

    const attachmentService = makeMockAttachmentService([
      { id: '61a41a4b5c5e4f4a5c5e4f4a', uploadedBy: 'user-1', mimeType: 'image/jpeg' },
    ]);
    const messagingService = makeMockMessagingService({
      sender: null,
      senderId: 'p1',
      content: 'hi',
      attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }],
    });
    const prisma = makeMockPrisma({
      participant: { findMany: jest.fn(async () => []) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
    });

    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      attachmentService,
      messagingService,
      prisma,
      agentClient,
    });
    await handler.handleMessageSendWithAttachments(socket, data as any, cb);

    const calls: any[] = agentSendEvent.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].senderDisplayName).toBeUndefined();
  });

  // Cover branch in sendWithAttachments when originalMsg is null (forwardedFromId set but message not found)
  it('broadcastNewMessage: forwardedFromId set but originalMsg not found → no forwardedFrom in payload', async () => {
    const io = makeMockIo();
    const prisma = makeMockPrisma({
      message: { findUnique: jest.fn(async () => null) },
      participant: { findMany: jest.fn(async () => []) },
    });
    const connectedUsers = new Map<string, SocketUser>();
    const { handler } = makeHandler({ io, prisma, connectedUsers: connectedUsers as any });

    const msg = {
      id: 'msg-1', conversationId: 'conv-abc', senderId: 'p1', content: 'hi',
      createdAt: new Date(), sender: null, attachments: [], translations: [],
      forwardedFromId: 'orig-999', forwardedFromConversationId: null,
    } as any;
    await handler.broadcastNewMessage(msg, 'conv-abc');

    const emitCalls = io._emit.mock.calls.filter((c: any[]) => c[0] === 'message:new');
    const payload = emitCalls[0]?.[1] ?? {};
    expect(payload.forwardedFrom).toBeUndefined();
  });
});

// ============================================================
// TESTS: handleMessageEdit
// ============================================================

describe('MessageHandler.handleMessageEdit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
  });

  function makeEditData(overrides: Record<string, unknown> = {}) {
    return {
      messageId: 'aabbccddee1122334455aabb',
      content: 'updated content',
      ...overrides,
    };
  }

  function makeExistingMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: 'aabbccddee1122334455aabb',
      conversationId: 'conv-abc',
      senderId: 'participant-1',
      content: 'original content',
      originalLanguage: 'fr',
      sender: { id: 'participant-1', userId: 'user-1', displayName: 'Alice', avatar: null },
      attachments: [],
      ...overrides,
    };
  }

  it('rejects unauthenticated socket', async () => {
    mockGetConnectedUser.mockReturnValue(null);
    const socket = makeSocket();
    const callback = jest.fn();
    const { handler } = makeHandler();
    await handler.handleMessageEdit(socket, makeEditData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
  });

  it('rejects anonymous users', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup({ isAnonymous: true, userId: undefined });
    const socket = makeSocket();
    const callback = jest.fn();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageEdit(socket, makeEditData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('rejects invalid schema (empty content)', async () => {
    mockValidateSocketEvent.mockReturnValueOnce({
      success: false,
      error: 'content is required',
    });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageEdit(socket, makeEditData({ content: '' }), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns not-found when message does not belong to user', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeEditData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const prisma = makeMockPrisma({
      message: { findFirst: jest.fn(async () => null), updateMany: jest.fn() },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageEdit(socket, makeEditData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('rejects the edit and does not broadcast when the message was deleted between read and write (concurrent delete race)', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeEditData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const existingMessage = makeExistingMessage();
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => existingMessage),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    });
    const io = makeMockIo();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma, io });

    await handler.handleMessageEdit(socket, makeEditData(), callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not found') })
    );
    expect(io._emit).not.toHaveBeenCalled();
  });

  it('edits message, emits MESSAGE_EDITED to room, calls callback with success', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeEditData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const existingMessage = makeExistingMessage();
    const retranslationAsync: any = jest.fn(async () => undefined);
    const mockTranslationService = { retranslateMessageAsync: retranslationAsync };
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => existingMessage),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    });
    const io = makeMockIo();
    const { handler } = makeHandler({
      connectedUsers: connectedUsers as any,
      socketToUser,
      prisma,
      io,
    });
    (handler as any).translationService = mockTranslationService;

    await handler.handleMessageEdit(socket, makeEditData(), callback);

    expect(prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: existingMessage.id, deletedAt: null },
      data: expect.objectContaining({ content: 'updated content', isEdited: true }),
    }));
    expect(io._emit).toHaveBeenCalledWith('message:edited', expect.objectContaining({
      id: existingMessage.id,
      conversationId: existingMessage.conversationId,
    }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(retranslationAsync).toHaveBeenCalledWith(existingMessage.id, expect.objectContaining({ content: 'updated content' }));
  });

  it('preserves attachments in the MESSAGE_EDITED broadcast so editing a caption does not drop the photo/video/audio client-side', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeEditData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const existingAttachment = { id: 'att-1', mimeType: 'image/jpeg', url: 'https://cdn/att-1.jpg' };
    const existingMessage = makeExistingMessage({ attachments: [existingAttachment] });
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => existingMessage),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    });
    const io = makeMockIo();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma, io });
    (handler as any).translationService = { retranslateMessageAsync: jest.fn(async () => undefined) };
    mockSerializeAttachment.mockImplementation((att: any) => att);

    await handler.handleMessageEdit(socket, makeEditData(), callback);

    expect(io._emit).toHaveBeenCalledWith('message:edited', expect.objectContaining({
      attachments: [existingAttachment],
    }));
  });

  it('trims whitespace from content before saving', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeEditData({ content: '  trimmed  ' }) });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => makeExistingMessage()),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    (handler as any).translationService = { retranslateMessageAsync: jest.fn(async () => undefined) };

    await handler.handleMessageEdit(socket, makeEditData({ content: '  trimmed  ' }), callback);

    expect(prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: 'trimmed' }),
    }));
  });

  it('handles DB errors gracefully and returns failure to callback', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeEditData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const prisma = makeMockPrisma({
      message: { findFirst: jest.fn(async () => { throw new Error('DB error'); }) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageEdit(socket, makeEditData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
  });

  it('callback is optional — no throw when omitted', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeEditData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => makeExistingMessage()),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    (handler as any).translationService = { retranslateMessageAsync: jest.fn(async () => undefined) };
    await expect(handler.handleMessageEdit(socket, makeEditData())).resolves.not.toThrow();
  });
});

// ============================================================
// TESTS: handleMessageDelete
// ============================================================

describe('MessageHandler.handleMessageDelete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeDeleteData(overrides: Record<string, unknown> = {}) {
    return {
      messageId: 'aabbccddee1122334455aabb',
      ...overrides,
    };
  }

  function makeMessageForDelete(overrides: Record<string, unknown> = {}) {
    return {
      id: 'aabbccddee1122334455aabb',
      conversationId: 'conv-abc',
      senderId: 'participant-1',
      sender: { id: 'participant-1', userId: 'user-1' },
      conversation: {
        createdAt: new Date('2025-01-01'),
        lastMessageAt: new Date('2026-02-01'),
        participants: [{ role: 'member' }],
      },
      attachments: [],
      ...overrides,
    };
  }

  it('rejects unauthenticated socket', async () => {
    mockGetConnectedUser.mockReturnValue(null);
    const socket = makeSocket();
    const callback = jest.fn();
    const { handler } = makeHandler();
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('rejects anonymous users', async () => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup({ isAnonymous: true, userId: undefined });
    const socket = makeSocket();
    const callback = jest.fn();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('rejects invalid schema (invalid messageId format)', async () => {
    mockValidateSocketEvent.mockReturnValueOnce({ success: false, error: 'invalid messageId' });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser });
    await handler.handleMessageDelete(socket, makeDeleteData({ messageId: 'bad' }), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns not-found when message does not exist', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const prisma = makeMockPrisma({
      message: { findFirst: jest.fn(async () => null), update: jest.fn() },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('denies deletion when user is neither author, conversation admin, nor global admin', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const otherMessage = makeMessageForDelete({
      sender: { id: 'participant-other', userId: 'user-other' },
      conversation: { createdAt: new Date(), participants: [{ role: 'member' }] },
    });
    const prisma = makeMockPrisma({
      message: { findFirst: jest.fn(async () => otherMessage), update: jest.fn() },
      user: { findUnique: jest.fn(async () => ({ role: 'USER' })) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('allows message author to delete their own message', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const message = makeMessageForDelete();
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => message),
        update: jest.fn(async () => ({})),
        findUnique: jest.fn(async () => null),
      },
      conversation: { updateMany: jest.fn(async () => ({ count: 1 })) },
    });
    const io = makeMockIo();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma, io });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);

    expect(prisma.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: message.id },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    }));
    expect(io._emit).toHaveBeenCalledWith('message:deleted', expect.objectContaining({
      messageId: message.id,
      conversationId: message.conversationId,
    }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('allows conversation admin to delete another user message', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const message = makeMessageForDelete({
      sender: { id: 'participant-other', userId: 'user-other' },
      conversation: { createdAt: new Date(), participants: [{ role: 'admin' }] },
    });
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => message),
        update: jest.fn(async () => ({})),
      },
      conversation: { updateMany: jest.fn(async () => ({ count: 1 })) },
    });
    const io = makeMockIo();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma, io });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('allows global BIGBOSS to delete any message', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const message = makeMessageForDelete({
      sender: { id: 'participant-other', userId: 'user-other' },
      conversation: { createdAt: new Date(), participants: [{ role: 'member' }] },
    });
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => message),
        update: jest.fn(async () => ({})),
      },
      user: { findUnique: jest.fn(async () => ({ role: 'BIGBOSS' })) },
      conversation: { updateMany: jest.fn(async () => ({ count: 1 })) },
    });
    const io = makeMockIo();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma, io });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(io._emit).toHaveBeenCalledWith('message:deleted', expect.any(Object));
  });

  it('deletes attachments when message has attachments', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const message = makeMessageForDelete({
      attachments: [{ id: 'att-1' }, { id: 'att-2' }],
    });
    const deleteAttachment: any = jest.fn(async () => undefined);
    const attachmentService = { deleteAttachment };
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => message),
        update: jest.fn(async () => ({})),
      },
      conversation: { updateMany: jest.fn(async () => ({ count: 1 })) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma, attachmentService: attachmentService as any });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);

    expect(deleteAttachment).toHaveBeenCalledWith('att-1');
    expect(deleteAttachment).toHaveBeenCalledWith('att-2');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('recomputes conversation lastMessageAt after deletion, guarded against cursor regression', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const message = makeMessageForDelete();
    const lastMsgDate = new Date('2026-01-15');
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(message)
          .mockResolvedValueOnce({ createdAt: lastMsgDate }),
        update: jest.fn(async () => ({})),
      },
      conversation: { updateMany: jest.fn(async () => ({ count: 1 })) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);

    // Optimistic-concurrency guard: the write only lands while lastMessageAt is
    // still the value read at handler start. A `message:new` committing in the
    // gap advances lastMessageAt, the guard mismatches (updateMany count 0), and
    // the cursor never regresses backward onto the just-deleted message.
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: message.conversationId,
        lastMessageAt: message.conversation.lastMessageAt,
      },
      data: { lastMessageAt: lastMsgDate },
    });
  });

  it('falls back to conversation.createdAt when no message remains, still guarded', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const message = makeMessageForDelete();
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(message)
          .mockResolvedValueOnce(null),
        update: jest.fn(async () => ({})),
      },
      conversation: { updateMany: jest.fn(async () => ({ count: 1 })) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: message.conversationId,
        lastMessageAt: message.conversation.lastMessageAt,
      },
      data: { lastMessageAt: message.conversation.createdAt },
    });
  });

  it('handles DB errors gracefully and returns failure to callback', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const callback = jest.fn();
    const prisma = makeMockPrisma({
      message: { findFirst: jest.fn(async () => { throw new Error('DB error'); }) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await handler.handleMessageDelete(socket, makeDeleteData(), callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
  });

  it('callback is optional — no throw when omitted', async () => {
    mockValidateSocketEvent.mockReturnValue({ success: true, data: makeDeleteData() });
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket();
    const message = makeMessageForDelete();
    const prisma = makeMockPrisma({
      message: {
        findFirst: jest.fn(async () => message),
        update: jest.fn(async () => ({})),
      },
      conversation: { updateMany: jest.fn(async () => ({ count: 1 })) },
    });
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, prisma });
    await expect(handler.handleMessageDelete(socket, makeDeleteData())).resolves.not.toThrow();
  });
});
