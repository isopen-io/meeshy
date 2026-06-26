/**
 * Unit tests for ReactionHandler
 * Covers: handleReactionAdd, handleReactionRemove, handleReactionSync —
 * auth guard, schema validation, participant resolution, service delegation,
 * callback responses, and broadcast side-effects.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ReactionHandler } from '../ReactionHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    REACTION_ADDED: 'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((schema: any, data: any) => ({ success: true, data })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn().mockResolvedValue(undefined),
}));

const { validateSocketEvent } = require('../../../middleware/validation');

// ─── Factories ───────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-abc';
const USER_ID = 'user-123';
const MESSAGE_ID = '507f191e810c19729de860ea';
const CONV_ID = '507f191e810c19729de860eb';
const PARTICIPANT_ID = '507f191e810c19729de860ec';

function makeSocket(id = SOCKET_ID): Socket {
  return {
    id,
    emit: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Socket;
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function makeReactionService(overrides: Record<string, any> = {}) {
  return {
    addReaction: jest.fn<any>().mockResolvedValue({ id: 'reaction-1', emoji: '👍' }),
    removeReaction: jest.fn<any>().mockResolvedValue(true),
    getMessageReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ messageId: MESSAGE_ID }),
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

function makeConnectedUsers() {
  const users = new Map<string, any>();
  users.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'en' });
  return users;
}

function makeSocketToUser() {
  const m = new Map<string, string>();
  m.set(SOCKET_ID, USER_ID);
  return m;
}

function buildHandler(overrides: Record<string, any> = {}) {
  const notificationService = { sendNotification: jest.fn<any>() } as any;
  const reactionService = makeReactionService(overrides.reactionService);
  const prisma = makePrisma(overrides.prisma);
  const io = makeIo();
  const connectedUsers = overrides.connectedUsers ?? makeConnectedUsers();
  const socketToUser = overrides.socketToUser ?? makeSocketToUser();

  const handler = new ReactionHandler({
    io: io as any,
    prisma,
    notificationService,
    reactionService,
    connectedUsers,
    socketToUser,
  });
  return { handler, prisma, reactionService, io, connectedUsers, socketToUser };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReactionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.Mock<any>).mockImplementation((_schema: any, data: any) => ({
      success: true,
      data,
    }));
  });

  // ── handleReactionAdd ────────────────────────────────────────────────────

  describe('handleReactionAdd', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when schema validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'Bad emoji' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Bad emoji' }));
    });

    it('returns error when participant cannot be resolved (optimistic messageId)', async () => {
      const { handler } = buildHandler({
        prisma: { message: { findUnique: jest.fn<any>().mockResolvedValue(null) }, participant: { findFirst: jest.fn<any>().mockResolvedValue(null) } },
      });
      const callback = jest.fn<any>();

      // optimistic id prefix
      await handler.handleReactionAdd(makeSocket(), { messageId: 'cid_not-a-mongo-id', emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when addReaction returns null', async () => {
      const { handler } = buildHandler({
        reactionService: { addReaction: jest.fn<any>().mockResolvedValue(null), createUpdateEvent: jest.fn<any>().mockResolvedValue({}) },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('calls callback with success and broadcasts on happy path', async () => {
      const { handler, io } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalled();
    });

    it('calls reactionService.addReaction with resolved participantId', async () => {
      const { handler, reactionService } = buildHandler();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '❤️' }, jest.fn());

      expect(reactionService.addReaction).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: MESSAGE_ID, emoji: '❤️', participantId: PARTICIPANT_ID })
      );
    });

    it('returns error on service exception without crashing', async () => {
      const { handler } = buildHandler({
        reactionService: { addReaction: jest.fn<any>().mockRejectedValue(new Error('db down')), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'db down' }));
    });

    it('returns generic error message when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        reactionService: { addReaction: jest.fn<any>().mockRejectedValue('string error'), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('does not throw when no callback provided on happy path', async () => {
      const { handler } = buildHandler();

      await expect(handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' })).resolves.toBeUndefined();
    });
  });

  // ── handleReactionRemove ─────────────────────────────────────────────────

  describe('handleReactionRemove', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns schema error when validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'emoji required' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'emoji required' });
    });

    it('returns error when participant cannot be resolved (optimistic messageId)', async () => {
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: 'cid_optimistic', emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Could not resolve participant' }));
    });

    it('returns error when removeReaction returns false (reaction not found)', async () => {
      const { handler } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockResolvedValue(false), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Reaction not found' }));
    });

    it('broadcasts removal and calls callback with success on happy path', async () => {
      const { handler, io } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalled();
    });

    it('returns error on service exception (Error instance)', async () => {
      const { handler } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockRejectedValue(new Error('remove failed')), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'remove failed' }));
    });

    it('returns generic error message when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockRejectedValue('plain string error'), createUpdateEvent: jest.fn<any>() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to remove reaction' }));
    });

    it('does not throw when no callback provided on error', async () => {
      const { handler } = buildHandler({
        reactionService: { removeReaction: jest.fn<any>().mockRejectedValue(new Error('boom')), createUpdateEvent: jest.fn<any>() },
      });

      await expect(handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' })).resolves.toBeUndefined();
    });
  });

  // ── handleReactionSync ───────────────────────────────────────────────────

  describe('handleReactionSync', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns error when participant cannot be resolved (optimistic messageId)', async () => {
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), 'cid_optimistic', callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Could not resolve participant' }));
    });

    it('returns success with reaction list on happy path', async () => {
      const reactions = [{ emoji: '👍', count: 3 }];
      const { handler } = buildHandler({
        reactionService: { getMessageReactions: jest.fn<any>().mockResolvedValue(reactions), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: reactions });
    });

    it('returns error on service exception', async () => {
      const { handler } = buildHandler({
        reactionService: { getMessageReactions: jest.fn<any>().mockRejectedValue(new Error('timeout')), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'timeout' }));
    });

    it('returns generic error message when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        reactionService: { getMessageReactions: jest.fn<any>().mockRejectedValue('plain string'), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to sync reactions' }));
    });

    it('does not throw when no callback provided on error', async () => {
      const { handler } = buildHandler({
        reactionService: { getMessageReactions: jest.fn<any>().mockRejectedValue(new Error('boom')), addReaction: jest.fn(), removeReaction: jest.fn(), createUpdateEvent: jest.fn() },
      });

      await expect(handler.handleReactionSync(makeSocket(), MESSAGE_ID)).resolves.toBeUndefined();
    });
  });

  // ── _createReactionNotification error swallow ────────────────────────────

  describe('notification error handling', () => {
    it('swallows notifyReactionAdded rejection without propagating to caller', async () => {
      const { notifyReactionAdded } = require('../../../services/notifications/reactionNotify');
      (notifyReactionAdded as jest.Mock<any>).mockRejectedValueOnce(new Error('push service down'));

      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await expect(handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback)).resolves.toBeUndefined();
      // Callback still reported success — notification failure is fire-and-forget
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
