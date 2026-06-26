/**
 * Additional coverage for ReactionHandler — uncovered branches:
 *  - Line 124: broadcastReactionEventWithConversationId .catch() callback
 *  - Line 127: _createReactionNotification .catch() callback
 *  - Lines 149-150: handleReactionRemove validation failure
 *  - Lines 171-173: handleReactionRemove participant not found
 *  - Lines 214-222: handleReactionRemove error catch
 *  - Lines 253-255: handleReactionSync participant not found
 *  - Line 326: _resolveParticipantId when message not found
 *  - Line 348: _createReactionNotification inner .catch()
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ===== MOCKS =====

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketReactionAddSchema: { safeParse: jest.fn() },
  SocketReactionRemoveSchema: { safeParse: jest.fn() },
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

jest.mock('../../../socketio/utils/socket-helpers', () => ({
  getConnectedUser: jest.fn(),
  normalizeConversationId: jest.fn<any>().mockResolvedValue('conv-normalized'),
}));

import { ReactionHandler } from '../../../socketio/handlers/ReactionHandler';
import { validateSocketEvent } from '../../../middleware/validation';
import { getConnectedUser, normalizeConversationId } from '../../../socketio/utils/socket-helpers';
import { notifyReactionAdded } from '../../../services/notifications/reactionNotify';

// ===== CONSTANTS =====

const USER_ID = '507f1f77bcf86cd799439001';
const PARTICIPANT_ID = 'participant-extra';
const MESSAGE_ID = '507f1f77bcf86cd799439002';
const CONV_ID = '507f1f77bcf86cd799439003';
const SOCKET_ID = 'socket-reaction-extra';
const EMOJI = '❤️';

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
    addReaction: jest.fn<any>().mockResolvedValue({ id: 'reaction-1', emoji: EMOJI }),
    removeReaction: jest.fn<any>().mockResolvedValue(true),
    getMessageReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ messageId: MESSAGE_ID }),
  };
}

function makeNotificationService(): any {
  return { createReactionNotification: jest.fn<any>().mockResolvedValue(null) };
}

function makePrisma(): any {
  return {
    message: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }) },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
      findUnique: jest.fn<any>().mockResolvedValue({ userId: USER_ID }),
    },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: CONV_ID }) },
  };
}

function makeSocketToUser(userId = USER_ID) {
  const map = new Map<string, string>();
  map.set(SOCKET_ID, userId);
  return map;
}

function makeConnectedUsers(userId = USER_ID) {
  const map = new Map<string, any>();
  map.set(userId, { id: userId, socketId: SOCKET_ID, isAnonymous: false, language: 'fr', userId });
  return map;
}

function makeHandler(overrides: Partial<{
  io: any; prisma: any; notificationService: any; reactionService: any;
  connectedUsers: any; socketToUser: any;
}> = {}) {
  return new ReactionHandler({
    io: makeIO(),
    prisma: makePrisma(),
    notificationService: makeNotificationService(),
    reactionService: makeReactionService(),
    connectedUsers: makeConnectedUsers(),
    socketToUser: makeSocketToUser(),
    ...overrides,
  });
}

describe('ReactionHandler — additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getConnectedUser as jest.Mock).mockReturnValue({
      user: { id: USER_ID, isAnonymous: false },
      realUserId: USER_ID,
    });
    (normalizeConversationId as jest.Mock).mockResolvedValue(CONV_ID);
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { messageId: MESSAGE_ID, emoji: EMOJI },
    });
    (notifyReactionAdded as jest.Mock).mockResolvedValue(undefined);
  });

  // ── handleReactionAdd — broadcast .catch() (line 124) ────────────────────

  it('does not propagate error when broadcast rejects after add', async () => {
    const handler = makeHandler();
    jest.spyOn(handler as any, '_broadcastReactionEventWithConversationId').mockRejectedValueOnce(new Error('broadcast err'));

    const socket = makeSocket();
    const callback = jest.fn();

    await handler.handleReactionAdd(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ── handleReactionAdd — notification .catch() (line 127) ─────────────────

  it('does not propagate error when notification rejects after add', async () => {
    const handler = makeHandler();
    jest.spyOn(handler as any, '_createReactionNotification').mockRejectedValueOnce(new Error('notif err'));

    const socket = makeSocket();
    const callback = jest.fn();

    await handler.handleReactionAdd(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ── _createReactionNotification — inner .catch() (line 348) ──────────────

  it('swallows notifyReactionAdded rejection in notification method', async () => {
    (notifyReactionAdded as jest.Mock).mockRejectedValueOnce(new Error('notify error'));
    const handler = makeHandler();

    const socket = makeSocket();
    const callback = jest.fn();

    await handler.handleReactionAdd(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, callback);
    await new Promise((resolve) => setImmediate(resolve));

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ── handleReactionRemove — validation failure (lines 149-150) ────────────

  it('handleReactionRemove calls callback with error on validation failure', async () => {
    const handler = makeHandler();
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({ success: false, error: 'remove schema error' });

    await handler.handleReactionRemove(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'remove schema error' });
  });

  // ── handleReactionRemove — participant not found (lines 171-173) ──────────

  it('handleReactionRemove returns error when participant cannot be resolved', async () => {
    const prisma = makePrisma();
    // message found, but participant not found
    prisma.participant.findFirst.mockResolvedValueOnce(null);

    const handler = makeHandler({ prisma });
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { messageId: MESSAGE_ID, emoji: EMOJI },
    });

    await handler.handleReactionRemove(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
  });

  // ── handleReactionRemove — error catch (lines 214-222) ───────────────────

  it('handleReactionRemove catches removeReaction service errors', async () => {
    const reactionService = makeReactionService();
    reactionService.removeReaction.mockRejectedValueOnce(new Error('remove DB error'));

    const handler = makeHandler({ reactionService });
    const socket = makeSocket();
    const callback = jest.fn();
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { messageId: MESSAGE_ID, emoji: EMOJI },
    });

    await handler.handleReactionRemove(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'remove DB error' });
  });

  // ── handleReactionSync — participant not found (lines 253-255) ───────────

  it('handleReactionSync returns error when participant cannot be resolved', async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValueOnce(null);

    const handler = makeHandler({ prisma });
    const socket = makeSocket();
    const callback = jest.fn();

    await handler.handleReactionSync(socket as any, MESSAGE_ID, callback);

    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
  });

  // ── _resolveParticipantId — message not found (line 326) ─────────────────

  it('_resolveParticipantId returns undefined when message does not exist', async () => {
    const prisma = makePrisma();
    prisma.message.findUnique.mockResolvedValueOnce(null);

    const handler = makeHandler({ prisma });
    const result = await (handler as any)._resolveParticipantId(
      { id: USER_ID, isAnonymous: false },
      USER_ID,
      false,
      MESSAGE_ID
    );

    expect(result).toBeUndefined();
  });
});
