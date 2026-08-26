/**
 * PostReactionHandler Unit Tests
 *
 * Mirrors CommentReactionHandler pattern exactly, swapping comment reactions
 * for post reactions (postId as target, no commentId).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ===== MOCKS =====

jest.mock('../../../services/PostReactionService', () => ({
  PostReactionService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketPostReactionAddSchema: {
    safeParse: jest.fn(),
  },
  SocketPostReactionRemoveSchema: {
    safeParse: jest.fn(),
  },
  SocketPostRoomActionSchema: {
    safeParse: jest.fn(),
  },
  SocketPostReactionRequestSyncSchema: {
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
import { PostReactionHandler } from '../../../socketio/handlers/PostReactionHandler';
import type { PostReactionService } from '../../../services/PostReactionService';
import type { NotificationService } from '../../../services/notifications/NotificationService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { validateSocketEvent } from '../../../middleware/validation';

// ===== HELPERS =====

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

function createMockPostReactionService(): jest.Mocked<PostReactionService> {
  return {
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
    getPostReactions: jest.fn(),
    getEmojiAggregation: jest.fn(),
    getUserReactions: jest.fn(),
    hasUserReacted: jest.fn(),
    deletePostReactions: jest.fn(),
    createUpdateEvent: jest.fn(),
    validateAddReactionOptions: jest.fn(),
    validateRemoveReactionOptions: jest.fn(),
  } as unknown as jest.Mocked<PostReactionService>;
}

function createMockNotificationService() {
  return {
    createPostLikeNotification: jest.fn(),
  } as any;
}

function createMockPrisma() {
  return {
    post: {
      findUnique: jest.fn(),
      // Tranche ACL lue par `loadPostAcl` — la garde d'audience de
      // handleAddReaction / handleRemoveReaction.
      findFirst: jest.fn(),
    },
    postComment: {
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
  postId: POST_ID,
  userId: USER_ID,
  emoji: EMOJI,
  action: 'add' as const,
  aggregation: {
    emoji: EMOJI,
    count: 1,
  },
  timestamp: new Date(),
};

const sampleReactionData = {
  id: '507f1f77bcf86cd799439055',
  postId: POST_ID,
  userId: USER_ID,
  emoji: EMOJI,
  createdAt: new Date(),
  updatedAt: new Date(),
  unchanged: false,
};

// ===== TESTS =====

describe('PostReactionHandler', () => {
  let handler: PostReactionHandler;
  let mockIO: ReturnType<typeof createMockIO>;
  let mockPrisma: any;
  let mockReactionService: jest.Mocked<PostReactionService>;
  let mockNotificationService: any;
  let connectedUsers: Map<string, unknown>;
  let socketToUser: Map<string, string>;
  let mockSocialEvents: any;

  const mockValidate = validateSocketEvent as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset rate limiter to allow by default
    mockCheckLimit.mockResolvedValue(true);

    mockIO = createMockIO();
    mockPrisma = createMockPrisma();
    mockReactionService = createMockPostReactionService();
    mockNotificationService = createMockNotificationService();
    connectedUsers = createConnectedUsers(USER_ID);
    socketToUser = createSocketToUser(SOCKET_ID, USER_ID);
    // Unification du like : le handler émet `post:liked` via le SocialEventsHandler
    // pour un ❤️ sur POST/REEL. Pour les autres emojis (ici 👍), le chemin reste
    // `post:reaction-added` (ce mock n'est alors pas sollicité).
    mockSocialEvents = {
      broadcastPostLiked: jest.fn(() => Promise.resolve()),
      broadcastPostUnliked: jest.fn(() => Promise.resolve()),
    };

    mockNotificationService.createPostLikeNotification.mockResolvedValue(null);
    // Default: PUBLIC post, not deleted
    mockPrisma.post.findUnique.mockResolvedValue({
      id: POST_ID,
      authorId: ANOTHER_USER_ID,
      visibility: 'PUBLIC',
      visibilityUserIds: [],
      deletedAt: null,
    });
    // Même post vu par la garde d'audience + la redirection repost simple →
    // racine (`resolveInteractionTarget`, tâche 9) : `id` doit matcher
    // `POST_ID` pour que les assertions `toHaveBeenCalledWith({ postId:
    // POST_ID, ... })` restent vraies, et `isQuote:false, repostOfId:null`
    // signale « pas un repost » — aucune redirection par défaut.
    mockPrisma.post.findFirst.mockResolvedValue({
      id: POST_ID,
      authorId: ANOTHER_USER_ID,
      visibility: 'PUBLIC',
      visibilityUserIds: [],
      isQuote: false,
      repostOfId: null,
      originalRepostOfId: null,
    });

    handler = new PostReactionHandler({
      io: mockIO as any,
      prisma: mockPrisma,
      notificationService: mockNotificationService,
      postReactionService: mockReactionService,
      connectedUsers: connectedUsers as any,
      socketToUser,
      socialEvents: mockSocialEvents,
    });
  });

  // ===== handleAddReaction =====

  describe('handleAddReaction', () => {
    it('test_handleAddReaction_success_callsServiceAndBroadcastsToPostRoom', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).toHaveBeenCalledWith({
        postId: POST_ID,
        userId: USER_ID,
        emoji: EMOJI,
      });

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.POST_REACTION_ADDED,
        sampleUpdateEvent
      );

      // Contrat ACK == broadcast : l'ACK porte le MÊME `updateEvent` que le broadcast
      // `post:reaction-added` (et non plus la `reaction` brute) — c'est ce que l'iOS décode.
      expect(callback).toHaveBeenCalledWith({
        success: true,
        data: sampleUpdateEvent,
      });
    });

    it('test_handleAddReaction_heartOnPost_emitsCanonicalPostLiked_notReactionAdded', async () => {
      // Unification du like : un ❤️ sur un POST/REEL émet l'événement CANONIQUE
      // absolu `post:liked` (feed rooms + post room, via SocialEventsHandler) — PAS
      // `post:reaction-added` — pour aligner les 3 vues (feed, détail, reel).
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: '❤️' };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue({ ...sampleReactionData, emoji: '❤️' });
      mockReactionService.createUpdateEvent.mockResolvedValue({ ...sampleUpdateEvent, emoji: '❤️' });
      mockPrisma.post.findUnique.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        type: 'POST',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
        likeCount: 7,
        reactionSummary: { '❤️': 7 },
      });

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockSocialEvents.broadcastPostLiked).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: POST_ID,
          userId: USER_ID,
          emoji: '❤️',
          likeCount: 7,
          reactionSummary: { '❤️': 7 },
        }),
        ANOTHER_USER_ID,
        // Visibility-aware fan-out (audit C1-bis): the post's visibility is
        // forwarded so a non-PUBLIC post never leaks the like to all friends.
        expect.anything(),
        expect.anything(),
      );
      // Pas de double-émission par-emoji pour le ❤️ (sinon double-comptage client).
      expect(mockIO._toEmit).not.toHaveBeenCalledWith(
        SERVER_EVENTS.POST_REACTION_ADDED,
        expect.anything()
      );
    });

    it('test_handleAddReaction_unchanged_noBroadcastNoNotification', async () => {
      // Idempotent no-op: the user already reacted with exactly this emoji (a like
      // re-fire — optimistic double-fire, socket retry after a lost ACK, or a second
      // device echoing the same tap). addReaction returns `unchanged: true` and the
      // handler MUST reply success (the desired end-state is already achieved) but
      // MUST NOT re-broadcast `post:liked` nor re-notify the author — re-emitting
      // spams every feed/post-room socket and re-notifies the author for a reaction
      // that never changed state. Mirrors ReactionHandler.handleReactionAdd's
      // `unchanged` guard.
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: '❤️' };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue({ ...sampleReactionData, emoji: '❤️', unchanged: true });
      mockReactionService.createUpdateEvent.mockResolvedValue({ ...sampleUpdateEvent, emoji: '❤️' });
      mockPrisma.post.findUnique.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        type: 'POST',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
        likeCount: 7,
        reactionSummary: { '❤️': 7 },
      });

      await handler.handleAddReaction(socket as any, data, callback);

      // ACK success preserved (idempotent add is a success from the client's view).
      expect(callback).toHaveBeenCalledWith({ success: true, data: { ...sampleUpdateEvent, emoji: '❤️' } });
      // No redundant fan-out, no redundant notification.
      expect(mockSocialEvents.broadcastPostLiked).not.toHaveBeenCalled();
      expect(mockIO._toEmit).not.toHaveBeenCalledWith(
        SERVER_EVENTS.POST_REACTION_ADDED,
        expect.anything()
      );
      expect(mockNotificationService.createPostLikeNotification).not.toHaveBeenCalled();
    });

    it('test_handleAddReaction_heartOnStory_keepsReactionAdded_noPostLiked', async () => {
      // Le ❤️ sur une STORY garde le chemin par-emoji `post:reaction-added` (les
      // stories ont leur propre broadcast — on ne bascule QUE POST/REEL sur post:liked).
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: '❤️' };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue({ ...sampleReactionData, emoji: '❤️' });
      mockReactionService.createUpdateEvent.mockResolvedValue({ ...sampleUpdateEvent, emoji: '❤️' });
      mockPrisma.post.findUnique.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        type: 'STORY',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
        likeCount: 1,
        reactionSummary: { '❤️': 1 },
      });

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockSocialEvents.broadcastPostLiked).not.toHaveBeenCalled();
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.POST_REACTION_ADDED,
        expect.objectContaining({ emoji: '❤️' })
      );
    });

    it('test_handleAddReaction_invalidEmoji_callbackErrorNoBroadcast', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: 'invalid_emoji_123456789' };
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

    it('test_handleAddReaction_postNotFound_callbackError', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockRejectedValue(new Error('Post not found'));

      await handler.handleAddReaction(socket as any, data, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Post not found',
      });
    });

    it('test_handleAddReaction_unauthenticated_callbackError', async () => {
      const socket = { ...createMockSocket(), id: 'unknown-socket' };
      const data = { postId: POST_ID, emoji: EMOJI };
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

      const anonHandler = new PostReactionHandler({
        io: mockIO as any,
        prisma: mockPrisma,
        notificationService: mockNotificationService,
        postReactionService: mockReactionService,
        connectedUsers: anonConnectedUsers as any,
        socketToUser: anonSocketToUser,
        socialEvents: mockSocialEvents,
      });

      const data = { postId: POST_ID, emoji: EMOJI };
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
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      // Post is authored by USER_ID (same as reactor)
      mockPrisma.post.findUnique.mockResolvedValue({
        id: POST_ID,
        authorId: USER_ID,
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
      });

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      // Notification service is called with actorId === postAuthorId — service skips internally
      expect(mockNotificationService.createPostLikeNotification).toHaveBeenCalledTimes(1);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post(POST_ID));
    });

    it('test_handleAddReaction_crossUserReaction_callsNotificationService', async () => {
      // Reactor is ANOTHER_USER_ID, post author is USER_ID
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

      mockPrisma.post.findUnique.mockResolvedValue({
        id: POST_ID,
        authorId: USER_ID,
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
      });

      const crossUserHandler = new PostReactionHandler({
        io: mockIO as any,
        prisma: mockPrisma,
        notificationService: mockNotificationService,
        postReactionService: mockReactionService,
        connectedUsers: reactorConnectedUsers as any,
        socketToUser: reactorSocketToUser,
        socialEvents: mockSocialEvents,
      });

      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      const reactorUpdateEvent = { ...sampleUpdateEvent, userId: ANOTHER_USER_ID };
      const reactorReactionData = { ...sampleReactionData, userId: ANOTHER_USER_ID };

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(reactorReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(reactorUpdateEvent);

      await crossUserHandler.handleAddReaction(socket as any, data, callback);

      expect(mockNotificationService.createPostLikeNotification).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.createPostLikeNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ANOTHER_USER_ID,
          postId: POST_ID,
          postAuthorId: USER_ID,
          emoji: EMOJI,
        })
      );
    });

    it('test_handleAddReaction_reactionOnStory_forwardsRealTypeAndEphemeralContext', async () => {
      // Sibling-drift guard: the socket path must forward the real post type +
      // ephemeral context (mirror of the REST like route), NOT hardcode 'POST'.
      // Without it, a STORY reaction yields a generic post_like notification and
      // loses expiry context.
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

      const storyCreatedAt = new Date('2026-07-04T10:00:00.000Z');
      const storyExpiresAt = new Date('2026-07-05T10:00:00.000Z');
      mockPrisma.post.findUnique.mockResolvedValue({
        id: POST_ID,
        authorId: USER_ID,
        type: 'STORY',
        content: 'my ephemeral story caption',
        createdAt: storyCreatedAt,
        expiresAt: storyExpiresAt,
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
      });

      const storyHandler = new PostReactionHandler({
        io: mockIO as any,
        prisma: mockPrisma,
        notificationService: mockNotificationService,
        postReactionService: mockReactionService,
        connectedUsers: reactorConnectedUsers as any,
        socketToUser: reactorSocketToUser,
        socialEvents: mockSocialEvents,
      });

      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      const reactorUpdateEvent = { ...sampleUpdateEvent, userId: ANOTHER_USER_ID };
      const reactorReactionData = { ...sampleReactionData, userId: ANOTHER_USER_ID };

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.addReaction.mockResolvedValue(reactorReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(reactorUpdateEvent);

      await storyHandler.handleAddReaction(socket as any, data, callback);

      expect(mockNotificationService.createPostLikeNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: 'STORY',
          postPreview: 'my ephemeral story caption',
          postCreatedAt: storyCreatedAt,
          postExpiresAt: storyExpiresAt,
        })
      );
    });

    it('test_handleAddReaction_rateLimitExceeded_callbackError', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
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

  // ===== handleRemoveReaction =====

  describe('handleRemoveReaction', () => {
    it('test_handleRemoveReaction_success_broadcastsReactionRemovedAndCallbackOk', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockReactionService.removeReaction.mockResolvedValue(true);
      mockReactionService.createUpdateEvent.mockResolvedValue({
        ...sampleUpdateEvent,
        action: 'remove',
      });

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockReactionService.removeReaction).toHaveBeenCalledWith({
        postId: POST_ID,
        userId: USER_ID,
        emoji: EMOJI,
      });

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.POST_REACTION_REMOVED,
        expect.objectContaining({ action: 'remove' })
      );

      // Contrat ACK == broadcast : l'ACK porte le MÊME `updateEvent` (action:'remove')
      // que le broadcast `post:reaction-removed`, et non plus un simple {message}.
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
      const data = { postId: POST_ID, emoji: EMOJI };
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
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockReactionService.removeReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'User not authenticated',
      });
    });

    it('test_handleRemoveReaction_rateLimitExceeded_callbackError', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
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

  // ===== handleRequestSync =====

  describe('handleRequestSync', () => {
    it('test_handleRequestSync_success_returnsFullAggregation', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      const syncData = {
        postId: POST_ID,
        reactions: [
          { emoji: EMOJI, count: 2 },
        ],
        totalCount: 2,
        userReactions: [EMOJI],
      };

      mockReactionService.getPostReactions.mockResolvedValue(syncData as any);
      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getPostReactions).toHaveBeenCalledWith({
        postId: POST_ID,
        currentUserId: USER_ID,
      });

      expect(callback).toHaveBeenCalledWith({
        success: true,
        data: syncData,
      });
    });

    it('test_handleRequestSync_malformedPostId_validationErrorNoServiceCall', async () => {
      const socket = createMockSocket();
      const data = {} as { postId: string };
      const callback = jest.fn();

      // A malformed sync payload (missing/invalid postId) must be rejected at the
      // socket boundary with the clean schema error — never fall through to the
      // service, whose `validatePostId` would throw an opaque
      // `TypeError: Cannot read properties of undefined (reading 'substring')`.
      mockValidate.mockReturnValue({ success: false, error: 'Invalid postId format' });

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getPostReactions).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid postId format',
      });
    });

    it('test_handleRequestSync_unauthenticated_callbackError', async () => {
      const socket = { ...createMockSocket(), id: 'unknown-socket' };
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleRequestSync(socket as any, data, callback);

      expect(mockReactionService.getPostReactions).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'User not authenticated',
      });
    });
  });

  // ===== handleJoinPost =====

  describe('handleJoinPost', () => {
    it('test_handleJoinPost_success_socketJoinsPostRoom', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('test_handleJoinPost_malformedPostId_callbackError', async () => {
      const socket = createMockSocket();
      const data = { postId: 'not-a-valid-id' };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: false, error: 'Invalid postId format' });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid postId format',
      });
    });

    it('test_handleJoinPost_unauthenticated_callbackError', async () => {
      const socket = { ...createMockSocket(), id: 'unknown-socket' };
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'User not authenticated',
      });
    });

    it('test_handleJoinPost_privatePost_nonAuthor_forbidden', async () => {
      // `post:join` route désormais par `resolveConsumptionTarget`, qui refuse
      // indistinctement (jamais de 'Forbidden' séparé) — même posture que
      // `handleAddReaction`/`handleRemoveReaction` et `comments.ts` GET :
      // pas de code d'erreur différent qui divulguerait l'existence d'un
      // post restreint (review task-9, important #1).
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'PRIVATE',
        visibilityUserIds: [],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
      });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
    });

    it('test_handleJoinPost_onlyVisibility_userInList_success', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'ONLY',
        visibilityUserIds: [USER_ID],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
      });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('test_handleJoinPost_onlyVisibility_userNotInList_forbidden', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'ONLY',
        visibilityUserIds: ['507f1f77bcf86cd799439099'],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
      });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
    });

    it('test_handleJoinPost_publicPost_success', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
      });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('test_handleJoinPost_postNotFound_returnsError', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue(null);

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
    });

    it('test_handleJoinPost_deletedPost_returnsError', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      // Soft-deleted: `resolveConsumptionTarget`'s query filters `deletedAt`
      // in `where`, so the (unfiltered) mock simulates it by resolving null.
      mockPrisma.post.findFirst.mockResolvedValue(null);

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
    });

    it('test_handleJoinPost_simpleRepost_joinsRootRoom', async () => {
      // Review task-9, important #1 : rejoindre un repost simple rejoint la
      // room de sa RACINE (même redirection que like/comment/lecture) — sinon
      // le viewer n'entend plus jamais les broadcasts, tous partis vers la
      // room de la racine.
      const ROOT_ID = '507f1f77bcf86cd799439077';
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === POST_ID) {
          return Promise.resolve({
            id: POST_ID,
            authorId: ANOTHER_USER_ID,
            visibility: 'PUBLIC',
            visibilityUserIds: [],
            type: 'POST',
            isQuote: false,
            repostOfId: ROOT_ID,
            originalRepostOfId: ROOT_ID,
          });
        }
        if (where.id === ROOT_ID) {
          return Promise.resolve({
            id: ROOT_ID,
            authorId: ANOTHER_USER_ID,
            visibility: 'PUBLIC',
            visibilityUserIds: [],
            type: 'POST',
            isQuote: false,
            repostOfId: null,
            originalRepostOfId: null,
            deletedAt: null,
          });
        }
        return Promise.resolve(null);
      });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).toHaveBeenCalledWith(ROOMS.post(ROOT_ID));
      expect(socket.join).not.toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('test_handleJoinPost_storySourcedRepost_joinsOwnRoom_notRootRoom', async () => {
      // Critique #1 : un repost qui SOURCE une story garde sa PROPRE room.
      const STORY_ROOT_ID = '507f1f77bcf86cd799439088';
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === POST_ID) {
          return Promise.resolve({
            id: POST_ID,
            authorId: ANOTHER_USER_ID,
            visibility: 'PUBLIC',
            visibilityUserIds: [],
            type: 'POST',
            isQuote: false,
            repostOfId: STORY_ROOT_ID,
            originalRepostOfId: STORY_ROOT_ID,
          });
        }
        if (where.id === STORY_ROOT_ID) {
          return Promise.resolve({
            id: STORY_ROOT_ID,
            authorId: ANOTHER_USER_ID,
            visibility: 'PUBLIC',
            visibilityUserIds: [],
            type: 'STORY',
            isQuote: false,
            repostOfId: null,
            originalRepostOfId: null,
            deletedAt: null,
          });
        }
        return Promise.resolve(null);
      });

      await handler.handleJoinPost(socket as any, data, callback);

      expect(socket.join).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(socket.join).not.toHaveBeenCalledWith(ROOMS.post(STORY_ROOT_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });
  });

  // ===== handleLeavePost =====

  describe('handleLeavePost', () => {
    it('test_handleLeavePost_success_socketLeavesPostRoom', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleLeavePost(socket as any, data, callback);

      expect(socket.leave).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('test_handleLeavePost_malformedPostId_callbackError', async () => {
      const socket = createMockSocket();
      const data = { postId: 'bad-id' };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: false, error: 'Invalid postId format' });

      await handler.handleLeavePost(socket as any, data, callback);

      expect(socket.leave).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid postId format',
      });
    });

    it('test_handleLeavePost_unauthenticated_callbackError', async () => {
      const socket = { ...createMockSocket(), id: 'unknown-socket' };
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });

      await handler.handleLeavePost(socket as any, data, callback);

      expect(socket.leave).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'User not authenticated',
      });
    });

    it('test_handleLeavePost_simpleRepost_leavesRootRoom', async () => {
      // Symétrique de `handleJoinPost` (review task-9, important #1) : sans
      // cette résolution, `leave` viserait la room DU REPOST — où le socket
      // n'a jamais mis les pieds (le join a rejoint la racine) — et la vraie
      // room ne se libérerait jamais (fuite d'abonnement).
      const ROOT_ID = '507f1f77bcf86cd799439077';
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === POST_ID) {
          return Promise.resolve({
            id: POST_ID,
            authorId: ANOTHER_USER_ID,
            visibility: 'PUBLIC',
            visibilityUserIds: [],
            type: 'POST',
            isQuote: false,
            repostOfId: ROOT_ID,
            originalRepostOfId: ROOT_ID,
          });
        }
        if (where.id === ROOT_ID) {
          return Promise.resolve({
            id: ROOT_ID,
            authorId: ANOTHER_USER_ID,
            visibility: 'PUBLIC',
            visibilityUserIds: [],
            type: 'POST',
            isQuote: false,
            repostOfId: null,
            originalRepostOfId: null,
            deletedAt: null,
          });
        }
        return Promise.resolve(null);
      });

      await handler.handleLeavePost(socket as any, data, callback);

      expect(socket.leave).toHaveBeenCalledWith(ROOMS.post(ROOT_ID));
      expect(socket.leave).not.toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('test_handleLeavePost_storySourcedRepost_leavesOwnRoom', async () => {
      const STORY_ROOT_ID = '507f1f77bcf86cd799439088';
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === POST_ID) {
          return Promise.resolve({
            id: POST_ID,
            authorId: ANOTHER_USER_ID,
            visibility: 'PUBLIC',
            visibilityUserIds: [],
            type: 'POST',
            isQuote: false,
            repostOfId: STORY_ROOT_ID,
            originalRepostOfId: STORY_ROOT_ID,
          });
        }
        if (where.id === STORY_ROOT_ID) {
          return Promise.resolve({
            id: STORY_ROOT_ID,
            authorId: ANOTHER_USER_ID,
            visibility: 'PUBLIC',
            visibilityUserIds: [],
            type: 'STORY',
            isQuote: false,
            repostOfId: null,
            originalRepostOfId: null,
            deletedAt: null,
          });
        }
        return Promise.resolve(null);
      });

      await handler.handleLeavePost(socket as any, data, callback);

      expect(socket.leave).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(socket.leave).not.toHaveBeenCalledWith(ROOMS.post(STORY_ROOT_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('test_handleLeavePost_resolutionFails_fallsBackToRawId', async () => {
      // Best-effort : si la racine n'est plus résolvable (ACL resserrée
      // depuis le join), `leave` retombe sur l'id brut plutôt que d'échouer —
      // quitter une room absente est un no-op silencieux côté Socket.IO.
      const socket = createMockSocket();
      const data = { postId: POST_ID };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue(null);

      await handler.handleLeavePost(socket as any, data, callback);

      expect(socket.leave).toHaveBeenCalledWith(ROOMS.post(POST_ID));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });
  });
  // ===== Audience du post — réagir est une INTERACTION =====

  describe('audience du post', () => {
    /**
     * `post:join` refusait déjà l'abonnement à la room d'un post restreint
     * (`canUserViewPost`), mais `post:reaction-add` / `-remove` n'ont jamais
     * consulté la visibilité : réagir ne passe pas par la room, il suffit de
     * connaître le `postId`. La réaction persistée remontait ensuite dans les
     * agrégats du post et notifiait son auteur.
     */
    it('test_handleAddReaction_privatePost_deniesAndNeverReachesService', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'PRIVATE',
        visibilityUserIds: [],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
      });

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
    });

    it('test_handleAddReaction_friendsPostOfNonFriend_denies', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'FRIENDS',
        visibilityUserIds: [],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
      });
      mockPrisma.friendRequest.findFirst.mockResolvedValue(null);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
    });

    it('test_handleAddReaction_friendsPostOfFriend_allows', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'FRIENDS',
        visibilityUserIds: [],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
      });
      mockPrisma.friendRequest.findFirst.mockResolvedValue({ id: 'fr-1' });
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).toHaveBeenCalled();
    });

    it('test_handleAddReaction_deletedOrMissingPost_denies', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue(null);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
    });

    it('test_handleRemoveReaction_privatePost_deniesAndNeverReachesService', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockResolvedValue({
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'PRIVATE',
        visibilityUserIds: [],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
      });

      await handler.handleRemoveReaction(socket as any, data, callback);

      expect(mockReactionService.removeReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
    });
  });

  describe('repost simple → redirection vers la racine (tâche 9)', () => {
    const ROOT_ID = '507f1f77bcf86cd799439fff';
    const OTHER_REPOST_ID = '507f1f77bcf86cd799439eee';

    function repostAcl(overrides: Record<string, unknown> = {}) {
      return {
        id: POST_ID,
        authorId: ANOTHER_USER_ID,
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        isQuote: false,
        repostOfId: ROOT_ID,
        originalRepostOfId: ROOT_ID,
        ...overrides,
      };
    }

    function rootAcl(overrides: Record<string, unknown> = {}) {
      return {
        id: ROOT_ID,
        authorId: 'root-author-1',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        isQuote: false,
        repostOfId: null,
        originalRepostOfId: null,
        ...overrides,
      };
    }

    function byId(map: Record<string, unknown | null>) {
      return ({ where }: { where: { id: string } }) => Promise.resolve(map[where.id] ?? null);
    }

    it('handleAddReaction pose la réaction sur la RACINE, pas sur le repost affiché', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockImplementation(byId({ [POST_ID]: repostAcl(), [ROOT_ID]: rootAcl() }));
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).toHaveBeenCalledWith({
        postId: ROOT_ID,
        userId: USER_ID,
        emoji: EMOJI,
      });
    });

    it('idempotence : réagir via deux reposts distincts du MÊME original cible la racine les deux fois', async () => {
      const socket = createMockSocket();
      const callback = jest.fn();

      mockValidate.mockImplementation((_schema: unknown, data: unknown) => ({ success: true, data }));
      mockPrisma.post.findFirst.mockImplementation(byId({
        [POST_ID]: repostAcl({ id: POST_ID }),
        [OTHER_REPOST_ID]: repostAcl({ id: OTHER_REPOST_ID }),
        [ROOT_ID]: rootAcl(),
      }));
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, { postId: POST_ID, emoji: EMOJI }, callback);
      await handler.handleAddReaction(socket as any, { postId: OTHER_REPOST_ID, emoji: EMOJI }, callback);

      expect(mockReactionService.addReaction).toHaveBeenNthCalledWith(1, { postId: ROOT_ID, userId: USER_ID, emoji: EMOJI });
      expect(mockReactionService.addReaction).toHaveBeenNthCalledWith(2, { postId: ROOT_ID, userId: USER_ID, emoji: EMOJI });
    });

    it('handleRemoveReaction retire la réaction posée sur la RACINE via un AUTRE repost du même original', async () => {
      const socket = createMockSocket();
      const callback = jest.fn();

      mockValidate.mockImplementation((_schema: unknown, data: unknown) => ({ success: true, data }));
      mockPrisma.post.findFirst.mockImplementation(byId({
        [POST_ID]: repostAcl({ id: POST_ID }),
        [OTHER_REPOST_ID]: repostAcl({ id: OTHER_REPOST_ID }),
        [ROOT_ID]: rootAcl(),
      }));
      mockReactionService.removeReaction.mockResolvedValue(true);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleRemoveReaction(socket as any, { postId: OTHER_REPOST_ID, emoji: EMOJI }, callback);

      expect(mockReactionService.removeReaction).toHaveBeenCalledWith({
        postId: ROOT_ID,
        userId: USER_ID,
        emoji: EMOJI,
      });
    });

    it('une CITATION garde sa vie sociale propre — addReaction cible la citation elle-même', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockImplementation(byId({
        [POST_ID]: repostAcl({ isQuote: true }),
        [ROOT_ID]: rootAcl(),
      }));
      mockReactionService.addReaction.mockResolvedValue(sampleReactionData);
      mockReactionService.createUpdateEvent.mockResolvedValue(sampleUpdateEvent);

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).toHaveBeenCalledWith({
        postId: POST_ID,
        userId: USER_ID,
        emoji: EMOJI,
      });
    });

    it('racine devenue invisible pour l’acteur → refus standard, jamais un crédit silencieux', async () => {
      const socket = createMockSocket();
      const data = { postId: POST_ID, emoji: EMOJI };
      const callback = jest.fn();

      mockValidate.mockReturnValue({ success: true, data });
      mockPrisma.post.findFirst.mockImplementation(byId({
        [POST_ID]: repostAcl(),
        [ROOT_ID]: rootAcl({ visibility: 'PRIVATE' }),
      }));

      await handler.handleAddReaction(socket as any, data, callback);

      expect(mockReactionService.addReaction).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
    });
  });
});
