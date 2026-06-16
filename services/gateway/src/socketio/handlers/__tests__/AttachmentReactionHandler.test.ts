import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mocks (must precede SUT import) ──────────────────────────────────────────

const mockLoggerChild = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => mockLoggerChild) },
}));

const mockResolveParticipantFromMessage = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipantFromMessage: (...args: unknown[]) => mockResolveParticipantFromMessage(...args),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { AttachmentReactionHandler, type AttachmentReactionHandlerDependencies } from '../AttachmentReactionHandler';
import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { AttachmentReactionService } from '../../../services/AttachmentReactionService';
import type { SocketUser } from '../../utils/socket-helpers';

// ── Factories ────────────────────────────────────────────────────────────────

const VALID_ATTACHMENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const VALID_MESSAGE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const VALID_CONV_ID = 'cccccccccccccccccccccccc';
const PARTICIPANT_ID = 'dddddddddddddddddddddddd';

function makeSocket(overrides: Partial<Record<string, unknown>> = {}): Socket {
  return { id: 'socket-abc', emit: jest.fn(), ...overrides } as unknown as Socket;
}

function makeIo(): SocketIOServer & { _toMock: { emit: jest.Mock } } {
  const toMock = { emit: jest.fn() };
  return { to: jest.fn().mockReturnValue(toMock), _toMock: toMock } as unknown as SocketIOServer & { _toMock: { emit: jest.Mock } };
}

function makePrisma(): PrismaClient {
  return {
    message: { findUnique: jest.fn() },
    messageAttachment: { findUnique: jest.fn() },
    participant: { findFirst: jest.fn() },
  } as unknown as PrismaClient;
}

function makeService(): AttachmentReactionService {
  return {
    addAttachmentReaction: jest.fn(),
    removeAttachmentReaction: jest.fn(),
    getReactionSummary: jest.fn(),
    resolveConversationId: jest.fn(),
  } as unknown as AttachmentReactionService;
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
  handler: AttachmentReactionHandler;
  io: SocketIOServer & { _toMock: { emit: jest.Mock } };
  prisma: PrismaClient;
  service: AttachmentReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
} {
  const io = makeIo();
  const prisma = makePrisma();
  const service = makeService();
  const connectedUsers = new Map<string, SocketUser>();
  const socketToUser = new Map<string, string>();

  const handler = new AttachmentReactionHandler({
    io,
    prisma,
    service,
    connectedUsers,
    socketToUser,
  } as AttachmentReactionHandlerDependencies);

  return { handler, io, prisma, service, connectedUsers, socketToUser };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const validData = {
  attachmentId: VALID_ATTACHMENT_ID,
  messageId: VALID_MESSAGE_ID,
  emoji: '❤️',
};

function setupFullSuccess(ctx: ReturnType<typeof makeHandler>): void {
  ctx.socketToUser.set('socket-abc', 'user-1');
  ctx.connectedUsers.set('user-1', makeSocketUser());
  mockResolveParticipantFromMessage.mockResolvedValue({
    participantId: PARTICIPANT_ID,
    userId: 'user-1',
    isAnonymous: false,
    displayName: 'Alice',
  });
  (ctx.service.resolveConversationId as jest.Mock<any>).mockResolvedValue(VALID_CONV_ID);
  (ctx.prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({
    id: VALID_ATTACHMENT_ID,
    messageId: VALID_MESSAGE_ID,
  });
  (ctx.service.addAttachmentReaction as jest.Mock<any>).mockResolvedValue(undefined);
  (ctx.service.removeAttachmentReaction as jest.Mock<any>).mockResolvedValue(undefined);
  (ctx.service.getReactionSummary as jest.Mock<any>).mockResolvedValue({ '❤️': 1 });
}

// ── AttachmentReactionHandler tests ──────────────────────────────────────────

describe('AttachmentReactionHandler', () => {
  let ctx: ReturnType<typeof makeHandler>;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = makeHandler();
  });

  // ── Payload validation ─────────────────────────────────────────────────────

  describe('payload validation', () => {
    it('calls callback with error when attachmentId is missing', async () => {
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, { ...validData, attachmentId: '' }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('calls callback with error when messageId is missing', async () => {
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, { ...validData, messageId: '' }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('calls callback with error when emoji is missing', async () => {
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, { ...validData, emoji: '' }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('calls callback with error when messageId is not a valid ObjectId', async () => {
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, { ...validData, messageId: 'cid_123' }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });

    it('calls callback with error when attachmentId is not a valid ObjectId', async () => {
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, { ...validData, attachmentId: 'not-an-objectid' }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });
  });

  // ── Auth checks ────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('calls callback with error when socket is not in socketToUser map', async () => {
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, validData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
    });
  });

  // ── Participant resolution ─────────────────────────────────────────────────

  describe('participant resolution', () => {
    it('calls callback with error when participant cannot be resolved', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockResolveParticipantFromMessage.mockResolvedValue(null);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, validData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });
  });

  // ── Conversation resolution ────────────────────────────────────────────────

  describe('conversation resolution', () => {
    it('calls callback with error when message not found (null conversationId)', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockResolveParticipantFromMessage.mockResolvedValue({
        participantId: PARTICIPANT_ID, userId: 'user-1', isAnonymous: false, displayName: 'Alice',
      });
      (ctx.service.resolveConversationId as jest.Mock<any>).mockResolvedValue(null);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, validData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Message not found' });
    });
  });

  // ── IDOR protection ────────────────────────────────────────────────────────

  describe('IDOR protection', () => {
    it('calls callback with error when attachment not found', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockResolveParticipantFromMessage.mockResolvedValue({
        participantId: PARTICIPANT_ID, userId: 'user-1', isAnonymous: false, displayName: 'Alice',
      });
      (ctx.service.resolveConversationId as jest.Mock<any>).mockResolvedValue(VALID_CONV_ID);
      (ctx.prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(null);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, validData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Attachment not found' });
    });

    it('calls callback with error when attachment belongs to different message (IDOR)', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockResolveParticipantFromMessage.mockResolvedValue({
        participantId: PARTICIPANT_ID, userId: 'user-1', isAnonymous: false, displayName: 'Alice',
      });
      (ctx.service.resolveConversationId as jest.Mock<any>).mockResolvedValue(VALID_CONV_ID);
      (ctx.prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({
        id: VALID_ATTACHMENT_ID,
        messageId: '999999999999999999999999', // different message
      });
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, validData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Attachment not found' });
    });
  });

  // ── handleAdd success ──────────────────────────────────────────────────────

  describe('handleAdd', () => {
    it('calls addAttachmentReaction, emits to room, and returns success', async () => {
      setupFullSuccess(ctx);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, validData, callback);
      expect(ctx.service.addAttachmentReaction).toHaveBeenCalledWith({
        attachmentId: VALID_ATTACHMENT_ID,
        messageId: VALID_MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '❤️',
      });
      expect(ctx.io._toMock.emit).toHaveBeenCalledWith('attachment:reaction-added', expect.objectContaining({
        attachmentId: VALID_ATTACHMENT_ID,
        messageId: VALID_MESSAGE_ID,
        conversationId: VALID_CONV_ID,
        participantId: PARTICIPANT_ID,
        emoji: '❤️',
        action: 'add',
        reactionSummary: { '❤️': 1 },
      }));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('works without callback (fire-and-forget)', async () => {
      setupFullSuccess(ctx);
      const socket = makeSocket();
      await expect(ctx.handler.handleAdd(socket, validData)).resolves.toBeUndefined();
      expect(ctx.service.addAttachmentReaction).toHaveBeenCalled();
    });

    it('calls callback with error when service.addAttachmentReaction throws', async () => {
      setupFullSuccess(ctx);
      (ctx.service.addAttachmentReaction as jest.Mock<any>).mockRejectedValue(new Error('reaction fail'));
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, validData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'reaction fail' });
    });

    it('calls callback with generic message when non-Error is thrown', async () => {
      setupFullSuccess(ctx);
      (ctx.service.addAttachmentReaction as jest.Mock<any>).mockRejectedValue('string error');
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleAdd(socket, validData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Failed' });
    });
  });

  // ── handleRemove success ───────────────────────────────────────────────────

  describe('handleRemove', () => {
    it('calls removeAttachmentReaction, emits attachment:reaction-removed, returns success', async () => {
      setupFullSuccess(ctx);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleRemove(socket, validData, callback);
      expect(ctx.service.removeAttachmentReaction).toHaveBeenCalledWith({
        attachmentId: VALID_ATTACHMENT_ID,
        participantId: PARTICIPANT_ID,
        emoji: '❤️',
      });
      expect(ctx.io._toMock.emit).toHaveBeenCalledWith('attachment:reaction-removed', expect.objectContaining({
        action: 'remove',
        reactionSummary: { '❤️': 1 },
      }));
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('works without callback', async () => {
      setupFullSuccess(ctx);
      const socket = makeSocket();
      await expect(ctx.handler.handleRemove(socket, validData)).resolves.toBeUndefined();
      expect(ctx.service.removeAttachmentReaction).toHaveBeenCalled();
    });
  });

  // ── timestamp in emitted event ─────────────────────────────────────────────

  describe('event timestamp', () => {
    it('includes an ISO timestamp string in the emitted event', async () => {
      setupFullSuccess(ctx);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      const before = new Date().toISOString();
      await ctx.handler.handleAdd(socket, validData, callback);
      const after = new Date().toISOString();
      const emittedData = (ctx.io._toMock.emit.mock.calls[0] as [string, { timestamp: string }])[1];
      expect(emittedData.timestamp).toBeDefined();
      expect(emittedData.timestamp >= before).toBe(true);
      expect(emittedData.timestamp <= after).toBe(true);
    });
  });
});
