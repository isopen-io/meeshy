/**
 * Unit tests for PostReactionHandler
 * Covers: handleAddReaction, handleRemoveReaction, handleRequestSync,
 * handleJoinPost, handleLeavePost — auth guard, anonymous guard, rate limit,
 * schema validation, service delegation, callback responses, and broadcast.
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

const mockCanUserViewPost = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../services/posts/postVisibility', () => ({
  canUserViewPost: (...args: unknown[]) => mockCanUserViewPost(...args),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    POST_REACTION_ADDED: 'post:reaction-added',
    POST_REACTION_REMOVED: 'post:reaction-removed',
  },
  ROOMS: {
    post: (id: string) => `post:${id}`,
    feed: (id: string) => `feed:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((schema: any, data: any) => ({ success: true, data })),
}));

const { validateSocketEvent } = require('../../../middleware/validation');

import { PostReactionHandler } from '../PostReactionHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Constants ───────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-xyz';
const USER_ID = 'user-456';
const POST_ID = '507f191e810c19729de860ea';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeSocket(id = SOCKET_ID): Socket {
  return {
    id,
    emit: jest.fn<any>(),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Socket;
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: POST_ID,
        authorId: 'author-1',
        type: 'POST',
        likeCount: 1,
        reactionSummary: {},
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
      }),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function makePostReactionService(overrides: Record<string, any> = {}) {
  return {
    addReaction: jest.fn<any>().mockResolvedValue({ id: 'reaction-1', emoji: '👍' }),
    removeReaction: jest.fn<any>().mockResolvedValue(true),
    getPostReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ postId: POST_ID }),
    ...overrides,
  };
}

function makeSocialEvents() {
  return {
    broadcastPostLiked: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
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
  users.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous, language: 'en', resolvedLanguages: ['en'] });
  return users;
}

function makeSocketToUser() {
  const m = new Map<string, string>();
  m.set(SOCKET_ID, USER_ID);
  return m;
}

function buildHandler(overrides: Record<string, any> = {}) {
  const notificationService = { createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined) } as any;
  const postReactionService = makePostReactionService(overrides.postReactionService);
  const prisma = makePrisma(overrides.prisma);
  const io = makeIo();
  const socialEvents = makeSocialEvents();
  const connectedUsers = overrides.connectedUsers ?? makeConnectedUsers();
  const socketToUser = overrides.socketToUser ?? makeSocketToUser();

  const handler = new PostReactionHandler({
    io: io as any,
    prisma,
    notificationService,
    postReactionService,
    socialEvents: socialEvents as any,
    connectedUsers,
    socketToUser,
  });
  return { handler, prisma, postReactionService, io, socialEvents, connectedUsers, socketToUser };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PostReactionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRateLimiterCheckLimit?.mockResolvedValue(true);
    mockCanUserViewPost.mockResolvedValue(true);
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

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when schema validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'Invalid emoji' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Invalid emoji' }));
    });

    it('returns error when user is anonymous', async () => {
      const { handler } = buildHandler({ connectedUsers: makeConnectedUsers(true) });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Only registered users can react' }));
    });

    it('returns error when rate limit is exceeded', async () => {
      const { handler } = buildHandler();
      mockRateLimiterCheckLimit.mockResolvedValue(false);
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    });

    it('returns error when addReaction returns null', async () => {
      const { handler } = buildHandler({
        postReactionService: { addReaction: jest.fn<any>().mockResolvedValue(null), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('calls callback with success and broadcasts on happy path (non-heart emoji)', async () => {
      const { handler, io } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalled();
    });

    it('delegates to socialEvents.broadcastPostLiked for heart emoji on POST', async () => {
      const { handler, socialEvents } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '❤️' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(socialEvents.broadcastPostLiked).toHaveBeenCalledWith(
        expect.objectContaining({ postId: POST_ID, emoji: '❤️' }),
        'author-1',
        'PUBLIC',
        []
      );
    });

    it('returns error on service exception without crashing', async () => {
      const { handler } = buildHandler({
        postReactionService: {
          addReaction: jest.fn<any>().mockRejectedValue(new Error('db timeout')),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'db timeout' }));
    });
  });

  // ── handleRemoveReaction ──────────────────────────────────────────────────

  describe('handleRemoveReaction', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when user is anonymous', async () => {
      const { handler } = buildHandler({ connectedUsers: makeConnectedUsers(true) });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Only registered users can react' }));
    });

    it('returns error when removeReaction returns false', async () => {
      const { handler } = buildHandler({
        postReactionService: { removeReaction: jest.fn<any>().mockResolvedValue(false), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Reaction not found' }));
    });

    it('calls callback with success and broadcasts on happy path', async () => {
      const { handler, io } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalled();
    });
  });

  // ── handleRequestSync ─────────────────────────────────────────────────────

  describe('handleRequestSync', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns success with reaction data on happy path', async () => {
      const reactions = [{ emoji: '👍', count: 5, hasReacted: false }];
      const { handler } = buildHandler({
        postReactionService: { getPostReactions: jest.fn<any>().mockResolvedValue(reactions), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: reactions });
    });
  });

  // ── handleJoinPost ────────────────────────────────────────────────────────

  describe('handleJoinPost', () => {
    it('returns error when schema validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'Missing postId' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(makeSocket(), { postId: '' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Missing postId' }));
    });

    it('returns error when post is not found', async () => {
      const { handler } = buildHandler({
        prisma: { post: { findUnique: jest.fn<any>().mockResolvedValue(null) } },
      });
      const callback = jest.fn<any>();

      await handler.handleJoinPost(makeSocket(), { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Post not found' }));
    });

    it('returns error when user cannot view post', async () => {
      mockCanUserViewPost.mockResolvedValueOnce(false);
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(makeSocket(), { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Forbidden' }));
    });

    it('calls socket.join and returns success on happy path', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(socket, { postId: POST_ID }, callback);

      expect(socket.join).toHaveBeenCalledWith(`post:${POST_ID}`);
      expect(callback).toHaveBeenCalledWith({ success: true });
    });
  });

  // ── handleLeavePost ───────────────────────────────────────────────────────

  describe('handleLeavePost', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleLeavePost(makeSocket(), { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('calls socket.leave and returns success on happy path', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleLeavePost(socket, { postId: POST_ID }, callback);

      expect(socket.leave).toHaveBeenCalledWith(`post:${POST_ID}`);
      expect(callback).toHaveBeenCalledWith({ success: true });
    });
  });
});
