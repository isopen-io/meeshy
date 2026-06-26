/**
 * Additional coverage for PostReactionHandler — uncovered branches:
 *  - Line 115: broadcastPostUnliked (❤️ remove on POST/REEL)
 *  - Lines 178-183: handleAddReaction when addReaction returns null
 *  - Lines 205, 207: fire-and-forget .catch() callbacks
 *  - Lines 229-230: handleRemoveReaction validation failure
 *  - Lines 250-255: handleRemoveReaction anonymous user
 *  - Lines 296-303: handleRemoveReaction error catch
 *  - Lines 340-345: handleRequestSync error catch
 *  - Lines 393-398: handleJoinPost error catch
 *  - Lines 428-433: handleLeavePost error catch
 *  - Line 461: .catch() in _createPostReactionNotification
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ===== MOCKS =====

jest.mock('../../../services/PostReactionService', () => ({
  PostReactionService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketPostReactionAddSchema: { safeParse: jest.fn() },
  SocketPostReactionRemoveSchema: { safeParse: jest.fn() },
  SocketPostRoomActionSchema: { safeParse: jest.fn() },
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
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
  },
}));

jest.mock('../../../services/posts/postVisibility', () => ({
  canUserViewPost: jest.fn<any>().mockResolvedValue(true),
}));

import { PostReactionHandler } from '../../../socketio/handlers/PostReactionHandler';
import { validateSocketEvent } from '../../../middleware/validation';

// ===== CONSTANTS =====

const POST_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439033';
const SOCKET_ID = 'socket-extra-111';
const EMOJI = '👍';

// ===== FACTORIES =====

function makeSocket() {
  return { id: SOCKET_ID, emit: jest.fn(), join: jest.fn(), leave: jest.fn() };
}

function makeIO() {
  const emitFn = jest.fn();
  return { to: jest.fn().mockReturnValue({ emit: emitFn }), emit: emitFn, _toEmit: emitFn };
}

function makeReactionService(): any {
  return {
    addReaction: jest.fn<any>().mockResolvedValue(null),
    removeReaction: jest.fn<any>().mockResolvedValue(null),
    getPostReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ postId: POST_ID }),
  };
}

function makeNotificationService(): any {
  return {
    createPostLikeNotification: jest.fn<any>().mockResolvedValue(null),
  };
}

function makePrisma(): any {
  return {
    post: { findUnique: jest.fn<any>().mockResolvedValue({
      id: POST_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
      deletedAt: null, type: 'POST', likeCount: 5, reactionSummary: { '❤️': 5 },
    }) },
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

function makeSocialEvents(): any {
  return {
    broadcastPostLiked: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makeHandler(overrides: Partial<{
  io: any; prisma: any; notificationService: any; postReactionService: any;
  connectedUsers: any; socketToUser: any; socialEvents: any;
}> = {}) {
  return new PostReactionHandler({
    io: makeIO(),
    prisma: makePrisma(),
    notificationService: makeNotificationService(),
    postReactionService: makeReactionService(),
    connectedUsers: makeConnectedUsers(),
    socketToUser: makeSocketToUser(),
    socialEvents: makeSocialEvents(),
    ...overrides,
  });
}

describe('PostReactionHandler — additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
  });

  // ── handleAddReaction — reaction is null (lines 178-183) ─────────────────

  it('calls callback with error when addReaction returns null', async () => {
    const reactionService = makeReactionService();
    reactionService.addReaction.mockResolvedValueOnce(null);
    const handler = makeHandler({ postReactionService: reactionService });

    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID, emoji: EMOJI } });

    await handler.handleAddReaction(socket as any, { postId: POST_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Failed to add reaction' });
  });

  // ── broadcastReactionChange — ❤️ remove on POST type (line 115) ──────────

  it('calls broadcastPostUnliked when ❤️ is removed from a POST', async () => {
    const socialEvents = makeSocialEvents();
    const reactionService = makeReactionService();
    reactionService.removeReaction.mockResolvedValueOnce(true);
    reactionService.createUpdateEvent.mockResolvedValueOnce({ postId: POST_ID, emoji: '❤️', action: 'remove' });

    const handler = makeHandler({ socialEvents, postReactionService: reactionService });

    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID, emoji: '❤️' } });

    await handler.handleRemoveReaction(socket as any, { postId: POST_ID, emoji: '❤️' }, callback);

    // Wait for the fire-and-forget broadcast
    await new Promise((resolve) => setImmediate(resolve));

    expect(socialEvents.broadcastPostUnliked).toHaveBeenCalledWith(
      expect.objectContaining({ postId: POST_ID, emoji: '❤️' }),
      expect.any(String),
      expect.anything(),
      expect.anything(),
    );
  });

  // ── handleAddReaction — broadcastReactionChange fire-and-forget catch (line 205) ──

  it('does not propagate error when broadcastReactionChange rejects', async () => {
    const reactionService = makeReactionService();
    reactionService.addReaction.mockResolvedValueOnce({ id: 'r-1' });
    reactionService.createUpdateEvent.mockResolvedValueOnce({ postId: POST_ID });

    const handler = makeHandler({ postReactionService: reactionService });
    jest.spyOn(handler as any, 'broadcastReactionChange').mockRejectedValueOnce(new Error('broadcast error'));

    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID, emoji: EMOJI } });

    await handler.handleAddReaction(socket as any, { postId: POST_ID, emoji: EMOJI }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    // Callback still succeeded — error was swallowed
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ── handleAddReaction — _createPostReactionNotification fire-and-forget catch (line 207) ──

  it('does not propagate error when _createPostReactionNotification rejects', async () => {
    const reactionService = makeReactionService();
    reactionService.addReaction.mockResolvedValueOnce({ id: 'r-2' });
    reactionService.createUpdateEvent.mockResolvedValueOnce({ postId: POST_ID });

    const handler = makeHandler({ postReactionService: reactionService });
    jest.spyOn(handler as any, '_createPostReactionNotification').mockRejectedValueOnce(new Error('notif error'));

    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID, emoji: EMOJI } });

    await handler.handleAddReaction(socket as any, { postId: POST_ID, emoji: EMOJI }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ── handleAddReaction — _createPostReactionNotification inner .catch (line 461) ──

  it('swallows createPostLikeNotification rejection in notification method', async () => {
    const notificationService = makeNotificationService();
    notificationService.createPostLikeNotification.mockRejectedValueOnce(new Error('notif service error'));

    const reactionService = makeReactionService();
    reactionService.addReaction.mockResolvedValueOnce({ id: 'r-3' });
    reactionService.createUpdateEvent.mockResolvedValueOnce({ postId: POST_ID });

    const handler = makeHandler({ postReactionService: reactionService, notificationService });

    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID, emoji: EMOJI } });

    await handler.handleAddReaction(socket as any, { postId: POST_ID, emoji: EMOJI }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    // Does not crash; callback was success
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ── handleRemoveReaction — validation failure (lines 229-230) ────────────

  it('handleRemoveReaction calls callback with error on validation failure', async () => {
    const handler = makeHandler();
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: false, error: 'Bad schema' });

    await handler.handleRemoveReaction(socket as any, { postId: POST_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Bad schema' });
  });

  // ── handleRemoveReaction — anonymous user (lines 250-255) ────────────────

  it('handleRemoveReaction rejects anonymous users', async () => {
    const handler = makeHandler({
      connectedUsers: makeConnectedUsers(USER_ID, true),
    });
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID, emoji: EMOJI } });

    await handler.handleRemoveReaction(socket as any, { postId: POST_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Only registered users can react' });
  });

  // ── handleRemoveReaction — error catch (lines 296-303) ───────────────────

  it('handleRemoveReaction catches service errors', async () => {
    const reactionService = makeReactionService();
    reactionService.removeReaction.mockRejectedValueOnce(new Error('DB error'));

    const handler = makeHandler({ postReactionService: reactionService });
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID, emoji: EMOJI } });

    await handler.handleRemoveReaction(socket as any, { postId: POST_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'DB error' });
  });

  // ── handleRequestSync — error catch (lines 340-345) ──────────────────────

  it('handleRequestSync catches service errors', async () => {
    const reactionService = makeReactionService();
    reactionService.getPostReactions.mockRejectedValueOnce(new Error('sync error'));

    const handler = makeHandler({ postReactionService: reactionService });
    const socket = makeSocket();
    const callback = jest.fn();

    await handler.handleRequestSync(socket as any, { postId: POST_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'sync error' });
  });

  // ── handleJoinPost — error catch (lines 393-398) ─────────────────────────

  it('handleJoinPost catches prisma errors', async () => {
    const prisma = makePrisma();
    prisma.post.findUnique.mockRejectedValueOnce(new Error('join error'));

    const handler = makeHandler({ prisma });
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID } });

    await handler.handleJoinPost(socket as any, { postId: POST_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'join error' });
  });

  // ── handleLeavePost — error catch (lines 428-433) ────────────────────────

  it('handleLeavePost catches socket leave errors', async () => {
    const handler = makeHandler();
    const socket = { ...makeSocket(), leave: jest.fn(() => { throw new Error('leave error'); }) };
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: true, data: { postId: POST_ID } });

    await handler.handleLeavePost(socket as any, { postId: POST_ID }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'leave error' });
  });
});
