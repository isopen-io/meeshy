/**
 * Additional coverage for CommentReactionHandler — uncovered branches:
 *  - Lines 123-128: handleAddReaction when addReaction returns null
 *  - Line 152: fire-and-forget .catch() for notification
 *  - Lines 174-175: handleRemoveReaction validation failure
 *  - Lines 195-200: handleRemoveReaction anonymous user
 *  - Lines 243-248: handleRemoveReaction error catch
 *  - Lines 285-290: handleRequestSync error catch
 *  - Lines 340-352: _createCommentReactionNotification .catch() + _canUserViewPost wrapper
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ===== MOCKS =====

jest.mock('../../../services/CommentReactionService', () => ({
  CommentReactionService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketCommentReactionAddSchema: { safeParse: jest.fn() },
  SocketCommentReactionRemoveSchema: { safeParse: jest.fn() },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: any) => !r.success),
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
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  })),
  SOCKET_RATE_LIMITS: {},
}));

jest.mock('../../../services/posts/postVisibility', () => ({
  canUserViewPost: jest.fn<any>().mockResolvedValue(true),
}));

import { CommentReactionHandler } from '../../../socketio/handlers/CommentReactionHandler';
import { validateSocketEvent } from '../../../middleware/validation';
import { canUserViewPost } from '../../../services/posts/postVisibility';

// ===== CONSTANTS =====

const COMMENT_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439033';
const SOCKET_ID = 'socket-comment-extra';
const EMOJI = '👍';

// ===== FACTORIES =====

function makeSocket() {
  return { id: SOCKET_ID, emit: jest.fn(), join: jest.fn(), leave: jest.fn() };
}

function makeIO() {
  const emitFn = jest.fn();
  return { to: jest.fn().mockReturnValue({ emit: emitFn }), emit: emitFn };
}

function makeReactionService(): any {
  return {
    addReaction: jest.fn<any>().mockResolvedValue(null),
    removeReaction: jest.fn<any>().mockResolvedValue(null),
    getCommentReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ commentId: COMMENT_ID }),
  };
}

function makeNotificationService(): any {
  return {
    createCommentReactionNotification: jest.fn<any>().mockResolvedValue(null),
  };
}

function makePrisma(): any {
  return {
    postComment: {
      findUnique: jest.fn<any>().mockResolvedValue({ authorId: 'author-1', content: 'hello' }),
    },
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({
        type: 'POST',
        author: { displayName: 'Alice', username: 'alice' },
        id: POST_ID,
        authorId: 'author-1',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
      }),
    },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
}

function makeConnectedUsers(userId = USER_ID, isAnonymous = false) {
  const map = new Map<string, any>();
  map.set(userId, { id: userId, socketId: SOCKET_ID, isAnonymous, language: 'fr', userId });
  return map;
}

function makeSocketToUser(userId = USER_ID) {
  const map = new Map<string, string>();
  map.set(SOCKET_ID, userId);
  return map;
}

function makeHandler(overrides: Partial<{
  io: any; prisma: any; notificationService: any; commentReactionService: any;
  connectedUsers: any; socketToUser: any;
}> = {}) {
  return new CommentReactionHandler({
    io: makeIO(),
    prisma: makePrisma(),
    notificationService: makeNotificationService(),
    commentReactionService: makeReactionService(),
    connectedUsers: makeConnectedUsers(),
    socketToUser: makeSocketToUser(),
    ...overrides,
  });
}

describe('CommentReactionHandler — additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    (canUserViewPost as jest.Mock).mockResolvedValue(true);
  });

  // ── handleAddReaction — addReaction returns null (lines 123-128) ──────────

  it('calls callback with error when addReaction returns null', async () => {
    const reactionService = makeReactionService();
    reactionService.addReaction.mockResolvedValueOnce(null);
    const handler = makeHandler({ commentReactionService: reactionService });

    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI },
    });

    await handler.handleAddReaction(socket as any, { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Failed to add reaction' });
  });

  // ── handleAddReaction — notification fire-and-forget .catch() (line 152) ──

  it('does not propagate error when notification method rejects', async () => {
    const reactionService = makeReactionService();
    reactionService.addReaction.mockResolvedValueOnce({ id: 'r-1' });
    reactionService.createUpdateEvent.mockResolvedValueOnce({ commentId: COMMENT_ID });

    const handler = makeHandler({ commentReactionService: reactionService });
    jest.spyOn(handler as any, '_createCommentReactionNotification').mockRejectedValueOnce(new Error('notif err'));

    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI },
    });

    await handler.handleAddReaction(socket as any, { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ── _createCommentReactionNotification — inner .catch() (line 340) ────────

  it('swallows createCommentReactionNotification rejection', async () => {
    const notificationService = makeNotificationService();
    notificationService.createCommentReactionNotification.mockRejectedValueOnce(new Error('notif service error'));

    const reactionService = makeReactionService();
    reactionService.addReaction.mockResolvedValueOnce({ id: 'r-2' });
    reactionService.createUpdateEvent.mockResolvedValueOnce({ commentId: COMMENT_ID });

    const handler = makeHandler({ commentReactionService: reactionService, notificationService });

    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI },
    });

    await handler.handleAddReaction(socket as any, { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ── _canUserViewPost wrapper (lines 344-352) ──────────────────────────────

  it('_canUserViewPost delegates to canUserViewPost', async () => {
    const handler = makeHandler();
    (canUserViewPost as jest.Mock).mockResolvedValueOnce(false);

    const post = { authorId: 'author-1', visibility: 'PRIVATE' as any, visibilityUserIds: [] };
    const result = await (handler as any)._canUserViewPost(post, 'user-1');

    expect(result).toBe(false);
    expect(canUserViewPost).toHaveBeenCalledWith(expect.anything(), post, 'user-1');
  });

  // ── handleRemoveReaction — validation failure (lines 174-175) ────────────

  it('handleRemoveReaction calls callback with error on validation failure', async () => {
    const handler = makeHandler();
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: false, error: 'Bad remove schema' });

    await handler.handleRemoveReaction(socket as any, { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Bad remove schema' });
  });

  // ── handleRemoveReaction — anonymous user (lines 195-200) ────────────────

  it('handleRemoveReaction rejects anonymous users', async () => {
    const handler = makeHandler({ connectedUsers: makeConnectedUsers(USER_ID, true) });
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI },
    });

    await handler.handleRemoveReaction(socket as any, { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Only registered users can react' });
  });

  // ── handleRemoveReaction — error catch (lines 243-248) ───────────────────

  it('handleRemoveReaction catches service errors', async () => {
    const reactionService = makeReactionService();
    reactionService.removeReaction.mockRejectedValueOnce(new Error('remove DB error'));

    const handler = makeHandler({ commentReactionService: reactionService });
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI },
    });

    await handler.handleRemoveReaction(socket as any, { commentId: COMMENT_ID, postId: POST_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'remove DB error' });
  });

  // ── handleRequestSync — error catch (lines 285-290) ──────────────────────

  it('handleRequestSync catches service errors', async () => {
    const reactionService = makeReactionService();
    reactionService.getCommentReactions.mockRejectedValueOnce(new Error('sync DB error'));

    const handler = makeHandler({ commentReactionService: reactionService });
    const socket = makeSocket();
    const callback = jest.fn();

    await handler.handleRequestSync(socket as any, { commentId: COMMENT_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'sync DB error' });
  });
});
