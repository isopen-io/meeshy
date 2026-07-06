/**
 * Unit tests for CommentReactionHandler
 * Covers: handleAddReaction, handleRemoveReaction, handleRequestSync —
 * auth guard, schema validation, anonymous guard, rate limiting,
 * service delegation, callback responses, and broadcast side-effects.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CommentReactionHandler } from '../CommentReactionHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    COMMENT_REACTION_ADDED: 'comment:reaction-added',
    COMMENT_REACTION_REMOVED: 'comment:reaction-removed',
  },
  ROOMS: {
    post: (id: string) => `post:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((schema: unknown, data: unknown) => ({ success: true, data })),
}));

// var (not const/let) avoids TDZ when jest hoists the mock factory before imports.
// The factory assigns the shared object so that the module-level singleton created
// inside CommentReactionHandler.ts gets the same reference we can mutate in tests.
var rateLimiterMockObj: { checkLimit: jest.MockedFunction<() => Promise<boolean>> };
jest.mock('../../../utils/socket-rate-limiter', () => {
  rateLimiterMockObj = { checkLimit: jest.fn<() => Promise<boolean>>().mockResolvedValue(true) };
  return { SocketRateLimiter: jest.fn(() => rateLimiterMockObj) };
});

jest.mock('../../../services/posts/postVisibility', () => ({
  canUserViewPost: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
}));

const { validateSocketEvent } = require('../../../middleware/validation');

// ─── Constants ───────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-comment-abc';
const USER_ID = 'user-comment-123';
const COMMENT_ID = '507f191e810c19729de860ea';
const POST_ID = '507f191e810c19729de860eb';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeSocket(id = SOCKET_ID): Socket {
  return {
    id,
    emit: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Socket;
}

function makePrisma(overrides: Record<string, any> = {}): PrismaClient {
  return {
    postComment: {
      findUnique: jest.fn<any>().mockResolvedValue({
        authorId: 'comment-author-1',
        content: 'Great post!',
      }),
    },
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({
        type: 'POST',
        author: { displayName: 'Post Author', username: 'postauthor' },
      }),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function makeCommentReactionService(overrides: Record<string, any> = {}) {
  return {
    addReaction: jest.fn<any>().mockResolvedValue({ id: 'reaction-1', emoji: '👍' }),
    removeReaction: jest.fn<any>().mockResolvedValue(true),
    getCommentReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({
      commentId: COMMENT_ID,
      postId: POST_ID,
      userId: USER_ID,
      emoji: '👍',
      action: 'add',
    }),
    ...overrides,
  };
}

function makeNotificationService() {
  return {
    createCommentReactionNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makeIo() {
  const emit = jest.fn<any>();
  return {
    to: jest.fn<any>().mockReturnValue({ emit }),
    _emit: emit,
  };
}

function makeConnectedUsers() {
  const users = new Map<string, any>();
  users.set(USER_ID, {
    id: USER_ID,
    socketId: SOCKET_ID,
    isAnonymous: false,
    language: 'fr',
  });
  return users;
}

function makeSocketToUser() {
  const m = new Map<string, string>();
  m.set(SOCKET_ID, USER_ID);
  return m;
}

function buildHandler(overrides: Record<string, any> = {}) {
  const notificationService = overrides.notificationService ?? makeNotificationService();
  const commentReactionService = makeCommentReactionService(overrides.commentReactionService);
  const prisma = makePrisma(overrides.prisma);
  const io = makeIo();
  const connectedUsers = overrides.connectedUsers ?? makeConnectedUsers();
  const socketToUser = overrides.socketToUser ?? makeSocketToUser();

  const handler = new CommentReactionHandler({
    io: io as any,
    prisma,
    notificationService: notificationService as any,
    commentReactionService: commentReactionService as any,
    connectedUsers,
    socketToUser,
  });

  return { handler, prisma, commentReactionService, notificationService, io, connectedUsers, socketToUser };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CommentReactionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiterMockObj.checkLimit.mockReset();
    rateLimiterMockObj.checkLimit.mockResolvedValue(true);
    (validateSocketEvent as jest.Mock<any>).mockImplementation((_schema: unknown, data: unknown) => ({
      success: true,
      data,
    }));
  });

  // ── handleAddReaction ────────────────────────────────────────────────────

  describe('handleAddReaction', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns error when schema validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'emoji is required' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'emoji is required' });
    });

    it('returns error for anonymous users (comments require registered users)', async () => {
      const anonymousUsers = new Map<string, any>();
      anonymousUsers.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: true, language: 'fr' });
      const { handler } = buildHandler({ connectedUsers: anonymousUsers });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Only registered users can react' }));
    });

    it('returns error when rate limit is exceeded', async () => {
      rateLimiterMockObj.checkLimit.mockResolvedValueOnce(false);
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    });

    it('returns error when addReaction returns null', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>().mockResolvedValue(null),
          createUpdateEvent: jest.fn<any>().mockResolvedValue({}),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('calls callback with success and broadcasts updateEvent on happy path', async () => {
      const updateEvent = { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍', action: 'add' };
      const { handler, io } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>().mockResolvedValue({ id: 'r1', emoji: '👍' }),
          createUpdateEvent: jest.fn<any>().mockResolvedValue(updateEvent),
          getCommentReactions: jest.fn<any>().mockResolvedValue([]),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: updateEvent });
      expect(io.to).toHaveBeenCalledWith(`post:${POST_ID}`);
    });

    it('ACK payload matches broadcast payload (updateEvent contract)', async () => {
      const updateEvent = { commentId: COMMENT_ID, postId: POST_ID, emoji: '🎉', action: 'add', aggregation: {} };
      const { handler, io } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>().mockResolvedValue({ id: 'r2', emoji: '🎉' }),
          createUpdateEvent: jest.fn<any>().mockResolvedValue(updateEvent),
          getCommentReactions: jest.fn<any>().mockResolvedValue([]),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '🎉' }, callback);

      const [ackArg] = (callback as jest.Mock<any>).mock.calls[0] as [{ data: unknown }];
      const broadcastEmit = io.to.mock.results[0].value.emit;
      const [, broadcastPayload] = (broadcastEmit as jest.Mock<any>).mock.calls[0] as [string, unknown];
      expect(ackArg.data).toEqual(broadcastPayload);
    });

    it('calls createUpdateEvent with correct arguments', async () => {
      const { handler, commentReactionService } = buildHandler();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '❤️' }, jest.fn());

      expect(commentReactionService.createUpdateEvent).toHaveBeenCalledWith(
        COMMENT_ID,
        '❤️',
        'add',
        USER_ID,
        POST_ID
      );
    });

    it('returns error on service exception (Error instance)', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>().mockRejectedValue(new Error('db timeout')),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'db timeout' }));
    });

    it('returns generic error message when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>().mockRejectedValue('plain string'),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('does not throw when no callback provided', async () => {
      const { handler } = buildHandler();

      await expect(handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' })).resolves.toBeUndefined();
    });

    it('swallows notification rejection without propagating to caller', async () => {
      const failingNotificationService = {
        createCommentReactionNotification: jest.fn<any>().mockRejectedValue(new Error('push service down')),
      };
      const { handler } = buildHandler({ notificationService: failingNotificationService });
      const callback = jest.fn<any>();

      await expect(handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback)).resolves.toBeUndefined();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ── handleRemoveReaction ─────────────────────────────────────────────────

  describe('handleRemoveReaction', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns schema error when validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'commentId required' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: '', postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'commentId required' });
    });

    it('returns error for anonymous users', async () => {
      const anonymousUsers = new Map<string, any>();
      anonymousUsers.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: true });
      const { handler } = buildHandler({ connectedUsers: anonymousUsers });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Only registered users can react' }));
    });

    it('returns error when removeReaction returns false (reaction not found)', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          removeReaction: jest.fn<any>().mockResolvedValue(false),
          createUpdateEvent: jest.fn<any>().mockResolvedValue({}),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Reaction not found' }));
    });

    it('broadcasts removal and calls callback with updateEvent on happy path', async () => {
      const updateEvent = { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍', action: 'remove' };
      const { handler, io } = buildHandler({
        commentReactionService: {
          removeReaction: jest.fn<any>().mockResolvedValue(true),
          createUpdateEvent: jest.fn<any>().mockResolvedValue(updateEvent),
          addReaction: jest.fn<any>(),
          getCommentReactions: jest.fn<any>().mockResolvedValue([]),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: updateEvent });
      expect(io.to).toHaveBeenCalledWith(`post:${POST_ID}`);
    });

    it('calls createUpdateEvent with remove action', async () => {
      const { handler, commentReactionService } = buildHandler();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '❤️' }, jest.fn());

      expect(commentReactionService.createUpdateEvent).toHaveBeenCalledWith(
        COMMENT_ID,
        '❤️',
        'remove',
        USER_ID,
        POST_ID
      );
    });

    it('returns error on service exception (Error instance)', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          removeReaction: jest.fn<any>().mockRejectedValue(new Error('remove failed')),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'remove failed' }));
    });

    it('returns generic error when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          removeReaction: jest.fn<any>().mockRejectedValue(42),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to remove reaction' }));
    });

    it('does not throw when no callback provided on error', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          removeReaction: jest.fn<any>().mockRejectedValue(new Error('boom')),
          createUpdateEvent: jest.fn<any>(),
        },
      });

      await expect(handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' })).resolves.toBeUndefined();
    });
  });

  // ── handleRequestSync ────────────────────────────────────────────────────

  describe('handleRequestSync', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns success with reaction list on happy path', async () => {
      const reactions = [{ emoji: '👍', count: 3, userReacted: true }];
      const { handler } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>(),
          removeReaction: jest.fn<any>(),
          getCommentReactions: jest.fn<any>().mockResolvedValue(reactions),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: reactions });
    });

    it('calls getCommentReactions with commentId and current userId', async () => {
      const { handler, commentReactionService } = buildHandler();

      await handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID }, jest.fn());

      expect(commentReactionService.getCommentReactions).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: COMMENT_ID, currentUserId: USER_ID })
      );
    });

    it('returns error on service exception', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>(),
          removeReaction: jest.fn<any>(),
          getCommentReactions: jest.fn<any>().mockRejectedValue(new Error('sync failed')),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'sync failed' }));
    });

    it('returns generic error when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>(),
          removeReaction: jest.fn<any>(),
          getCommentReactions: jest.fn<any>().mockRejectedValue('plain string'),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to sync reactions' }));
    });

    it('does not throw when no callback provided on error', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>(),
          removeReaction: jest.fn<any>(),
          getCommentReactions: jest.fn<any>().mockRejectedValue(new Error('boom')),
          createUpdateEvent: jest.fn<any>(),
        },
      });

      await expect(handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID })).resolves.toBeUndefined();
    });
  });
});
