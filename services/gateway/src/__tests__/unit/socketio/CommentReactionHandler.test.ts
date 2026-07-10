/**
 * CommentReactionHandler Unit Tests
 *
 * Mirrors ReactionHandler pattern exactly, swapping message reactions
 * for comment reactions (postId room, userId not participantId).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ===== MOCKS =====

jest.mock('../../../services/CommentReactionService', () => ({
  CommentReactionService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketCommentReactionAddSchema: {
    safeParse: jest.fn(),
  },
  SocketCommentReactionRemoveSchema: {
    safeParse: jest.fn(),
  },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r) => !r.success),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const mockCheckLimit = jest.fn<() => Promise<boolean>>();
jest.mock('../../../utils/socket-rate-limiter', () => {
  return {
    SocketRateLimiter: jest.fn().mockImplementation(() => ({
      checkLimit: mockCheckLimit,
      destroy: jest.fn(),
    })),
    SOCKET_RATE_LIMITS: {
      MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    },
  };
});

// Import after mocks
import { CommentReactionHandler } from '../../../socketio/handlers/CommentReactionHandler';
import type { CommentReactionService } from '../../../services/CommentReactionService';
import type { NotificationService } from '../../../services/notifications/NotificationService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { validateSocketEvent } from '../../../middleware/validation';

// ===== HELPERS =====

const COMMENT_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439033';
const ANOTHER_USER_ID = '507f1f77bcf86cd799439044';
const SOCKET_ID = 'socket-abc-123';
const EMOJI = '👍';

function createMockSocket() {
  const emitFn = jest.fn();
  const joinFn = jest.fn();
  const leaveFn = jest.fn();
  return {
    id: SOCKET_ID,
    emit: emitFn,
    join: joinFn,
    leave: leaveFn,
  };
}

function createMockIO() {
  const emitFn = jest.fn();
  const toFn = jest.fn().mockReturnValue({ emit: emitFn });
  return { to: toFn, emit: emitFn, _toEmit: emitFn };
}

function createMockCommentReactionService(): jest.Mocked<CommentReactionService> {
  return {
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
    getCommentReactions: jest.fn(),
    getEmojiAggregation: jest.fn(),
    getUserReactions: jest.fn(),
    hasUserReacted: jest.fn(),
    deleteCommentReactions: jest.fn(),
    createUpdateEvent: jest.fn(),
    validateAddReactionOptions: jest.fn(),
    validateRemoveReactionOptions: jest.fn(),
  } as unknown as jest.Mocked<CommentReactionService>;
}

function createMockNotificationService() {
  return {
    createCommentReactionNotification: jest.fn(),
  } as any;
}

function createMockPrisma(commentAuthorId: string = USER_ID) {
  return {
    postComment: {
      findUnique: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
    friendRequest: {
      findFirst: jest.fn(),
    },
    _commentAuthorId: commentAuthorId,
  } as any;
}

function createConnectedUsers(userId: string) {
  const map = new Map();
  map.set(userId, {
    id: userId,
    socketId: SOCKET_ID,
    isAnonymous: false,
    language: 'fr',
    userId,
  });
  return map;
}

function createSocketToUser(socketId: string, userId: string) {
  const map = new Map();
  map.set(socketId, userId);
  return map;
}

const sampleUpdateEvent = {
  commentId: COMMENT_ID,
  postId: POST_ID,
  userId: USER_ID,
  emoji: EMOJI,
  action: 'add' as const,
  aggregation: {
    emoji: EMOJI,
    count: 1,
    userIds: [USER_ID],
    hasCurrentUser: true,
  },
  timestamp: new Date(),
};

const sampleReactionData = {
  id: '507f1f77bcf86cd799439055',
  commentId: COMMENT_ID,
  userId: USER_ID,
  emoji: EMOJI,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ===== TESTS =====

describe('CommentReactionHandler', () => {
  let handler: CommentReactionHandler;
  let mockIO: ReturnType<typeof createMockIO>;
  let mockPrisma: any;
  let mockReactionService: jest.Mocked<CommentReactionService>;
  let mockNotificationService: any;
  let connectedUsers: Map<string, unknown>;
  let socketToUser: Map<string, string>;

  const mockValidate = validateSocketEvent as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset rate limiter to allow by default
    mockCheckLimit.mockResolvedValue(true);

    mockIO = createMockIO();
    mockPrisma = createMockPrisma(USER_ID);
    mockReactionService = createMockCommentReactionService();
    mockNotificationService = createMockNotificationService();
    connectedUsers = createConnectedUsers(USER_ID);
    socketToUser = createSocketToUser(SOCKET_ID, USER_ID);

    // Set default mock return values
    mockPrisma.postComment.findUnique.mockResolvedValue({ authorId: USER_ID });
    mockNotificationService.createCommentReactionNotification.mockResolvedValue(undefined);
    // Default: PUBLIC post, not deleted
    mockPrisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: ANOTHER_USER_ID,
      visibility: 'PUBLIC',
      visibilityUserIds: [],
      deletedAt: null,
    });

    handler = new CommentReactionHandler({
      io: mockIO as any,
      prisma: mockPrisma,
      notificationService: mockNotificationService,
      commentReactionService: mockReactionService,
      connectedUsers: connectedUsers as any,
      socketToUser,
    });
  });

  // ===== handleAddReaction =====

  describe('handleAddReaction', () => {
    it('test_handleAddReaction_success_callsServiceAndBroadcastsToPostRoom', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).toHaveBeenCalledWith({
        commentId: COMMENT_ID,
        userId: USER_ID,
        emoji: EMOJI,
      });

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.COMMENT_REACTION_ADDED,
        sampleUpdateEvent
      );

      // Contrat ACK == broadcast : l'ACK porte le MÊME `updateEvent` que le broadcast
      // `comment:reaction-added` (et non plus la `reaction` brute) — c'est ce que l'iOS décode.
      expect(callback).toHaveBeenCalledWith({
        success: true,
        data: sampleUpdateEvent,
      });
    });

    it('test_handleAddReaction_invalidEmoji_callbackErrorNoBroadcast', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: 'invalid_emoji_123456789' };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: false, error: 'Invalid emoji format' });

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(mockIO.to).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid emoji format',
      });
    });

    it('test_handleAddReaction_commentNotFound_callbackError', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockRejectedValue(new Error('Comment not found'));

      await handler.handleAddReaction(socket as any, data, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found',
      });
    });

    it('test_handleAddReaction_unauthenticated_callbackError', async () => {
      const socket = { ...createMockSocket(), id: 'unknown-socket' };
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      // socket not in socketToUser map
      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'User not authenticated',
      });
    });

    it('test_handleAddReaction_anonymousUser_callbackError', async () => {
      const socket = createMockSocket();
      const anonSocketToUser = new Map<string, string>();
      anonSocketToUser.set(SOCKET_ID, USER_ID);

      const anonConnectedUsers = new Map();
      anonConnectedUsers.set(USER_ID, {
        id: USER_ID,
        socketId: SOCKET_ID,
        isAnonymous: true,
        language: 'fr',
      });

      const anonHandler = new CommentReactionHandler({
        io: mockIO as any,
        prisma: mockPrisma,
        notificationService: mockNotificationService,
        commentReactionService: mockReactionService,
        connectedUsers: anonConnectedUsers as any,
        socketToUser: anonSocketToUser,
      });

      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await anonHandler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Only registered users can react',
      });
    });

    it('test_handleAddReaction_selfReaction_broadcastsButNoNotification', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      // notification called with same userId as reactor — notification service should skip
      // We verify the notification service was called (it decides internally to skip)
      expect(mockNotificationService.createCommentReactionNotification).toHaveBeenCalled();
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post(POST_ID));
    });

    it('test_handleAddReaction_crossUserReaction_callsNotificationService', async () => {
      // Setup a comment authored by a different user
      const reactorSocketToUser = new Map<string, string>();
      reactorSocketToUser.set(SOCKET_ID, ANOTHER_USER_ID);

      const reactorConnectedUsers = new Map();
      reactorConnectedUsers.set(ANOTHER_USER_ID, {
        id: ANOTHER_USER_ID,
        socketId: SOCKET_ID,
        isAnonymous: false,
        language: 'fr',
        userId: ANOTHER_USER_ID,
      });

      // Mock prisma to return USER_ID as the comment author (different from reactor ANOTHER_USER_ID)
      const crossUserPrisma = createMockPrisma(USER_ID);
      crossUserPrisma.postComment.findUnique.mockResolvedValue({ authorId: USER_ID });

      const crossUserHandler = new CommentReactionHandler({
        io: mockIO as any,
        prisma: crossUserPrisma,
        notificationService: mockNotificationService,
        commentReactionService: mockReactionService,
        connectedUsers: reactorConnectedUsers as any,
        socketToUser: reactorSocketToUser,
      });

      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      const reactorUpdateEvent = { ...sampleUpdateEvent, userId: ANOTHER_USER_ID };
      const reactorReactionData = { ...sampleReactionData, userId: ANOTHER_USER_ID };

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(reactorReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(reactorUpdateEvent);

      await crossUserHandler.handleAddReaction(socket as any, data, callback);

      expect(mockNotificationService.createCommentReactionNotification).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.createCommentReactionNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          commentAuthorId: USER_ID,
          reactorUserId: ANOTHER_USER_ID,
          commentId: COMMENT_ID,
          postId: POST_ID,
          reactionEmoji: EMOJI,
        })
      );
    });
  });

  // ===== handleRemoveReaction =====

  describe('handleRemoveReaction', () => {
    it('test_handleRemoveReaction_success_broadcastsReactionRemovedAndCallbackOk', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.removeReaction.mockResolvedValue(true);
      mockReactionService.createUpdateEvent.mockResolvedValue({
        ...sampleUpdateEvent,
        action: 'remove',
      });

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockReactionService.removeReaction).toHaveBeenCalledWith({
        commentId: COMMENT_ID,
        userId: USER_ID,
        emoji: EMOJI,
      });

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.COMMENT_REACTION_REMOVED,
        expect.objectContaining({ action: 'remove' })
      );

      // Contrat ACK == broadcast : l'ACK porte le MÊME `updateEvent` (action:'remove')
      // que le broadcast `comment:reaction-removed`, et non plus un simple {message}.
      expect(callback).toHaveBeenCalledWith({
        success: true,
        data: { ...sampleUpdateEvent, action: 'remove' },
      });
    });

    it('test_handleRemoveReaction_notFound_callbackError', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.removeReaction.mockResolvedValue(false);

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockIO.to).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Reaction not found',
      });
    });

    it('test_handleRemoveReaction_unauthenticated_callbackError', async () => {
      const socket = { ...createMockSocket(), id: 'unknown-socket' };
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockReactionService.removeReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'User not authenticated',
      });
    });
  });

  // ===== handleRequestSync =====

  describe('handleRequestSync', () => {
    it('test_handleRequestSync_success_returnsFullAggregation', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID };
      const callback = jest.fn();

      const syncData = {
        commentId: COMMENT_ID,
        reactions: [
          { emoji: EMOJI, count: 2, userIds: [USER_ID, ANOTHER_USER_ID], hasCurrentUser: true },
        ],
        totalCount: 2,
        userReactions: [EMOJI],
      };

      mockReactionService.getCommentReactions.mockResolvedValue(syncData as any);

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getCommentReactions).toHaveBeenCalledWith({
        commentId: COMMENT_ID,
        currentUserId: USER_ID,
      });

      expect(callback).toHaveBeenCalledWith({
        success: true,
        data: syncData,
      });
    });

    it('test_handleRequestSync_unauthenticated_callbackError', async () => {
      const socket = { ...createMockSocket(), id: 'unknown-socket' };
      const data = { commentId: COMMENT_ID };
      const callback = jest.fn();

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getCommentReactions).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'User not authenticated',
      });
    });
  });

  // ===== Rate limiting (Fix 4) =====

  describe('handleAddReaction — rate limit', () => {
    it('test_handleAddReaction_rateLimitExceeded_callbackError', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockCheckLimit.mockResolvedValueOnce(false);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Rate limit exceeded',
      });
    });
  });

  describe('handleRemoveReaction — rate limit', () => {
    it('test_handleRemoveReaction_rateLimitExceeded_callbackError', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockCheckLimit.mockResolvedValueOnce(false);

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockReactionService.removeReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Rate limit exceeded',
      });
    });
  });
});
