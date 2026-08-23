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
  SocketCommentReactionRequestSyncSchema: {
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
      // Tranche ACL lue par `loadCommentPostAcl` — le post est résolu DEPUIS
      // le commentaire, le `postId` du payload n'est jamais cru.
      findFirst: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    friendRequest: {
      findFirst: jest.fn(),
    },
    communityMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
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
  unchanged: false,
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
    // Le même post, vu par la garde d'audience via le commentaire visé.
    mockPrisma.postComment.findFirst.mockResolvedValue({
      postId: POST_ID,
      post: { authorId: ANOTHER_USER_ID, visibility: 'PUBLIC', visibilityUserIds: [] },
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

    it('test_handleAddReaction_unchanged_noBroadcastNoNotification', async () => {
      // Idempotent no-op: the user already reacted with exactly this emoji on this
      // comment (re-fire — optimistic double-fire, socket retry, or a second device).
      // addReaction returns `unchanged: true`; the handler MUST reply success but MUST
      // NOT re-broadcast `comment:reaction-added` nor re-notify the author. Mirrors
      // ReactionHandler.handleReactionAdd's `unchanged` guard.
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue({ ...sampleReactionData, unchanged: true });
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      // ACK success preserved (idempotent add is a success from the client's view).
      expect(callback).toHaveBeenCalledWith({ success: true, data: sampleUpdateEvent });
      // No redundant broadcast, no redundant notification.
      expect(mockIO._toEmit).not.toHaveBeenCalledWith(
        SERVER_EVENTS.COMMENT_REACTION_ADDED,
        expect.anything()
      );
      expect(mockNotificationService.createCommentReactionNotification).not.toHaveBeenCalled();
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
      // Flush microtask queue so fire-and-forget notification chain completes
      await Promise.resolve(); await Promise.resolve();

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
      // Audience déclarée PUBLIC — ce cas porte sur la notification, pas sur l'ACL.
      crossUserPrisma.postComment.findFirst.mockResolvedValue({
        postId: POST_ID,
        post: { authorId: ANOTHER_USER_ID, visibility: 'PUBLIC', visibilityUserIds: [] },
      });
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
      // Flush microtask queue so fire-and-forget notification chain completes
      await Promise.resolve(); await Promise.resolve();

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

    it('test_handleAddReaction_reelPost_forwardsPostTypeReel', async () => {
      // F58: a reaction on a comment under a REEL must forward postType='REEL'
      // (not collapse to a story/post boolean).
      const reactorSocketToUser = new Map<string, string>();
      reactorSocketToUser.set(SOCKET_ID, ANOTHER_USER_ID);

      const reactorConnectedUsers = new Map();
      reactorConnectedUsers.set(ANOTHER_USER_ID, {
        id: ANOTHER_USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'fr', userId: ANOTHER_USER_ID,
      });

      const reelPrisma = createMockPrisma(USER_ID);
      // Audience déclarée PUBLIC — ce cas porte sur le postType, pas sur l'ACL.
      reelPrisma.postComment.findFirst.mockResolvedValue({
        postId: POST_ID,
        post: { authorId: ANOTHER_USER_ID, visibility: 'PUBLIC', visibilityUserIds: [] },
      });
      reelPrisma.postComment.findUnique.mockResolvedValue({ authorId: USER_ID, content: 'nice' });
      reelPrisma.post.findUnique.mockResolvedValue({
        type: 'REEL',
        author: { displayName: 'Bob', username: 'bob' },
      });

      const reelHandler = new CommentReactionHandler({
        io: mockIO as any,
        prisma: reelPrisma,
        notificationService: mockNotificationService,
        commentReactionService: mockReactionService,
        connectedUsers: reactorConnectedUsers as any,
        socketToUser: reactorSocketToUser,
      });

      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue({ ...sampleReactionData, userId: ANOTHER_USER_ID });
      mockReactionService.createUpdateEvent.mockResolvedValue({ ...sampleUpdateEvent, userId: ANOTHER_USER_ID });

      await reelHandler.handleAddReaction(socket as any, data, callback);
      await Promise.resolve(); await Promise.resolve();

      expect(mockNotificationService.createCommentReactionNotification).toHaveBeenCalledWith(
        expect.objectContaining({ postType: 'REEL', postAuthorName: 'Bob' })
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

    it('test_handleRemoveReaction_alreadyAbsent_isIdempotent_callbackSuccessNoBroadcast', async () => {
      // The reaction is already gone (concurrent removal, retry of an applied
      // remove, double-tap un-like). `{ success: false }` would make the client
      // roll the optimistic un-like back, re-showing a like that is gone.
      // Mirrors ReactionHandler.handleReactionRemove (message reactions).
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.removeReaction.mockResolvedValue(false);

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockIO.to).not.toHaveBeenCalled();
      // Reçu SANS `data` : rien n'a changé, donc aucun `updateEvent` n'est
      // diffusé, donc l'accusé n'a rien à refléter.
      expect(callback).toHaveBeenCalledWith({ success: true });
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
      mockValidate.mockReturnValue({ success: true, data });

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

    it('test_handleRequestSync_malformedCommentId_validationErrorNoServiceCall', async () => {
      const socket = createMockSocket();
      const data = {} as { commentId: string };
      const callback = jest.fn();

      // A malformed sync payload (missing/invalid commentId) must be rejected at
      // the socket boundary with the clean schema error — never fall through to
      // the service, whose `validateCommentId` would throw an opaque
      // `TypeError: Cannot read properties of undefined (reading 'substring')`.
      mockValidate.mockReturnValue({ success: false, error: 'Invalid commentId format' });

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getCommentReactions).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid commentId format',
      });
    });

    it('test_handleRequestSync_unauthenticated_callbackError', async () => {
      const socket = { ...createMockSocket(), id: 'unknown-socket' };
      const data = { commentId: COMMENT_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getCommentReactions).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'User not authenticated',
      });
    });

    // La synchronisation REND l'identité de chaque réacteur (`userIds` dans
    // `CommentReactionSync`). C'est une LECTURE du fil, donc elle doit passer la
    // même audience que la lecture du fil — `canUserConsumePost`, celle que
    // `handleJoinPost` applique déjà pour laisser entrer dans la room. Sans
    // garde, n'importe quel compte authentifié obtenait le roster complet d'un
    // commentaire d'un post PRIVATE en connaissant son seul `commentId`.
    it('test_handleRequestSync_postNotConsumable_deniesWithoutOracle', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.postComment.findFirst.mockResolvedValue({
        postId: POST_ID,
        post: { authorId: ANOTHER_USER_ID, visibility: 'PRIVATE', visibilityUserIds: [] },
      });

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getCommentReactions).not.toHaveBeenCalled();
      // Refus INDISTINCT, comme les frères : jamais de 403 qui confirmerait
      // l'existence du commentaire visé.
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found',
      });
    });

    it('test_handleRequestSync_commentAbsent_deniesWithoutServiceCall', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.postComment.findFirst.mockResolvedValue(null);

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getCommentReactions).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Comment not found',
      });
    });

    it('test_handleRequestSync_consumableButNotInteractable_stillAllows', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID };
      const callback = jest.fn();
      const syncData = { commentId: COMMENT_ID, reactions: [], totalCount: 0, userReactions: [] };

      mockValidate.mockReturnValue({ success: true, data });
      // Audience de CONSOMMATION (amis ∪ contacts DM), pas d'INTERACTION (amis
      // stricts) : un contact DM non-ami qui lit légitimement le fil doit
      // pouvoir en synchroniser les réactions. Gater la lecture sur l'audience
      // d'écriture transformerait un lecteur légitime en 404.
      mockPrisma.postComment.findFirst.mockResolvedValue({
        postId: POST_ID,
        post: { authorId: ANOTHER_USER_ID, visibility: 'FRIENDS', visibilityUserIds: [] },
      });
      mockPrisma.friendRequest.findFirst.mockResolvedValue(null);
      mockPrisma.participant.findMany.mockResolvedValue([{ conversationId: 'c-1' }]);
      mockPrisma.participant.findFirst.mockResolvedValue({ id: 'p-1' });
      mockReactionService.getCommentReactions.mockResolvedValue(syncData as any);

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getCommentReactions).toHaveBeenCalledWith({
        commentId: COMMENT_ID,
        currentUserId: USER_ID,
      });
      expect(callback).toHaveBeenCalledWith({ success: true, data: syncData });
    });
  });

  // ===== Adresse de diffusion : le `postId` du payload n'est pas une autorité =====
  //
  // Le `postId` porté par `comment:reaction-add` / `-remove` est FOURNI PAR LE
  // CLIENT. La garde d'audience, elle, résout le post DEPUIS le commentaire
  // (`loadCommentPostAcl`) — donc le handler tient déjà la vérité. Il ne s'en
  // servait pas pour ADRESSER la diffusion, qui partait vers
  // `ROOMS.post(<postId du client>)`.
  //
  // `PostReactionHandler` établit l'invariant inverse depuis la tâche 9 : room
  // ET payload portent la cible RÉSOLUE (`targetPostId`), jamais l'id brut.
  // Les deux handlers implémentent la même règle ; seul celui-ci croyait le
  // client. Un commentaire est TOUJOURS écrit sur la cible résolue
  // (`routes/posts/comments.ts` § `targetPostId`), donc `thread.postId` EST la
  // racine — aucune requête supplémentaire à payer.
  describe('adresse de diffusion résolue depuis le commentaire', () => {
    const CLIENT_SUPPLIED_POST_ID = '507f1f77bcf86cd7994390ff';

    it('test_handleAddReaction_clientPostIdDiffers_broadcastsToCommentsRealPostRoom', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: CLIENT_SUPPLIED_POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      // Le commentaire appartient à POST_ID (stub `postComment.findFirst`).
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.post(CLIENT_SUPPLIED_POST_ID));
    });

    it('test_handleAddReaction_clientPostIdDiffers_payloadCarriesRealPostId', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: CLIENT_SUPPLIED_POST_ID, emoji: EMOJI };

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, jest.fn());

      // `createUpdateEvent(commentId, emoji, action, userId, postId)` — le 5e
      // argument devient le `postId` du payload que web/iOS utilisent comme CLÉ
      // de cache (`patchCommentInPostCaches`). Un id étranger y écrit un
      // commentaire fantôme dans le cache d'un autre post.
      expect(mockReactionService.createUpdateEvent).toHaveBeenCalledWith(
        COMMENT_ID,
        EMOJI,
        'add',
        USER_ID,
        POST_ID,
      );
    });

    it('test_handleRemoveReaction_clientPostIdDiffers_broadcastsToCommentsRealPostRoom', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: CLIENT_SUPPLIED_POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.removeReaction.mockResolvedValue(true);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.post(CLIENT_SUPPLIED_POST_ID));
      expect(mockReactionService.createUpdateEvent).toHaveBeenCalledWith(
        COMMENT_ID,
        EMOJI,
        'remove',
        USER_ID,
        POST_ID,
      );
    });

    it('test_handleAddReaction_clientPostIdDiffers_notificationTargetsRealPost', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: CLIENT_SUPPLIED_POST_ID, emoji: EMOJI };

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.postComment.findUnique.mockResolvedValue({
        authorId: ANOTHER_USER_ID,
        content: 'un commentaire',
      });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, jest.fn());
      await new Promise((r) => setImmediate(r));

      // La notification porte le lien profond ET relit `post.type`/l'auteur pour
      // composer son corps. Sur un id étranger elle nommait le mauvais auteur et
      // renvoyait le destinataire sur un post qu'il ne peut peut-être pas voir.
      expect(mockPrisma.post.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: POST_ID } }),
      );
      expect(mockNotificationService.createCommentReactionNotification).toHaveBeenCalledWith(
        expect.objectContaining({ postId: POST_ID }),
      );
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
  // ===== Audience du post portant le commentaire =====

  describe('audience du post portant le commentaire', () => {
    /**
     * Ce handler importait `canUserViewPost` et portait un wrapper privé
     * `_canUserViewPost` — que RIEN n'appelait. L'intention était écrite, le
     * branchement manquait : réagir au commentaire d'un post restreint
     * réussissait, pesait dans les agrégats et notifiait l'auteur du
     * commentaire.
     */
    it('test_handleAddReaction_privatePost_deniesAndNeverReachesService', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.postComment.findFirst.mockResolvedValue({
        postId: POST_ID,
        post: { authorId: ANOTHER_USER_ID, visibility: 'PRIVATE', visibilityUserIds: [] },
      });

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Comment not found' });
    });

    it('test_handleAddReaction_payloadPostIdIsNotTrusted_deniesOnRealPost', async () => {
      const socket = createMockSocket();
      // Le payload annonce un post public ; le commentaire visé appartient en
      // réalité à un autre post, privé.
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        authorId: ANOTHER_USER_ID,
        visibility: 'PUBLIC',
        visibilityUserIds: [],
      });
      mockPrisma.postComment.findFirst.mockResolvedValue({
        postId: 'p-autre',
        post: { authorId: ANOTHER_USER_ID, visibility: 'PRIVATE', visibilityUserIds: [] },
      });

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
    });

    it('test_handleAddReaction_missingComment_denies', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.postComment.findFirst.mockResolvedValue(null);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Comment not found' });
    });

    it('test_handleRemoveReaction_privatePost_deniesAndNeverReachesService', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.postComment.findFirst.mockResolvedValue({
        postId: POST_ID,
        post: { authorId: ANOTHER_USER_ID, visibility: 'PRIVATE', visibilityUserIds: [] },
      });

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockReactionService.removeReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Comment not found' });
    });

    it('test_handleAddReaction_friendsPostOfFriend_allows', async () => {
      const socket = createMockSocket();
      const data = { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.postComment.findFirst.mockResolvedValue({
        postId: POST_ID,
        post: { authorId: ANOTHER_USER_ID, visibility: 'FRIENDS', visibilityUserIds: [] },
      });
      mockPrisma.friendRequest.findFirst.mockResolvedValue({ id: 'fr-1' });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).toHaveBeenCalled();
    });
  });
});
