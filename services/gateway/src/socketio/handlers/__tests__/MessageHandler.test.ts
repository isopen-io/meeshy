/**
 * @jest-environment node
 *
 * Tests for MessageHandler — covers: handleMessageSend, handleMessageSendWithAttachments,
 * broadcastNewMessage, and private helpers via observable side-effects.
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
const mockGetSocketRateLimiter = jest.fn(() => ({
  checkLimit: (...a: any[]) => mockCheckLimit(...a),
  getRateLimitInfo: (...a: any[]) => mockGetRateLimitInfo(...a),
}));
jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: () => mockGetSocketRateLimiter(),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    MESSAGE_SEND_PER_CONVERSATION: { maxRequests: 10, windowMs: 10000, keyPrefix: 'socket:message:send-conv' },
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

const mockBuildPostReplyTo = jest.fn() as jest.Mock<any>;
const mockPostReplyToFromMetadata = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: (...a: any[]) => mockBuildPostReplyTo(...a),
  postReplyToFromMetadata: (...a: any[]) => mockPostReplyToFromMetadata(...a),
  POST_REPLY_SNAPSHOT_SELECT: { id: true },
}));

const mockSerializeAttachmentForSocket = jest.fn() as jest.Mock<any>;
jest.mock('../../serializeAttachmentForSocket', () => ({
  serializeAttachmentForSocket: (...a: any[]) => mockSerializeAttachmentForSocket(...a),
}));

const mockConversationStatsUpdate = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...a: any[]) => mockConversationStatsUpdate(...a),
  },
}));

const mockConversationMessageStatsOnNew = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    onNewMessage: (...a: any[]) => mockConversationMessageStatsOnNew(...a),
  },
}));

// ── After all mocks, import the class ──────────────────────────────────────

import { MessageHandler, type MessageHandlerDependencies } from '../MessageHandler';

// ── Helpers & factories ────────────────────────────────────────────────────

const VALID_CONV_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VALID_CID = 'cid_11223344-5566-7788-aabb-ccddeeff0011';
const USER_ID = 'user0011223344556677889900';
const PARTICIPANT_ID = 'part0011223344556677889900';

function makeSocket(overrides: Partial<Socket> = {}): jest.Mocked<Socket> {
  return {
    id: 'socket-1',
    emit: jest.fn(),
    broadcast: { to: jest.fn(() => ({ emit: jest.fn() })) },
    ...overrides,
  } as unknown as jest.Mocked<Socket>;
}

function makeIO(overrides: Record<string, unknown> = {}): jest.Mocked<SocketIOServer> {
  const mockToResult = {
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    except: jest.fn().mockReturnThis(),
  };
  const mockTo = jest.fn(() => mockToResult);
  return {
    to: mockTo,
    sockets: {
      adapter: {
        rooms: new Map(),
      },
    },
    ...overrides,
  } as unknown as jest.Mocked<SocketIOServer>;
}

function makePrisma(overrides: Record<string, unknown> = {}): jest.Mocked<PrismaClient> {
  return {
    conversation: {
      findUnique: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
    ...overrides,
  } as unknown as jest.Mocked<PrismaClient>;
}

function makeMessagingService() {
  return { handleMessage: jest.fn() as jest.Mock<any> };
}

function makeTranslationService() {
  return {};
}

function makeStatusService() {
  return { updateLastSeen: jest.fn() as jest.Mock<any> };
}

function makeNotificationService() {
  return { createMessageNotification: jest.fn() as jest.Mock<any> };
}

function makeAttachmentService() {
  return { getAttachment: jest.fn() as jest.Mock<any> };
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

function makeAgentClient() {
  return { sendEvent: jest.fn(() => Promise.resolve()) } as any;
}

function makeDeps(overrides: Record<string, unknown> = {}): MessageHandlerDependencies {
  const io = makeIO();
  const prisma = makePrisma();
  const messagingService = makeMessagingService();
  const statusService = makeStatusService();
  const attachmentService = makeAttachmentService();
  const readStatusService = makeReadStatusService();
  const privacyPreferencesService = makePrivacyService();

  return {
    io,
    prisma,
    messagingService: messagingService as any,
    translationService: makeTranslationService() as any,
    statusService: statusService as any,
    notificationService: makeNotificationService() as any,
    connectedUsers: new Map<string, any>(),
    socketToUser: new Map<string, string>(),
    stats: { messages_processed: 0, errors: 0 },
    agentClient: null,
    attachmentService: attachmentService as any,
    readStatusService: readStatusService as any,
    privacyPreferencesService: privacyPreferencesService as any,
    ...overrides,
  } as MessageHandlerDependencies;
}

function makeValidSendData(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: VALID_CONV_ID,
    content: 'hello',
    clientMessageId: VALID_CID,
    ...overrides,
  };
}

function makeSocketUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    socketId: 'socket-1',
    isAnonymous: false,
    language: 'fr',
    resolvedLanguages: ['fr'],
    userId: USER_ID,
    participantId: PARTICIPANT_ID,
    ...overrides,
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock behavior
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockCheckLimit.mockResolvedValue(true);
    mockValidateMessageLength.mockReturnValue({ isValid: true });
    mockNormalizeConversationId.mockImplementation((id: string) => Promise.resolve(id));
    mockConversationStatsUpdate.mockResolvedValue(undefined);
    mockConversationMessageStatsOnNew.mockReturnValue(Promise.resolve());
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockFilterMessagePayloadForLanguages.mockImplementation((p: unknown) => p);
    mockSerializeAttachmentForSocket.mockImplementation((a: unknown) => a);
    mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockPostReplyToFromMetadata.mockReturnValue(null);
    mockBuildPostReplyTo.mockReturnValue({ id: 'post-1' });

    deps = makeDeps();
    handler = new MessageHandler(deps);
    socket = makeSocket();
    callback = jest.fn();

    // Setup socket user lookup
    deps.socketToUser.set('socket-1', USER_ID);
    const socketUser = makeSocketUser();
    deps.connectedUsers.set(USER_ID, socketUser);
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });
  });

  // ── Constructor ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores all injected dependencies', () => {
      const agentClient = makeAgentClient();
      const h = new MessageHandler({ ...makeDeps(), agentClient });
      expect(h).toBeInstanceOf(MessageHandler);
    });

    it('stores null when agentClient is omitted', () => {
      const h = new MessageHandler(makeDeps());
      expect(h).toBeInstanceOf(MessageHandler);
    });
  });

  // ── handleMessageSend ─────────────────────────────────────────────────────

  describe('handleMessageSend', () => {
    beforeEach(() => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });
      // broadcastNewMessage internals
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
    });

    it('calls callback with error on schema validation failure', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Bad schema' });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('emits SERVER error event on schema validation failure', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Bad schema' });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Bad schema' }));
    });

    it('returns error when user not in socketToUser map', async () => {
      deps.socketToUser.clear();

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns error when getConnectedUser returns null', async () => {
      mockGetConnectedUser.mockReturnValue(null);

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns error and emits when rate limit exceeded', async () => {
      mockCheckLimit.mockResolvedValue(false);
      mockGetRateLimitInfo.mockReturnValue({ resetIn: 15000 });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('15') }));
    });

    it('returns error when message length validation fails', async () => {
      mockValidateMessageLength.mockReturnValue({ isValid: false, error: 'Too long' });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Too long' }));
    });

    it('skips length validation when encryptedPayload present', async () => {
      mockValidateMessageLength.mockReturnValue({ isValid: false, error: 'Too long' });
      mockValidateSocketEvent.mockReturnValue({
        success: true,
        data: makeValidSendData({ content: '' }),
      });

      await handler.handleMessageSend(socket, makeValidSendData({ encryptedPayload: { ciphertext: 'abc' } }), callback);

      // Should not return early from length check — proceeds to resolveParticipantId
      expect(mockResolveParticipant).toHaveBeenCalled();
    });

    it('returns USER_BLOCKED error for blocked DM', async () => {
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
        type: 'direct',
        participants: [{ userId: 'other-user-id' }],
      });
      mockCacheGet.mockResolvedValue(null);
      mockIsBlockedBetween.mockResolvedValue(true);

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'USER_BLOCKED' }));
    });

    it('skips block check for anonymous users', async () => {
      const anonUser = makeSocketUser({ isAnonymous: true, userId: undefined });
      deps.connectedUsers.set(USER_ID, anonUser);

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(deps.prisma.conversation.findUnique).not.toHaveBeenCalled();
    });

    it('returns error when participant not found', async () => {
      mockResolveParticipant.mockResolvedValue(null);

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Not a participant in this conversation' }));
    });

    it('sends callback with messageId on success', async () => {
      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ messageId: 'msg-1' }),
      }));
    });

    it('increments messages_processed on success', async () => {
      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(deps.stats.messages_processed).toBe(1);
    });

    it('does NOT broadcast on duplicate message', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', isDuplicate: true, conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(mockNormalizeConversationId).not.toHaveBeenCalled();
    });

    it('increments errors and calls sendError on exception', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockRejectedValue(new Error('DB error'));

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(deps.stats.errors).toBe(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to send message' }));
    });

    it('works without callback (no crash)', async () => {
      await expect(handler.handleMessageSend(socket, makeValidSendData())).resolves.toBeUndefined();
    });

    it('echoes clientMessageId in success callback', async () => {
      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ clientMessageId: VALID_CID }),
      }));
    });

    it('notifies agent when agentClient available and message has content', async () => {
      const agentClient = makeAgentClient();
      const agentDeps = makeDeps({ agentClient });
      agentDeps.socketToUser.set('socket-1', USER_ID);
      agentDeps.connectedUsers.set(USER_ID, makeSocketUser());
      (agentDeps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, content: 'hello', clientMessageId: VALID_CID },
      });
      (agentDeps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (agentDeps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (agentDeps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      const agentHandler = new MessageHandler(agentDeps);

      await agentHandler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(agentClient.sendEvent).toHaveBeenCalled();
    });
  });

  // ── handleMessageSendWithAttachments ──────────────────────────────────────

  describe('handleMessageSendWithAttachments', () => {
    const validAttachData = () => ({
      conversationId: VALID_CONV_ID,
      content: 'see this',
      attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0'],
      clientMessageId: VALID_CID,
    });

    beforeEach(() => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: validAttachData() });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue({
        id: 'a1b2c3d4e5f6a1b2c3d4e5f0',
        uploadedBy: USER_ID,
      });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-2', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
    });

    it('returns error on schema validation failure', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'Invalid' });

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when user not authenticated', async () => {
      deps.socketToUser.clear();

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns rate limit error when exceeded', async () => {
      mockCheckLimit.mockResolvedValue(false);

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    });

    it('returns error when content too long', async () => {
      const validatedData = { ...validAttachData(), content: 'x'.repeat(10000) };
      mockValidateSocketEvent.mockReturnValue({ success: true, data: validatedData });
      mockValidateMessageLength.mockReturnValue({ isValid: false, error: 'Too long' });

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Too long' }));
    });

    it('skips length check when content empty', async () => {
      const emptyData = { ...validAttachData(), content: '' };
      mockValidateSocketEvent.mockReturnValue({ success: true, data: emptyData });

      await handler.handleMessageSendWithAttachments(socket, emptyData, callback);

      expect(mockValidateMessageLength).not.toHaveBeenCalled();
    });

    it('returns USER_BLOCKED error for blocked DM', async () => {
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
        type: 'direct',
        participants: [{ userId: 'other-user-id' }],
      });
      mockCacheGet.mockResolvedValue(null);
      mockIsBlockedBetween.mockResolvedValue(true);

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'USER_BLOCKED' }));
    });

    it('returns error when participant not found', async () => {
      mockResolveParticipant.mockResolvedValue(null);

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Not a participant in this conversation' }));
    });

    it('returns error when attachment not found', async () => {
      (deps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue(null);

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when attachment belongs to different user', async () => {
      (deps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue({
        id: 'a1b2c3d4e5f6a1b2c3d4e5f0',
        uploadedBy: 'other-user',
      });

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('sends success callback with messageId on success', async () => {
      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ messageId: 'msg-2' }),
      }));
    });

    it('increments messages_processed on success', async () => {
      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(deps.stats.messages_processed).toBe(1);
    });

    it('increments errors and calls sendError on exception', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockRejectedValue(new Error('network'));

      await handler.handleMessageSendWithAttachments(socket, validAttachData(), callback);

      expect(deps.stats.errors).toBe(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to send message' }));
    });

    it('works without callback', async () => {
      await expect(
        handler.handleMessageSendWithAttachments(socket, validAttachData())
      ).resolves.toBeUndefined();
    });
  });

  // ── broadcastNewMessage ────────────────────────────────────────────────────

  describe('broadcastNewMessage', () => {
    function makeMessage(overrides: Record<string, unknown> = {}) {
      return {
        id: 'msg-broadcast-1',
        conversationId: VALID_CONV_ID,
        senderId: PARTICIPANT_ID,
        content: 'broadcast',
        originalLanguage: 'fr',
        messageType: 'text',
        createdAt: new Date(),
        replyToId: null,
        storyReplyToId: null,
        forwardedFromId: null,
        isEncrypted: false,
        sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'Alice', username: 'alice', avatar: null, type: 'user' },
        attachments: [],
        translations: [],
        ...overrides,
      };
    }

    beforeEach(() => {
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue({ translations: [] });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([{ userId: USER_ID }]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      (deps.privacyPreferencesService.shouldShowReadReceipts as jest.Mock<any>).mockResolvedValue(false);
      (deps.privacyPreferencesService.getPreferencesForUsers as jest.Mock<any>).mockResolvedValue(new Map());
    });

    it('broadcasts message:new to conversation room for registered user', async () => {
      const msg = makeMessage();
      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.io.to).toHaveBeenCalled();
    });

    it('emits sender payload to user room with clientMessageId', async () => {
      const msg = makeMessage({ clientMessageId: VALID_CID });
      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      // Should emit to user room for the sender
      expect(deps.io.to).toHaveBeenCalledWith(`user:${USER_ID}`);
    });

    it('uses senderSocket.broadcast.to for anonymous user (no userId)', async () => {
      const msg = makeMessage({ sender: { id: PARTICIPANT_ID, userId: null, displayName: 'Anon', type: 'anonymous' } });
      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(socket.broadcast.to).toHaveBeenCalled();
    });

    it('broadcasts to full room when no sender context (REST path)', async () => {
      const msg = makeMessage({ sender: { id: PARTICIPANT_ID, userId: null } });
      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID);

      expect(deps.io.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
    });

    it('fetches forwardedFrom message and attaches to payload', async () => {
      (deps.prisma.message.findUnique as jest.Mock<any>).mockImplementation(({ where }: any) => {
        if (where.id === 'orig-msg') return Promise.resolve({ id: 'orig-msg', content: 'original', sender: null, attachments: [] });
        return Promise.resolve({ translations: [] });
      });
      const msg = makeMessage({ forwardedFromId: 'orig-msg', translations: null });

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.prisma.message.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'orig-msg' } })
      );
    });

    it('attaches snapshot postReplyTo when storyReplyToId present and snapshot found', async () => {
      mockPostReplyToFromMetadata.mockReturnValue({ id: 'post-snap-1', type: 'story' });
      const msg = makeMessage({ storyReplyToId: 'story-1', metadata: { postReplyTo: { id: 'post-snap-1' } } });

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(mockPostReplyToFromMetadata).toHaveBeenCalled();
      expect(deps.prisma.post.findUnique).not.toHaveBeenCalled();
    });

    it('fetches live post when storyReplyToId present but no snapshot', async () => {
      mockPostReplyToFromMetadata.mockReturnValue(null);
      (deps.prisma.post.findUnique as jest.Mock<any>).mockResolvedValue({ id: 'story-1', type: 'story', content: 'x', moodEmoji: null });
      const msg = makeMessage({ storyReplyToId: 'story-1' });

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.prisma.post.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'story-1' } })
      );
    });

    it('resolves mentions when content present', async () => {
      mockResolveMentionedUsers.mockResolvedValue([{ id: 'user-2', username: 'bob' }]);
      const msg = makeMessage({ content: '@bob hello' });

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(mockResolveMentionedUsers).toHaveBeenCalledWith(deps.prisma, ['@bob hello']);
    });

    it('uses language filter when SOCKET_LANG_FILTER=true', async () => {
      process.env.SOCKET_LANG_FILTER = 'true';
      mockGroupSocketsByLanguage.mockReturnValue([{ socketIds: ['s1'], languages: ['fr'] }]);
      const io = makeIO({
        sockets: { adapter: { rooms: new Map([['conversation:' + VALID_CONV_ID, new Set(['s1'])]]) } }
      });
      deps = makeDeps({ io });
      handler = new MessageHandler(deps);
      deps.socketToUser.set('socket-1', USER_ID);
      deps.connectedUsers.set(USER_ID, makeSocketUser());
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = makeMessage();
      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(mockGroupSocketsByLanguage).toHaveBeenCalled();
      delete process.env.SOCKET_LANG_FILTER;
    });

    it('does not crash on broadcastNewMessage error', async () => {
      mockNormalizeConversationId.mockRejectedValue(new Error('DB down'));

      await expect(handler.broadcastNewMessage(makeMessage() as any, VALID_CONV_ID)).resolves.toBeUndefined();
    });

    it('normalizes non-ObjectId conversationId', async () => {
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      const msg = makeMessage({ conversationId: 'my-channel' });

      await handler.broadcastNewMessage(msg as any, 'my-channel', socket);

      expect(mockNormalizeConversationId).toHaveBeenCalledWith('my-channel', expect.any(Function));
    });
  });

  // ── _isDirectMessageBlocked (via handleMessageSend) ───────────────────────

  describe('_isDirectMessageBlocked', () => {
    beforeEach(() => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
    });

    it('does not block non-DM conversation type', async () => {
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({ type: 'group', participants: [] });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(mockIsBlockedBetween).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('uses cached block status when available', async () => {
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
        type: 'dm',
        participants: [{ userId: 'other-user' }],
      });
      mockCacheGet.mockResolvedValue('0'); // not blocked, from cache

      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(mockIsBlockedBetween).not.toHaveBeenCalled();
    });

    it('caches block result after checking', async () => {
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
        type: 'dm',
        participants: [{ userId: 'other-user' }],
      });
      mockCacheGet.mockResolvedValue(null);
      mockIsBlockedBetween.mockResolvedValue(false);
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(mockCacheSet).toHaveBeenCalledWith(expect.stringContaining('blocks:'), '0', 300);
    });

    it('returns false when conversation not found', async () => {
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns false when no other participants in DM', async () => {
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
        type: 'direct',
        participants: [{ userId: USER_ID }], // only sender
      });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(mockIsBlockedBetween).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ── _resolveParticipantId (via handleMessageSend) ─────────────────────────

  describe('_resolveParticipantId', () => {
    beforeEach(() => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
    });

    it('uses participantId from socket user for anonymous users', async () => {
      const anonUser = makeSocketUser({ isAnonymous: true, userId: undefined, participantId: 'anon-part-1' });
      deps.connectedUsers.set(USER_ID, anonUser);
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: 'anon-part-1', clientMessageId: VALID_CID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      // Anonymous path: resolveParticipant not called
      expect(mockResolveParticipant).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls resolveParticipant for registered users', async () => {
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(mockResolveParticipant).toHaveBeenCalledWith(
        expect.objectContaining({ userIdOrToken: USER_ID, conversationId: VALID_CONV_ID })
      );
    });
  });

  // ── _updateUnreadCounts error swallowing ──────────────────────────────────

  describe('_updateUnreadCounts error handling (via broadcastNewMessage)', () => {
    it('swallows errors from getUnreadCountsForParticipants', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([{ id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date() }]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockRejectedValue(new Error('Redis down'));
      (deps.privacyPreferencesService.getPreferencesForUsers as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-1', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await expect(handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket)).resolves.toBeUndefined();
    });
  });

  // ── _sendResponse behavior ─────────────────────────────────────────────────

  describe('_sendResponse (via handleMessageSend)', () => {
    beforeEach(() => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
    });

    it('handles response.success=false in callback', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: false,
        error: 'Forbidden',
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Forbidden' }));
    });

    it('converts Date createdAt to ISO string in callback', async () => {
      const date = new Date('2025-01-01T12:00:00.000Z');
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: date, senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ createdAt: '2025-01-01T12:00:00.000Z' }),
      }));
    });
  });

  // ── buildAfterWatermarkClause (exported from messages.ts) ─────────────────
  // Note: tested indirectly — this is in messages.ts not MessageHandler.ts

  // ── _parseTranslations (via broadcastNewMessage) ───────────────────────────

  describe('_parseTranslations (via broadcastNewMessage)', () => {
    it('handles translations already in array form', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      const msg = {
        id: 'msg-1', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(),
        sender: { userId: USER_ID },
        attachments: [],
        translations: [{ targetLanguage: 'en', text: 'hi' }],
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.io.to).toHaveBeenCalled();
    });

    it('handles translations in object form (lang → data)', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      const msg = {
        id: 'msg-1', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(),
        sender: { userId: USER_ID },
        attachments: [],
        translations: { en: { text: 'hi' } },
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.io.to).toHaveBeenCalled();
    });

    it('handles null translations (fetches from DB)', async () => {
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue({ translations: [] });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      const msg = {
        id: 'msg-1', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(),
        sender: { userId: USER_ID },
        attachments: [],
        // No translations field → undefined → fetches from DB
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.prisma.message.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'msg-1' }, select: { translations: true } })
      );
    });
  });

  // ── _buildMessagePayload (via broadcastNewMessage) ────────────────────────

  describe('_buildMessagePayload', () => {
    it('builds encrypted payload when isEncrypted + e2ee mode', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      const msg = {
        id: 'msg-e2ee', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: null, originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(),
        isEncrypted: true, encryptionMode: 'e2ee', encryptedContent: 'cipher123',
        encryptionMetadata: { iv: 'abc' },
        sender: { userId: USER_ID },
        attachments: [],
        translations: [],
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.io.to).toHaveBeenCalled();
    });

    it('serializes attachments through serializeAttachmentForSocket', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      const msg = {
        id: 'msg-att', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'with att', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(),
        sender: { userId: USER_ID },
        attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }],
        translations: [],
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(mockSerializeAttachmentForSocket).toHaveBeenCalledWith({ id: 'att-1', mimeType: 'image/jpeg' });
    });
  });

  // ── Attachment type classification in handleMessageSendWithAttachments ────

  describe('handleMessageSendWithAttachments — attachment type stats', () => {
    function setupSuccess(attachments: any[]) {
      const validatedData = {
        conversationId: VALID_CONV_ID,
        content: 'msg',
        attachmentIds: [attachments[0]?.id ?? 'a1b2c3d4e5f6a1b2c3d4e5f0'],
        clientMessageId: VALID_CID,
      };
      mockValidateSocketEvent.mockReturnValue({ success: true, data: validatedData });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue({
        id: 'a1b2c3d4e5f6a1b2c3d4e5f0', uploadedBy: USER_ID,
      });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-att', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, attachments },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
    }

    it('classifies image/jpeg as image type', async () => {
      setupSuccess([{ id: 'att-1', mimeType: 'image/jpeg' }]);
      await handler.handleMessageSendWithAttachments(socket, {
        conversationId: VALID_CONV_ID, content: 'img', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0']
      }, callback);
      expect(mockConversationMessageStatsOnNew).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), ['image'], null
      );
    });

    it('classifies audio/mp3 as audio type', async () => {
      setupSuccess([{ id: 'att-2', mimeType: 'audio/mp3' }]);
      await handler.handleMessageSendWithAttachments(socket, {
        conversationId: VALID_CONV_ID, content: 'audio', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0']
      }, callback);
      expect(mockConversationMessageStatsOnNew).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), ['audio'], null
      );
    });

    it('classifies video/mp4 as video type', async () => {
      setupSuccess([{ id: 'att-3', mimeType: 'video/mp4' }]);
      await handler.handleMessageSendWithAttachments(socket, {
        conversationId: VALID_CONV_ID, content: 'vid', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0']
      }, callback);
      expect(mockConversationMessageStatsOnNew).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), ['video'], null
      );
    });

    it('classifies unknown mime as file type', async () => {
      setupSuccess([{ id: 'att-4', mimeType: 'application/pdf' }]);
      await handler.handleMessageSendWithAttachments(socket, {
        conversationId: VALID_CONV_ID, content: 'doc', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0']
      }, callback);
      expect(mockConversationMessageStatsOnNew).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), ['file'], null
      );
    });
  });

  // ── Stats update fire-and-forget error swallowing ─────────────────────────

  describe('stats update fire-and-forget', () => {
    it('swallows error from conversationMessageStatsService.onNewMessage in handleMessageSend', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-1', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      mockConversationMessageStatsOnNew.mockReturnValue(Promise.reject(new Error('stats error')));

      await expect(handler.handleMessageSend(socket, makeValidSendData(), callback)).resolves.toBeUndefined();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ── broadcastNewMessage — conversation:updated catch ─────────────────────

  describe('broadcastNewMessage — conversation:updated catch', () => {
    it('swallows error from participant.findMany (conversation:updated inner try)', async () => {
      const participantFindMany = deps.prisma.participant.findMany as jest.Mock<any>;
      let callCount = 0;
      participantFindMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('DB down'));
        return Promise.resolve([]);
      });
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-1', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await expect(handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket)).resolves.toBeUndefined();
    });
  });

  // ── _autoDeliverToOnlineRecipients ────────────────────────────────────────

  describe('_autoDeliverToOnlineRecipients (via broadcastNewMessage)', () => {
    function makeOnlineRecipient() {
      const recipientUserId = 'recip-user-0011223344556677889900';
      deps.connectedUsers.set(recipientUserId, makeSocketUser({ id: recipientUserId, userId: recipientUserId }));
      return { id: 'recip-part-1', userId: recipientUserId, isActive: true, joinedAt: new Date() };
    }

    it('marks messages as received for online recipients with read receipts', async () => {
      const recipient = makeOnlineRecipient();
      // participant.findMany is called 3 times:
      // 1) in broadcastNewMessage inner try for conversation:updated
      // 2) in _updateUnreadCounts (awaited)
      // 3) in _autoDeliverToOnlineRecipients (fire-and-forget)
      (deps.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([{ userId: recipient.userId }, { userId: USER_ID }])
        .mockResolvedValueOnce([{ id: recipient.id, userId: recipient.userId, joinedAt: new Date() }])
        .mockResolvedValueOnce([{ id: recipient.id, userId: recipient.userId }]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      (deps.privacyPreferencesService.getPreferencesForUsers as jest.Mock<any>).mockResolvedValue(
        new Map([[recipient.userId, { showReadReceipts: true }]])
      );
      (deps.readStatusService.markMessagesAsReceived as jest.Mock<any>).mockResolvedValue(undefined);
      (deps.readStatusService.getLatestMessageSummary as jest.Mock<any>).mockResolvedValue({ deliveredCount: 1, readCount: 0 });

      const msg = {
        id: 'msg-1', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);
      // _autoDeliverToOnlineRecipients is fire-and-forget — drain the event loop
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(deps.readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
        recipient.id, VALID_CONV_ID, 'msg-1'
      );
      expect(deps.readStatusService.getLatestMessageSummary).toHaveBeenCalled();
    });

    it('does not emit read-status when markMessagesAsReceived all rejected', async () => {
      const recipient = makeOnlineRecipient();
      (deps.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([{ userId: USER_ID }])
        .mockResolvedValueOnce([{ id: recipient.id, userId: recipient.userId, joinedAt: new Date() }])
        .mockResolvedValueOnce([{ id: recipient.id, userId: recipient.userId }]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      (deps.privacyPreferencesService.getPreferencesForUsers as jest.Mock<any>).mockResolvedValue(
        new Map([[recipient.userId, { showReadReceipts: true }]])
      );
      (deps.readStatusService.markMessagesAsReceived as jest.Mock<any>).mockRejectedValue(new Error('DB fail'));

      const msg = {
        id: 'msg-1', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(deps.readStatusService.getLatestMessageSummary).not.toHaveBeenCalled();
    });

    it('skips recipients without showReadReceipts preference', async () => {
      const recipient = makeOnlineRecipient();
      (deps.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([{ userId: USER_ID }])
        .mockResolvedValueOnce([{ id: recipient.id, userId: recipient.userId, joinedAt: new Date() }])
        .mockResolvedValueOnce([{ id: recipient.id, userId: recipient.userId }]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      (deps.privacyPreferencesService.getPreferencesForUsers as jest.Mock<any>).mockResolvedValue(
        new Map([[recipient.userId, { showReadReceipts: false }]])
      );

      const msg = {
        id: 'msg-1', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(deps.readStatusService.markMessagesAsReceived).not.toHaveBeenCalled();
    });

    it('does not auto-deliver when no senderId on message', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-nosender', conversationId: VALID_CONV_ID, senderId: null,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.privacyPreferencesService.getPreferencesForUsers).not.toHaveBeenCalled();
    });
  });

  // ── _resolveMentionUserIds (via _notifyAgent) ─────────────────────────────

  describe('_resolveMentionUserIds (via agentClient + validatedMentions)', () => {
    it('looks up user ids for non-empty mention list', async () => {
      const agentClient = makeAgentClient();
      const agentDeps = makeDeps({ agentClient });
      agentDeps.socketToUser.set('socket-1', USER_ID);
      agentDeps.connectedUsers.set(USER_ID, makeSocketUser());
      (agentDeps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-mention', conversationId: VALID_CONV_ID, createdAt: new Date(),
          senderId: PARTICIPANT_ID, content: '@alice hello', clientMessageId: VALID_CID,
          validatedMentions: ['alice'],
        },
      });
      (agentDeps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (agentDeps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (agentDeps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      (agentDeps.prisma.user.findMany as jest.Mock<any>).mockResolvedValue([{ id: 'alice-id' }]);
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      const agentHandler = new MessageHandler(agentDeps);

      await agentHandler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(agentDeps.prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { username: { in: ['alice'] } } })
      );
    });

    it('returns empty array on DB error in _resolveMentionUserIds', async () => {
      const agentClient = makeAgentClient();
      const agentDeps = makeDeps({ agentClient });
      agentDeps.socketToUser.set('socket-1', USER_ID);
      agentDeps.connectedUsers.set(USER_ID, makeSocketUser());
      (agentDeps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-mention2', conversationId: VALID_CONV_ID, createdAt: new Date(),
          senderId: PARTICIPANT_ID, content: '@bob hey', clientMessageId: VALID_CID,
          validatedMentions: ['bob'],
        },
      });
      (agentDeps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (agentDeps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (agentDeps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      (agentDeps.prisma.user.findMany as jest.Mock<any>).mockRejectedValue(new Error('DB error'));
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      const agentHandler = new MessageHandler(agentDeps);

      // Should not throw — returns empty array on error
      await expect(agentHandler.handleMessageSend(socket, makeValidSendData(), callback)).resolves.toBeUndefined();
      expect(agentClient.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ mentionedUserIds: [] })
      );
    });
  });

  // ── Uncovered callback bodies ──────────────────────────────────────────────

  describe('covered callback bodies (via mock implementations)', () => {
    it('normalizeConversationId callback (prisma.conversation.findUnique) is invoked', async () => {
      // Make the mock invoke the callback to cover line 493
      mockNormalizeConversationId.mockImplementation(async (id: string, findUnique: (w: any) => any) => {
        await findUnique({ identifier: id });
        return id;
      });
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({ id: VALID_CONV_ID, identifier: 'my-channel' });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-norm', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.prisma.conversation.findUnique).toHaveBeenCalled();
    });

    it('conversationStatsService.updateOnNewMessage callback (getUsers) is invoked', async () => {
      // Make the mock invoke the getUsers callback to cover line 506
      mockConversationStatsUpdate.mockImplementation((_p: any, _id: any, _lang: any, getUsers: () => string[]) => {
        getUsers(); // invoke the callback
        return Promise.resolve();
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      deps.connectedUsers.set('user-x', makeSocketUser({ id: 'user-x', userId: 'user-x' }));

      const msg = {
        id: 'msg-stats', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(mockConversationStatsUpdate).toHaveBeenCalled();
    });

    it('groupSocketsByLanguage callbacks (socketToUser/resolveLanguages/userLanguage) are invoked', async () => {
      process.env.SOCKET_LANG_FILTER = 'true';
      // Make the mock invoke the callbacks to cover lines 708-710
      mockGroupSocketsByLanguage.mockImplementation((opts: any) => {
        opts.socketToUser('socket-x');
        opts.resolveLanguages(USER_ID);
        opts.userLanguage(USER_ID);
        return [{ socketIds: ['socket-x'], languages: ['fr'] }];
      });
      const roomSockets = new Set(['socket-x']);
      const io = makeIO({
        sockets: { adapter: { rooms: new Map([['conversation:' + VALID_CONV_ID, roomSockets]]) } }
      });
      const localDeps = makeDeps({ io });
      localDeps.socketToUser.set('socket-1', USER_ID);
      localDeps.socketToUser.set('socket-x', 'other-user');
      localDeps.connectedUsers.set(USER_ID, makeSocketUser());
      (localDeps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (localDeps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      const h = new MessageHandler(localDeps);

      const msg = {
        id: 'msg-lang', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await h.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(mockGroupSocketsByLanguage).toHaveBeenCalled();
      delete process.env.SOCKET_LANG_FILTER;
    });

    it('auto-deliver catch handler fires when _autoDeliverToOnlineRecipients rejects', async () => {
      const recipientUserId2 = 'recip-user-0011223344556677889901';
      deps.connectedUsers.set(recipientUserId2, makeSocketUser({ id: recipientUserId2, userId: recipientUserId2 }));
      const recipient = { id: 'recip-part-x', userId: recipientUserId2 };
      (deps.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([{ userId: USER_ID }]) // conversation:updated
        .mockResolvedValueOnce([{ id: recipient.id, userId: recipient.userId, joinedAt: new Date() }]) // _updateUnreadCounts
        .mockRejectedValueOnce(new Error('auto-deliver DB fail')); // _autoDeliverToOnlineRecipients
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-autofail', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: []
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      // Should not crash — the catch handler swallows the error
      expect(deps.stats.errors).toBe(0);
    });

    it('stats fire-and-forget catch in handleMessageSendWithAttachments', async () => {
      const validAttachData = {
        conversationId: VALID_CONV_ID,
        content: 'doc',
        attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0'],
        clientMessageId: VALID_CID,
      };
      mockValidateSocketEvent.mockReturnValue({ success: true, data: validAttachData });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue({
        id: 'a1b2c3d4e5f6a1b2c3d4e5f0', uploadedBy: USER_ID,
      });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-statsf', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, attachments: [] },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      mockConversationMessageStatsOnNew.mockReturnValue(Promise.reject(new Error('stats fail')));

      await expect(
        handler.handleMessageSendWithAttachments(socket, validAttachData, callback)
      ).resolves.toBeUndefined();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ── Lang filter — anonymous sender + no sender ────────────────────────────

  describe('_emitMessageNewByLanguage — anonymous sender and no sender', () => {
    function setupLangFilter() {
      process.env.SOCKET_LANG_FILTER = 'true';
      mockGroupSocketsByLanguage.mockReturnValue([{ socketIds: ['s1'], languages: ['fr'] }]);
      const io = makeIO({
        sockets: { adapter: { rooms: new Map([['conversation:' + VALID_CONV_ID, new Set(['s1'])]]) } }
      });
      const localDeps = makeDeps({ io });
      localDeps.socketToUser.set('socket-1', USER_ID);
      localDeps.connectedUsers.set(USER_ID, makeSocketUser());
      (localDeps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (localDeps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      return { handler: new MessageHandler(localDeps), io };
    }

    afterEach(() => { delete process.env.SOCKET_LANG_FILTER; });

    it('calls _emitMessageNewByLanguage with excludeSocketId for anonymous sender', async () => {
      const { handler: h } = setupLangFilter();
      const msg = {
        id: 'msg-anon', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'anon msg', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(),
        sender: { id: PARTICIPANT_ID, userId: null, displayName: 'Anon', type: 'anonymous' },
        attachments: [], translations: []
      };

      await h.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(mockGroupSocketsByLanguage).toHaveBeenCalledWith(
        expect.objectContaining({ excludeSocketIds: new Set(['socket-1']) })
      );
    });

    it('calls _emitMessageNewByLanguage with empty opts for no sender context', async () => {
      const { handler: h } = setupLangFilter();
      const msg = {
        id: 'msg-rest', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'rest msg', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(),
        sender: { id: PARTICIPANT_ID, userId: null },
        attachments: [], translations: []
      };

      await h.broadcastNewMessage(msg as any, VALID_CONV_ID); // no senderSocket

      expect(mockGroupSocketsByLanguage).toHaveBeenCalledWith(
        expect.objectContaining({ excludeUserId: undefined, excludeSocketIds: undefined })
      );
    });
  });

  // ── Branch-gap-filling: anonymous user rate limit paths ────────────────────

  describe('rate limit — anonymous user (participantId || fallback paths)', () => {
    it('uses participantId for rate limit check when userId is undefined (handleMessageSend)', async () => {
      const anonUser = makeSocketUser({ isAnonymous: true, userId: undefined, participantId: 'anon-part-ratelimit' });
      deps.connectedUsers.set(USER_ID, anonUser);
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockCheckLimit.mockResolvedValue(false);
      mockGetRateLimitInfo.mockReturnValue({ resetIn: 5000 });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(mockCheckLimit).toHaveBeenCalledWith('anon-part-ratelimit', expect.anything());
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    });

    it('emits rate-limit error to socket with NO callback (handleMessageSend, line 151 false branch)', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockCheckLimit.mockResolvedValue(false);
      mockGetRateLimitInfo.mockReturnValue({ resetIn: 5000 });

      await expect(handler.handleMessageSend(socket, makeValidSendData())).resolves.toBeUndefined();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('5') }));
    });

    it('uses participantId for rate limit when userId undefined in handleMessageSendWithAttachments', async () => {
      const anonUser = makeSocketUser({ isAnonymous: true, userId: undefined, participantId: 'anon-attach-part' });
      deps.connectedUsers.set(USER_ID, anonUser);
      const data = { conversationId: VALID_CONV_ID, content: 'x', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0'] };
      mockValidateSocketEvent.mockReturnValue({ success: true, data });
      mockCheckLimit.mockResolvedValue(false);
      mockGetRateLimitInfo.mockReturnValue({ resetIn: 5000 });

      await handler.handleMessageSendWithAttachments(socket, data as any, callback);

      expect(mockCheckLimit).toHaveBeenCalledWith('anon-attach-part', expect.anything());
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    });

    it('emits rate-limit error to socket with NO callback (handleMessageSendWithAttachments)', async () => {
      const data = { conversationId: VALID_CONV_ID, content: 'x', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0'] };
      mockValidateSocketEvent.mockReturnValue({ success: true, data });
      mockCheckLimit.mockResolvedValue(false);
      mockGetRateLimitInfo.mockReturnValue({ resetIn: 5000 });

      await expect(handler.handleMessageSendWithAttachments(socket, data as any)).resolves.toBeUndefined();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });
  });

  // ── Branch-gap-filling: validation.error fallback ─────────────────────────

  describe('validation.error || "Message invalide" fallback', () => {
    it('uses "Message invalide" when validation.error is empty string (handleMessageSend, line 160)', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockValidateMessageLength.mockReturnValue({ isValid: false, error: '' });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Message invalide' }));
    });

    it('uses "Message invalide" when validation.error is undefined (handleMessageSendWithAttachments, line 343)', async () => {
      const data = { conversationId: VALID_CONV_ID, content: 'long', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0'] };
      mockValidateSocketEvent.mockReturnValue({ success: true, data });
      mockValidateMessageLength.mockReturnValue({ isValid: false, error: undefined });

      await handler.handleMessageSendWithAttachments(socket, data as any, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Message invalide' }));
    });
  });

  // ── Branch-gap-filling: _sendError without callback ───────────────────────

  describe('_sendError — no callback branch (line 1070)', () => {
    it('emits error event to socket even when callback is undefined', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockResolveParticipant.mockResolvedValue(null);

      await expect(handler.handleMessageSend(socket, makeValidSendData())).resolves.toBeUndefined();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Not a participant in this conversation' }));
    });
  });

  // ── Branch-gap-filling: expiresAt truthy branch ───────────────────────────

  describe('expiresAt truthy branch (line 220)', () => {
    it('wraps expiresAt in new Date() when set', async () => {
      const futureIso = new Date(Date.now() + 86400000).toISOString();
      const validatedData = makeValidSendData({ expiresAt: futureIso });
      mockValidateSocketEvent.mockReturnValue({ success: true, data: validatedData });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-exp', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(deps.messagingService.handleMessage).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: expect.any(Date) }),
        PARTICIPANT_ID
      );
    });
  });

  // ── Branch-gap-filling: _notifyAgent sender field branches ────────────────

  describe('_notifyAgent — sender absent or displayName null (lines 258-262)', () => {
    function buildAgentDeps(msgData: Record<string, unknown>) {
      const agentClient = makeAgentClient();
      const d = makeDeps({ agentClient });
      d.socketToUser.set('socket-1', USER_ID);
      d.connectedUsers.set(USER_ID, makeSocketUser());
      (d.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-ag', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID, content: 'hi', ...msgData },
      });
      (d.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (d.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (d.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      return { agentClient, handler: new MessageHandler(d) };
    }

    it('passes undefined senderDisplayName/senderUsername when sender field absent (false branch)', async () => {
      const { agentClient, handler: h } = buildAgentDeps({ sender: undefined });

      await h.handleMessageSend(socket, makeValidSendData(), callback);

      expect(agentClient.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ senderDisplayName: undefined, senderUsername: undefined })
      );
    });

    it('uses username as displayName fallback when displayName is null (?? branch, line 260)', async () => {
      const { agentClient, handler: h } = buildAgentDeps({
        sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: null, username: 'alice_u', user: { username: 'alice_u' } }
      });

      await h.handleMessageSend(socket, makeValidSendData(), callback);

      expect(agentClient.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ senderDisplayName: 'alice_u' })
      );
    });
  });

  // ── Branch-gap-filling: userId undefined in stats call ────────────────────

  describe('stats call userId || participantId (line 275)', () => {
    it('uses participantId in stats onNewMessage when userId is undefined (anonymous)', async () => {
      const anonUser = makeSocketUser({ isAnonymous: true, userId: undefined, participantId: 'anon-stats-0011' });
      deps.connectedUsers.set(USER_ID, anonUser);
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-astat', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: 'anon-stats-0011', clientMessageId: VALID_CID },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(mockConversationMessageStatsOnNew).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 'anon-stats-0011',
        expect.anything(), expect.anything(), null
      );
    });
  });

  // ── Branch-gap-filling: anonymous attachment ownership (line 373) ──────────

  describe('attachment ownership check — anonymous user (line 373 || right side)', () => {
    it('checks attachment against participantId when userId is undefined', async () => {
      const anonUser = makeSocketUser({ isAnonymous: true, userId: undefined, participantId: 'anon-att-owner' });
      deps.connectedUsers.set(USER_ID, anonUser);
      const data = { conversationId: VALID_CONV_ID, content: 'x', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0'] };
      mockValidateSocketEvent.mockReturnValue({ success: true, data });
      (deps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue({
        id: 'a1b2c3d4e5f6a1b2c3d4e5f0', uploadedBy: 'anon-att-owner',
      });
      mockResolveParticipant.mockResolvedValue({ participantId: 'anon-att-owner' });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-aown', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: 'anon-att-owner', attachments: [] },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      await handler.handleMessageSendWithAttachments(socket, data as any, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ── Branch-gap-filling: _getUserContext participantId || id ───────────────

  describe('_getUserContext — socketUser.participantId absent (line 834 || branch)', () => {
    it('falls back to socketUser.id when participantId is absent', async () => {
      const userWithoutPart = makeSocketUser({ participantId: undefined });
      deps.connectedUsers.set(USER_ID, userWithoutPart);
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: { id: 'msg-npart', conversationId: VALID_CONV_ID, createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      // Falls back to socketUser.id (USER_ID) as the participantId
      expect(mockResolveParticipant).toHaveBeenCalledWith(
        expect.objectContaining({ userIdOrToken: USER_ID })
      );
    });
  });

  // ── Branch-gap-filling: _resolveParticipantId — non-anonymous, no userId ──

  describe('_resolveParticipantId — registered user with no userId (line 856)', () => {
    it('returns error when non-anonymous user has no userId', async () => {
      const userNoId = makeSocketUser({ isAnonymous: false, userId: undefined });
      deps.connectedUsers.set(USER_ID, userNoId);
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        success: false, error: 'Not a participant in this conversation'
      }));
    });
  });

  // ── Branch-gap-filling: handleMessageSendWithAttachments sender undefined ──

  describe('handleMessageSendWithAttachments — sender absent (lines 430-446)', () => {
    it('handles response message with no sender field (false branch of sender ternary)', async () => {
      const data = { conversationId: VALID_CONV_ID, content: 'msg', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0'], clientMessageId: VALID_CID };
      mockValidateSocketEvent.mockReturnValue({ success: true, data });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue({ id: 'a1b2c3d4e5f6a1b2c3d4e5f0', uploadedBy: USER_ID });
      const agentClient = makeAgentClient();
      const agentDeps = makeDeps({ agentClient });
      agentDeps.socketToUser.set('socket-1', USER_ID);
      agentDeps.connectedUsers.set(USER_ID, makeSocketUser());
      (agentDeps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-nos', conversationId: VALID_CONV_ID, createdAt: new Date(),
          senderId: PARTICIPANT_ID, content: 'msg', clientMessageId: VALID_CID,
          sender: undefined, // false branch
          attachments: undefined, // also covers msgAttachments ?? [] right side (line 467)
        },
      });
      (agentDeps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (agentDeps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (agentDeps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      (agentDeps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue({ id: 'a1b2c3d4e5f6a1b2c3d4e5f0', uploadedBy: USER_ID });

      const h = new MessageHandler(agentDeps);
      const cb = jest.fn();
      await h.handleMessageSendWithAttachments(makeSocket() as any, data as any, cb);

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(agentClient.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ senderDisplayName: undefined, senderUsername: undefined })
      );
    });
  });

  // ── Branch-gap-filling: attachment mimeType null ─────────────────────────

  describe('attachment mimeType null (?? "" branch, line 460)', () => {
    it('classifies null mimeType as "file" (hits ?? "" fallback)', async () => {
      const data = { conversationId: VALID_CONV_ID, content: 'x', attachmentIds: ['a1b2c3d4e5f6a1b2c3d4e5f0'], clientMessageId: VALID_CID };
      mockValidateSocketEvent.mockReturnValue({ success: true, data });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.attachmentService.getAttachment as jest.Mock<any>).mockResolvedValue({ id: 'a1b2c3d4e5f6a1b2c3d4e5f0', uploadedBy: USER_ID });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-nullmime', conversationId: VALID_CONV_ID, createdAt: new Date(),
          senderId: PARTICIPANT_ID, attachments: [{ id: 'att-null', mimeType: null }],
        },
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      await handler.handleMessageSendWithAttachments(socket, data as any, callback);

      expect(mockConversationMessageStatsOnNew).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), ['file'], null
      );
    });
  });

  // ── Branch-gap-filling: translations rejected → empty array ───────────────

  describe('_getMessageTranslations rejection (line 513 false branch)', () => {
    it('builds payload with empty translations when DB fetch rejects', async () => {
      (deps.prisma.message.findUnique as jest.Mock<any>).mockRejectedValue(new Error('DB fail'));
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-trrj', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [],
        // No translations field → will try DB fetch → DB rejects
      };

      await expect(handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket)).resolves.toBeUndefined();
      expect(deps.io.to).toHaveBeenCalled(); // broadcast still happens
    });
  });

  // ── Branch-gap-filling: forwardedFromConversationId truthy ────────────────

  describe('broadcastNewMessage — forwardedFromConversationId truthy (lines 527-535)', () => {
    it('fetches forwarded conversation when forwardedFromConversationId is set', async () => {
      (deps.prisma.message.findUnique as jest.Mock<any>).mockImplementation(({ where }: any) => {
        if (where?.id === 'orig-fwd') return Promise.resolve({ id: 'orig-fwd', content: 'orig', sender: null, attachments: [] });
        return Promise.resolve({ translations: [] });
      });
      (deps.prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'src-conv-id', title: 'Source Chat', identifier: 'source', type: 'group', avatar: null,
      });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-fwdcv', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'fwd', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: [],
        forwardedFromId: 'orig-fwd',
        forwardedFromConversationId: 'src-conv-id',
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(deps.prisma.conversation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'src-conv-id' } })
      );
    });
  });

  // ── Branch-gap-filling: _emitMessageNewByLanguage empty room (line 700) ───

  describe('_emitMessageNewByLanguage — empty room early return (line 700)', () => {
    it('returns early without calling groupSocketsByLanguage when room is absent', async () => {
      process.env.SOCKET_LANG_FILTER = 'true';
      const io = makeIO({ sockets: { adapter: { rooms: new Map() } } });
      const localDeps = makeDeps({ io });
      localDeps.socketToUser.set('socket-1', USER_ID);
      localDeps.connectedUsers.set(USER_ID, makeSocketUser());
      (localDeps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (localDeps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-empty', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(),
        sender: { id: PARTICIPANT_ID, userId: null }, // null userId → anonymous path → calls _emitMessageNewByLanguage
        attachments: [], translations: [],
      };

      await new MessageHandler(localDeps).broadcastNewMessage(msg as any, VALID_CONV_ID, socket);

      expect(mockGroupSocketsByLanguage).not.toHaveBeenCalled();
      delete process.env.SOCKET_LANG_FILTER;
    });
  });

  // ── Branch-gap-filling: participant.userId null in conversation:updated ────

  describe('broadcastNewMessage — participant.userId null in conversation:updated (line 659)', () => {
    it('skips null-userId participants in conversation:updated emit loop', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([{ userId: null }, { userId: USER_ID }]) // conversation:updated: one null
        .mockResolvedValue([]); // _updateUnreadCounts + _autoDeliver
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-nulluid-cu', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: [],
      };

      await expect(handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket)).resolves.toBeUndefined();
      expect(deps.io.to).toHaveBeenCalledWith(`user:${USER_ID}`);
    });
  });

  // ── Branch-gap-filling: participant.userId null in _autoDeliverToOnlineRecipients (line 807)

  describe('_autoDeliverToOnlineRecipients — null userId in participants loop (lines 807-809)', () => {
    it('skips null-userId participants when emitting read-status:updated rooms', async () => {
      const recipientUid = 'recip-uid-autodel-null0011223344';
      deps.connectedUsers.set(recipientUid, makeSocketUser({ id: recipientUid, userId: recipientUid }));
      (deps.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([{ userId: USER_ID }]) // conversation:updated
        .mockResolvedValueOnce([{ id: 'part-rc', userId: recipientUid, joinedAt: new Date() }]) // _updateUnreadCounts
        .mockResolvedValueOnce([
          { id: 'part-null-ad', userId: null },
          { id: 'part-real', userId: recipientUid },
        ]); // _autoDeliverToOnlineRecipients
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      (deps.privacyPreferencesService.getPreferencesForUsers as jest.Mock<any>).mockResolvedValue(
        new Map([[recipientUid, { showReadReceipts: true }]])
      );
      (deps.readStatusService.markMessagesAsReceived as jest.Mock<any>).mockResolvedValue(undefined);
      (deps.readStatusService.getLatestMessageSummary as jest.Mock<any>).mockResolvedValue({ deliveredCount: 1, readCount: 0 });

      const msg = {
        id: 'msg-ad-nulluid', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: [],
      };

      await handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket);
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(deps.readStatusService.markMessagesAsReceived).toHaveBeenCalledTimes(1);
      expect(deps.readStatusService.getLatestMessageSummary).toHaveBeenCalled();
    });
  });

  // ── Branch-gap-filling: _parseTranslations with null data value ───────────

  describe('_parseTranslations — null data entry (line 890 false branch)', () => {
    it('spreads empty object when translation value is null', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-nulltrans', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [],
        translations: { en: null, fr: { text: 'salut' } }, // null value hits false branch of data !== null
      };

      await expect(handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket)).resolves.toBeUndefined();
    });
  });

  // ── Branch-gap-filling: encryptedPayload inner false branch (line 957) ────

  describe('_buildMessagePayload — encryptedPayload inner ternary (line 957)', () => {
    it('spreads empty object when encryptionMetadata is null (inner ?? false branch)', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      const msg = {
        id: 'msg-nullmeta', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: null, originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: [],
        isEncrypted: true, encryptionMode: 'e2ee', encryptedContent: 'cipherxyz',
        encryptionMetadata: null, // null → hits false branch of inner ternary
      };

      await expect(handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket)).resolves.toBeUndefined();
      expect(deps.io.to).toHaveBeenCalled();
    });
  });

  // ── Branch-gap-filling: _updateUnreadCounts participant.userId null ────────

  describe('_updateUnreadCounts — participant.userId null (line 1005 ?? branch)', () => {
    it('uses participant.id as ROOMS.user target when userId is null', async () => {
      const partId = 'anon-part-unread-xx1';
      (deps.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([{ id: partId, userId: null, joinedAt: new Date() }]) // sharedParticipants (single query for CONVERSATION_UPDATED + _updateUnreadCounts)
        .mockResolvedValue([]); // _autoDeliver
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(
        new Map([[partId, 2]])
      );

      const msg = {
        id: 'msg-nulluid-unread', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: [],
      };

      await expect(handler.broadcastNewMessage(msg as any, VALID_CONV_ID, socket)).resolves.toBeUndefined();
      expect(deps.io.to).toHaveBeenCalledWith(`user:${partId}`);
    });
  });

  // ── Offline delivery queue — WS message:send path parity with REST ─────────

  describe('broadcastNewMessage — offline delivery queue enqueue', () => {
    const offlineUserId = 'user-offline-0011223344556677';
    const offlinePartId = 'part-offline-0011223344556677';
    const onlineUserId = 'user-online-0011223344556677';
    const onlinePartId = 'part-online-0011223344556677';

    function makeMsg(overrides: Record<string, unknown> = {}) {
      return {
        id: 'msg-dq', conversationId: VALID_CONV_ID, senderId: PARTICIPANT_ID,
        content: 'hi', originalLanguage: 'fr', messageType: 'text',
        createdAt: new Date(), sender: { userId: USER_ID }, attachments: [], translations: [],
        ...overrides,
      };
    }

    it('enqueues the message for a participant who is not connected', async () => {
      const enqueue = jest.fn().mockResolvedValue(undefined);
      const d = makeDeps({ deliveryQueue: { enqueue } as any });
      d.socketToUser.set('socket-1', USER_ID);
      d.connectedUsers.set(USER_ID, makeSocketUser());
      d.connectedUsers.set(onlineUserId, makeSocketUser({ id: onlineUserId, userId: onlineUserId }));
      const h = new MessageHandler(d);

      (d.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([
          { id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date() },
          { id: onlinePartId, userId: onlineUserId, joinedAt: new Date() },
          { id: offlinePartId, userId: offlineUserId, joinedAt: new Date() },
        ]) // sharedParticipants (CONVERSATION_UPDATED + _updateUnreadCounts)
        .mockResolvedValue([]); // _autoDeliverToOnlineRecipients
      (d.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      await h.broadcastNewMessage(makeMsg() as any, VALID_CONV_ID, socket);

      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(enqueue).toHaveBeenCalledWith(offlineUserId, expect.objectContaining({
        messageId: 'msg-dq',
        conversationId: VALID_CONV_ID,
        payload: expect.objectContaining({ id: 'msg-dq' }),
        enqueuedAt: expect.any(String),
      }));
    });

    it('does not enqueue for the sender or for already-connected recipients', async () => {
      const enqueue = jest.fn().mockResolvedValue(undefined);
      const d = makeDeps({ deliveryQueue: { enqueue } as any });
      d.socketToUser.set('socket-1', USER_ID);
      d.connectedUsers.set(USER_ID, makeSocketUser());
      d.connectedUsers.set(onlineUserId, makeSocketUser({ id: onlineUserId, userId: onlineUserId }));
      const h = new MessageHandler(d);

      (d.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([
          { id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date() },
          { id: onlinePartId, userId: onlineUserId, joinedAt: new Date() },
        ])
        .mockResolvedValue([]);
      (d.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      await h.broadcastNewMessage(makeMsg() as any, VALID_CONV_ID, socket);

      expect(enqueue).not.toHaveBeenCalled();
    });

    it('does nothing when no delivery queue is configured', async () => {
      (deps.prisma.participant.findMany as jest.Mock<any>)
        .mockResolvedValueOnce([
          { id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date() },
          { id: offlinePartId, userId: offlineUserId, joinedAt: new Date() },
        ])
        .mockResolvedValue([]);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());

      await expect(handler.broadcastNewMessage(makeMsg() as any, VALID_CONV_ID, socket)).resolves.toBeUndefined();
    });
  });

  // ── Branch-gap-filling: _notifyAgent replyToId null (?? undefined) ─────────

  describe('_notifyAgent — replyToId null ?? undefined (line 1054)', () => {
    it('converts replyToId: null to undefined in agent event', async () => {
      const agentClient = makeAgentClient();
      const d = makeDeps({ agentClient });
      d.socketToUser.set('socket-1', USER_ID);
      d.connectedUsers.set(USER_ID, makeSocketUser());
      (d.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-noreply', conversationId: VALID_CONV_ID, createdAt: new Date(),
          senderId: PARTICIPANT_ID, content: 'hi', clientMessageId: VALID_CID,
          replyToId: null,
        },
      });
      (d.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (d.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (d.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      const h = new MessageHandler(d);

      await h.handleMessageSend(socket, makeValidSendData(), callback);

      expect(agentClient.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ replyToId: undefined })
      );
    });
  });

  // ── Branch-gap-filling: _sendResponse edge cases (lines 1144, 1152-1158) ──

  describe('_sendResponse — branch gaps', () => {
    beforeEach(() => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: makeValidSendData() });
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID });
      (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
      (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue(null);
      (deps.readStatusService.getUnreadCountsForParticipants as jest.Mock<any>).mockResolvedValue(new Map());
    });

    it('passes createdAt string directly when not a Date instance (line 1144 false branch)', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-strdate', conversationId: VALID_CONV_ID,
          createdAt: '2025-06-01T10:00:00.000Z',
          senderId: PARTICIPANT_ID, clientMessageId: VALID_CID,
        },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ createdAt: '2025-06-01T10:00:00.000Z' }),
      }));
    });

    it('omits clientMessageId from ACK when absent from response data (line 1152 false branch)', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-nocid', conversationId: VALID_CONV_ID,
          createdAt: new Date(), senderId: PARTICIPANT_ID,
          // no clientMessageId
        },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      const arg = (callback.mock.calls[0] as [any])[0];
      expect(arg.success).toBe(true);
      expect(arg.data).not.toHaveProperty('clientMessageId');
    });

    it('omits createdAt from ACK when null in response (line 1154 falsy branch)', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-nodate', conversationId: VALID_CONV_ID,
          createdAt: null, senderId: PARTICIPANT_ID, clientMessageId: VALID_CID,
        },
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      const arg = (callback.mock.calls[0] as [any])[0];
      expect(arg.success).toBe(true);
      expect(arg.data).not.toHaveProperty('createdAt');
    });

    it('uses "Failed to send message" fallback when response.error is absent (line 1158)', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: false,
        // no error field
      });

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Failed to send message' })
      );
    });

    it('does not propagate when ACK callback throws — socket connection preserved', async () => {
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({
        success: true,
        data: {
          id: 'msg-throwing-cb', conversationId: VALID_CONV_ID,
          createdAt: new Date(), senderId: PARTICIPANT_ID, clientMessageId: VALID_CID,
        },
      });

      const throwingCallback = jest.fn<any>().mockImplementation(() => {
        throw new Error('client-side callback error');
      });

      // Must resolve without throwing even though the callback throws
      await expect(
        handler.handleMessageSend(socket, makeValidSendData(), throwingCallback)
      ).resolves.toBeUndefined();

      expect(throwingCallback).toHaveBeenCalledTimes(1);
    });
  });

  // ── Per-conversation rate limiting ────────────────────────────────────────

  describe('per-conversation rate limit', () => {
    beforeEach(() => {
      mockValidateSocketEvent.mockImplementation((_schema: unknown, data: unknown) => ({
        success: true,
        data: { ...(data as object), clientMessageId: VALID_CID },
      }));
      mockValidateMessageLength.mockReturnValue({ isValid: true });
      mockIsBlockedBetween.mockResolvedValue(false);
      mockResolveParticipant.mockResolvedValue({
        participantId: PARTICIPANT_ID,
        userId: USER_ID,
        isAnonymous: false,
        displayName: 'Test',
      });
    });

    it('blocks handleMessageSend when per-conversation limit exceeded', async () => {
      // Global limit passes, per-conversation limit fails
      mockCheckLimit
        .mockResolvedValueOnce(true)   // global MESSAGE_SEND
        .mockResolvedValueOnce(false); // per-conversation MESSAGE_SEND_PER_CONVERSATION

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Rate limit exceeded' })
      );
      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.stringContaining('conversation') })
      );
    });

    it('blocks handleMessageSendWithAttachments when per-conversation limit exceeded', async () => {
      mockCheckLimit
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await handler.handleMessageSendWithAttachments(socket, makeValidSendData(), callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Rate limit exceeded' })
      );
    });

    it('uses composite userId:conversationId key for per-conversation check', async () => {
      mockCheckLimit.mockResolvedValue(true);
      mockResolveParticipant.mockResolvedValue({ participantId: PARTICIPANT_ID, userId: USER_ID, isAnonymous: false, displayName: 'T' });
      (deps.messagingService.handleMessage as jest.Mock<any>).mockResolvedValue({ success: true, data: { id: 'msg-1', conversationId: VALID_CONV_ID } });
      mockGroupSocketsByLanguage.mockReturnValue(new Map());

      await handler.handleMessageSend(socket, makeValidSendData(), callback);

      const calls = (mockCheckLimit as jest.Mock<any>).mock.calls;
      const convCall = calls.find((c: any[]) => {
        const key: string = c[0];
        return key.includes(VALID_CONV_ID);
      });
      expect(convCall).toBeDefined();
    });
  });

  // ── Participant ID cache ──────────────────────────────────────────────────

  describe('invalidateParticipantCache', () => {
    it('removes specific conversation entry', () => {
      // Prime the cache via a successful send
      (handler as any).participantIdCache.set(`${USER_ID}:${VALID_CONV_ID}`, PARTICIPANT_ID);

      handler.invalidateParticipantCache(USER_ID, VALID_CONV_ID);

      expect((handler as any).participantIdCache.has(`${USER_ID}:${VALID_CONV_ID}`)).toBe(false);
    });

    it('removes all entries for user when conversationId omitted', () => {
      const conv2 = 'b2c3d4e5f6a1b2c3d4e5f6a1';
      (handler as any).participantIdCache.set(`${USER_ID}:${VALID_CONV_ID}`, PARTICIPANT_ID);
      (handler as any).participantIdCache.set(`${USER_ID}:${conv2}`, PARTICIPANT_ID);

      handler.invalidateParticipantCache(USER_ID);

      expect((handler as any).participantIdCache.size).toBe(0);
    });

    it('leaves other users unaffected', () => {
      const OTHER_USER = 'other0011223344556677889900';
      (handler as any).participantIdCache.set(`${USER_ID}:${VALID_CONV_ID}`, PARTICIPANT_ID);
      (handler as any).participantIdCache.set(`${OTHER_USER}:${VALID_CONV_ID}`, 'other-participant');

      handler.invalidateParticipantCache(USER_ID);

      expect((handler as any).participantIdCache.has(`${OTHER_USER}:${VALID_CONV_ID}`)).toBe(true);
    });

    it('never grows past its size bound, even for callers that never leave a conversation', () => {
      const cache = (handler as any).participantIdCache;
      for (let i = 0; i < 10_050; i++) {
        cache.set(`user-${i}:${VALID_CONV_ID}`, `participant-${i}`);
      }

      expect(cache.size).toBeLessThanOrEqual(10_000);
    });
  });
});
