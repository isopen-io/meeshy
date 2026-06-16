import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mocks (must precede SUT import) ──────────────────────────────────────────

const mockLoggerChild = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn(() => mockLoggerChild) },
}));

const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
jest.mock('../../../middleware/validation.js', () => ({
  validateSocketEvent: (...args: unknown[]) => mockValidateSocketEvent(...args),
}));

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/socket-helpers', () => ({
  normalizeConversationId: (...args: unknown[]) => mockNormalizeConversationId(...args),
}));

const mockUpdateOnNewMessage = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...args: unknown[]) => mockUpdateOnNewMessage(...args),
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { ConversationHandler, type ConversationHandlerDependencies } from '../ConversationHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SocketUser } from '../../utils/socket-helpers';

// ── Factories ────────────────────────────────────────────────────────────────

const VALID_CONV_ID = '000000000000000000000001';
const VALID_DATA = { conversationId: VALID_CONV_ID };

function makeSocket(overrides: Partial<Record<string, unknown>> = {}): Socket {
  return {
    id: 'socket-abc',
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

function makePrisma(): PrismaClient {
  return {
    conversation: { findUnique: jest.fn() },
    participant: { findFirst: jest.fn() },
  } as unknown as PrismaClient;
}

function makeSocketUser(overrides: Partial<SocketUser> = {}): SocketUser {
  return {
    id: 'user-1',
    socketId: 'socket-abc',
    isAnonymous: false,
    language: 'fr',
    resolvedLanguages: ['fr'],
    ...overrides,
  };
}

function makeHandler(): {
  handler: ConversationHandler;
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
} {
  const prisma = makePrisma();
  const connectedUsers = new Map<string, SocketUser>();
  const socketToUser = new Map<string, string>();
  const handler = new ConversationHandler({
    prisma,
    connectedUsers,
    socketToUser,
  } as ConversationHandlerDependencies);
  return { handler, prisma, connectedUsers, socketToUser };
}

// ── ConversationHandler tests ─────────────────────────────────────────────────

describe('ConversationHandler', () => {
  let ctx: ReturnType<typeof makeHandler>;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = makeHandler();
  });

  // ── handleConversationJoin ─────────────────────────────────────────────────

  describe('handleConversationJoin', () => {
    it('emits join-error when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad payload' });
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'invalid_payload',
      }));
    });

    it('emits join-error with requestedId when data has conversationId but schema fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'oops' });
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, { conversationId: 'bad-id' });
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        conversationId: 'bad-id',
        reason: 'invalid_payload',
      }));
    });

    it('emits join-error when member check fails (not a member)', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue(null);
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'not_a_member',
      }));
    });

    it('emits join-error when participant is banned', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({
        id: 'p-1', bannedAt: new Date(), leftAt: null, isActive: true,
      });
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'banned',
      }));
    });

    it('emits join-error when participant has leftAt set', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({
        id: 'p-1', bannedAt: null, leftAt: new Date(), isActive: true,
      });
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'no_longer_member',
      }));
    });

    it('emits join-error when participant isActive is false', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({
        id: 'p-1', bannedAt: null, leftAt: null, isActive: false,
      });
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'no_longer_member',
      }));
    });

    it('joins the room, emits CONVERSATION_JOINED and stats when user is active member', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({
        id: 'p-1', bannedAt: null, leftAt: null, isActive: true,
      });
      mockUpdateOnNewMessage.mockResolvedValue({ onlineCount: 2, totalMessages: 10 });
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.join).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(socket.emit).toHaveBeenCalledWith('conversation:joined', expect.objectContaining({
        conversationId: VALID_CONV_ID,
        userId: 'user-1',
      }));
      expect(socket.emit).toHaveBeenCalledWith('conversation:stats', expect.objectContaining({
        conversationId: VALID_CONV_ID,
      }));
    });

    it('joins room without membership check when socket has no userId (anonymous)', async () => {
      // No socketToUser entry → userId will be undefined
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.join).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(socket.emit).not.toHaveBeenCalledWith('conversation:join-error', expect.anything());
    });

    it('emits server_error on unexpected exception', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockRejectedValue(new Error('db crash'));
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        reason: 'server_error',
      }));
    });

    it('does not emit stats when updateOnNewMessage returns null', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({
        id: 'p-1', bannedAt: null, leftAt: null, isActive: true,
      });
      mockUpdateOnNewMessage.mockResolvedValue(null);
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, VALID_DATA);
      expect(socket.emit).not.toHaveBeenCalledWith('conversation:stats', expect.anything());
    });

    it('handles data without conversationId key gracefully (uses empty string for requestedId)', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'missing field' });
      const socket = makeSocket();
      await ctx.handler.handleConversationJoin(socket, {} as { conversationId: string });
      expect(socket.emit).toHaveBeenCalledWith('conversation:join-error', expect.objectContaining({
        conversationId: '',
        reason: 'invalid_payload',
      }));
    });
  });

  // ── handleConversationLeave ────────────────────────────────────────────────

  describe('handleConversationLeave', () => {
    it('emits error when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad payload' });
      const socket = makeSocket();
      await ctx.handler.handleConversationLeave(socket, VALID_DATA);
      expect(socket.emit).toHaveBeenCalledWith('error', expect.anything());
    });

    it('leaves room and emits CONVERSATION_LEFT when user is set', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      const socket = makeSocket();
      await ctx.handler.handleConversationLeave(socket, VALID_DATA);
      expect(socket.leave).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(socket.emit).toHaveBeenCalledWith('conversation:left', expect.objectContaining({
        conversationId: VALID_CONV_ID,
        userId: 'user-1',
      }));
    });

    it('leaves room but does not emit when no userId', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      const socket = makeSocket();
      await ctx.handler.handleConversationLeave(socket, VALID_DATA);
      expect(socket.leave).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('swallows errors from unexpected exceptions', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockRejectedValue(new Error('oops'));
      const socket = makeSocket();
      await expect(ctx.handler.handleConversationLeave(socket, VALID_DATA)).resolves.toBeUndefined();
    });
  });

  // ── sendConversationStatsToSocket ─────────────────────────────────────────

  describe('sendConversationStatsToSocket', () => {
    it('emits conversation:stats when stats are returned', async () => {
      const stats = { onlineCount: 5, totalMessages: 100 };
      mockUpdateOnNewMessage.mockResolvedValue(stats);
      const socket = makeSocket();
      await ctx.handler.sendConversationStatsToSocket(socket, VALID_CONV_ID);
      expect(socket.emit).toHaveBeenCalledWith('conversation:stats', {
        conversationId: VALID_CONV_ID,
        stats,
      });
    });

    it('does not emit when stats returns null', async () => {
      mockUpdateOnNewMessage.mockResolvedValue(null);
      const socket = makeSocket();
      await ctx.handler.sendConversationStatsToSocket(socket, VALID_CONV_ID);
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('swallows errors', async () => {
      mockUpdateOnNewMessage.mockRejectedValue(new Error('stats fail'));
      const socket = makeSocket();
      await expect(ctx.handler.sendConversationStatsToSocket(socket, VALID_CONV_ID)).resolves.toBeUndefined();
    });
  });
});
