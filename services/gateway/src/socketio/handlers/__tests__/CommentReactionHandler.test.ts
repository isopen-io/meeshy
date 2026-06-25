/**
 * Unit tests for CommentReactionHandler
 * Covers: handleAddReaction, handleRemoveReaction, handleRequestSync —
 * auth guard, anonymous guard, rate limit, schema validation,
 * service delegation, callback responses, and broadcast side-effects.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ───────────────────────────────────────────────────────────────────

let mockRateLimiterCheckLimit: jest.Mock<any>;

jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => {
    mockRateLimiterCheckLimit = jest.fn<any>().mockResolvedValue(true);
    return { checkLimit: mockRateLimiterCheckLimit };
  }),
}));

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
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((schema: any, data: any) => ({ success: true, data })),
}));

jest.mock('../../../services/posts/postVisibility', () => ({
  canUserViewPost: jest.fn<any>().mockResolvedValue(true),
}));

const { validateSocketEvent } = require('../../../middleware/validation');

import { CommentReactionHandler } from '../CommentReactionHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Constants ───────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-comment-1';
const USER_ID = 'user-comment-1';
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

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    postComment: {
      findUnique: jest.fn<any>().mockResolvedValue({ authorId: 'comment-author-1', content: 'Nice post' }),
    },
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({
        type: 'POST',
        author: { displayName: 'Author Name', username: 'authorname' },
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
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ commentId: COMMENT_ID }),
    ...overrides,
  };
}

function makeIo() {
  const emit = jest.fn<any>();
  return {
    to: jest.fn<any>().mockReturnValue({ emit }),
    _emit: emit,
  };
}

function makeConnectedUsers(isAnonymous = false) {
  const users = new Map<string, any>();
  users.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous, language: 'fr', resolvedLanguages: ['fr'] });
  return users;
}

function makeSocketToUser() {
  const m = new Map<string, string>();
  m.set(SOCKET_ID, USER_ID);
  return m;
}

function buildHandler(overrides: Record<string, any> = {}) {
  const notificationService = { createCommentReactionNotification: jest.fn<any>().mockResolvedValue(undefined) } as any;
  const commentReactionService = makeCommentReactionService(overrides.commentReactionService);
  const prisma = makePrisma(overrides.prisma);
  const io = makeIo();
  const connectedUsers = overrides.connectedUsers ?? makeConnectedUsers();
  const socketToUser = overrides.socketToUser ?? makeSocketToUser();

  const handler = new CommentReactionHandler({
    io: io as any,
    prisma,
    notificationService,
    commentReactionService,
    connectedUsers,
    socketToUser,
  });
  return { handler, prisma, commentReactionService, io, connectedUsers, socketToUser };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CommentReactionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRateLimiterCheckLimit?.mockResolvedValue(true);
    (validateSocketEvent as jest.Mock<any>).mockImplementation((_schema: any, data: any) => ({
      success: true,
      data,
    }));
  });

  // ── handleAddReaction ─────────────────────────────────────────────────────

  describe('handleAddReaction', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when schema validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'Invalid payload' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: '', postId: POST_ID, emoji: '' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Invalid payload' }));
    });

    it('returns error when user is anonymous', async () => {
      const { handler } = buildHandler({ connectedUsers: makeConnectedUsers(true) });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Only registered users can react' }));
    });

    it('returns error when rate limit is exceeded', async () => {
      const { handler } = buildHandler();
      mockRateLimiterCheckLimit.mockResolvedValue(false);
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    });

    it('returns error when addReaction returns null', async () => {
      const { handler } = buildHandler({
        commentReactionService: { addReaction: jest.fn<any>().mockResolvedValue(null), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('calls callback with success and broadcasts to post room on happy path', async () => {
      const { handler, io } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalledWith(`post:${POST_ID}`);
    });

    it('calls commentReactionService.addReaction with commentId, postId, and userId', async () => {
      const { handler, commentReactionService } = buildHandler();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '❤️' }, jest.fn());

      expect(commentReactionService.addReaction).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: COMMENT_ID, emoji: '❤️', userId: USER_ID })
      );
    });

    it('returns error on service exception without crashing', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          addReaction: jest.fn<any>().mockRejectedValue(new Error('connection refused')),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'connection refused' }));
    });
  });

  // ── handleRemoveReaction ──────────────────────────────────────────────────

  describe('handleRemoveReaction', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when user is anonymous', async () => {
      const { handler } = buildHandler({ connectedUsers: makeConnectedUsers(true) });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Only registered users can react' }));
    });

    it('returns error when removeReaction returns false (reaction not found)', async () => {
      const { handler } = buildHandler({
        commentReactionService: { removeReaction: jest.fn<any>().mockResolvedValue(false), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Reaction not found' }));
    });

    it('calls callback with success and broadcasts to post room on happy path', async () => {
      const { handler, io } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { commentId: COMMENT_ID, postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalledWith(`post:${POST_ID}`);
    });
  });

  // ── handleRequestSync ─────────────────────────────────────────────────────

  describe('handleRequestSync', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns success with reactions on happy path', async () => {
      const reactions = [{ emoji: '❤️', count: 2, hasReacted: true }];
      const { handler } = buildHandler({
        commentReactionService: {
          getCommentReactions: jest.fn<any>().mockResolvedValue(reactions),
          addReaction: jest.fn(),
          removeReaction: jest.fn(),
          createUpdateEvent: jest.fn(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: reactions });
    });

    it('returns error on service exception', async () => {
      const { handler } = buildHandler({
        commentReactionService: {
          getCommentReactions: jest.fn<any>().mockRejectedValue(new Error('query timeout')),
          addReaction: jest.fn(),
          removeReaction: jest.fn(),
          createUpdateEvent: jest.fn(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { commentId: COMMENT_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'query timeout' }));
    });
  });
});
