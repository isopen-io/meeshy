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
const mockGetConnectedUser = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/socket-helpers', () => ({
  normalizeConversationId: (...args: unknown[]) => mockNormalizeConversationId(...args),
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { StatusHandler, type StatusHandlerDependencies } from '../StatusHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { StatusService } from '../../../services/StatusService';
import type { PrivacyPreferencesService } from '../../../services/PrivacyPreferencesService';
import type { SocketUser } from '../../utils/socket-helpers';

// ── Factories ────────────────────────────────────────────────────────────────

function makeSocket(overrides: Partial<Record<string, unknown>> = {}): Socket {
  return {
    id: 'socket-abc',
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    emit: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

function makePrisma(): PrismaClient {
  return {
    conversation: { findUnique: jest.fn() },
    participant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  } as unknown as PrismaClient;
}

function makeStatusService(): StatusService {
  return { updateLastSeen: jest.fn() } as unknown as StatusService;
}

function makePrivacyService(): PrivacyPreferencesService {
  return { shouldShowTypingIndicator: jest.fn() } as unknown as PrivacyPreferencesService;
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

function makeHandler(overrides: Partial<StatusHandlerDependencies> = {}): {
  handler: StatusHandler;
  prisma: PrismaClient;
  statusService: StatusService;
  privacyService: PrivacyPreferencesService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
} {
  const prisma = makePrisma();
  const statusService = makeStatusService();
  const privacyService = makePrivacyService();
  const connectedUsers = new Map<string, SocketUser>();
  const socketToUser = new Map<string, string>();

  const handler = new StatusHandler({
    prisma,
    statusService,
    privacyPreferencesService: privacyService,
    connectedUsers,
    socketToUser,
    ...overrides,
  });

  return { handler, prisma, statusService, privacyService, connectedUsers, socketToUser };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_CONV_ID = '000000000000000000000001';
const VALID_DATA = { conversationId: VALID_CONV_ID };

function setupValidTypingFlow(
  ctx: ReturnType<typeof makeHandler>,
  opts: { isAnonymous?: boolean; userId?: string } = {}
): void {
  const { socketToUser, connectedUsers } = ctx;
  const userId = opts.userId ?? 'user-1';
  socketToUser.set('socket-abc', userId);
  connectedUsers.set(userId, makeSocketUser({ id: userId, isAnonymous: opts.isAnonymous ?? false }));
  mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
  mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
  mockGetConnectedUser.mockReturnValue({ user: connectedUsers.get(userId), realUserId: userId });
  (ctx.privacyService.shouldShowTypingIndicator as jest.Mock<any>).mockResolvedValue(true);
}

// ── StatusHandler tests ───────────────────────────────────────────────────────

describe('StatusHandler', () => {
  let ctx: ReturnType<typeof makeHandler>;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = makeHandler();
  });

  // ── handleTypingStart ──────────────────────────────────────────────────────

  describe('handleTypingStart', () => {
    it('returns early when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad payload' });
      const socket = makeSocket();
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when socket is not in socketToUser map', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      const socket = makeSocket();
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockNormalizeConversationId).not.toHaveBeenCalled();
    });

    it('returns early when getConnectedUser returns null', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(ctx.statusService.updateLastSeen).not.toHaveBeenCalled();
    });

    it('returns early when privacy check disallows typing', async () => {
      setupValidTypingFlow(ctx);
      (ctx.privacyService.shouldShowTypingIndicator as jest.Mock<any>).mockResolvedValue(false);
      // Stub user found so _resolveTypingIdentity doesn't blow up
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: null, lastName: null, displayName: null,
      });
      const socket = makeSocket();
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when _resolveTypingIdentity returns null (user not found)', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue(null);
      const socket = makeSocket();
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('emits typing:start to conversation room for registered user', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: null,
      });
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledWith('typing:start', expect.objectContaining({
        userId: 'user-1',
        username: 'alice',
        isTyping: true,
        conversationId: VALID_CONV_ID,
      }));
    });

    it('uses displayName field when present over firstName+lastName', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice S.',
      });
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledWith('typing:start', expect.objectContaining({
        displayName: 'Alice S.',
      }));
    });

    it('falls back to username as displayName when no names', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: null, lastName: null, displayName: null,
      });
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledWith('typing:start', expect.objectContaining({
        displayName: 'alice',
      }));
    });

    it('throttles duplicate typing events within 2s', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: null, lastName: null, displayName: null,
      });
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('calls updateLastSeen on the status service', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: null, lastName: null, displayName: null,
      });
      const socket = makeSocket();
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(ctx.statusService.updateLastSeen).toHaveBeenCalledWith('user-1', false);
    });

    it('logs error and swallows when an unexpected error occurs', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockRejectedValue(new Error('db fail'));
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      await expect(ctx.handler.handleTypingStart(socket, VALID_DATA)).resolves.toBeUndefined();
    });

    it('handles anonymous user via Participant table', async () => {
      const participantId = 'participant-1';
      ctx.socketToUser.set('socket-abc', participantId);
      ctx.connectedUsers.set(participantId, makeSocketUser({ id: participantId, isAnonymous: true }));
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      mockGetConnectedUser.mockReturnValue({
        user: makeSocketUser({ id: participantId, isAnonymous: true }),
        realUserId: participantId,
      });
      (ctx.privacyService.shouldShowTypingIndicator as jest.Mock<any>).mockResolvedValue(true);
      (ctx.prisma.participant.findUnique as jest.Mock<any>).mockResolvedValue({
        id: participantId, displayName: 'Anon User', nickname: null,
      });
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledWith('typing:start', expect.objectContaining({
        username: 'Anon User',
        displayName: 'Anon User',
        isTyping: true,
      }));
    });

    it('uses nickname over displayName for anonymous user', async () => {
      const participantId = 'participant-2';
      ctx.socketToUser.set('socket-abc', participantId);
      ctx.connectedUsers.set(participantId, makeSocketUser({ id: participantId, isAnonymous: true }));
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      mockGetConnectedUser.mockReturnValue({
        user: makeSocketUser({ id: participantId, isAnonymous: true }),
        realUserId: participantId,
      });
      (ctx.privacyService.shouldShowTypingIndicator as jest.Mock<any>).mockResolvedValue(true);
      (ctx.prisma.participant.findUnique as jest.Mock<any>).mockResolvedValue({
        id: participantId, displayName: 'Anon User', nickname: 'Nick',
      });
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledWith('typing:start', expect.objectContaining({
        username: 'Nick',
        displayName: 'Nick',
      }));
    });

    it('returns early when anonymous participant not found', async () => {
      const participantId = 'participant-missing';
      ctx.socketToUser.set('socket-abc', participantId);
      ctx.connectedUsers.set(participantId, makeSocketUser({ id: participantId, isAnonymous: true }));
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      mockGetConnectedUser.mockReturnValue({
        user: makeSocketUser({ id: participantId, isAnonymous: true }),
        realUserId: participantId,
      });
      (ctx.privacyService.shouldShowTypingIndicator as jest.Mock<any>).mockResolvedValue(true);
      (ctx.prisma.participant.findUnique as jest.Mock<any>).mockResolvedValue(null);
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  // ── Identity cache ─────────────────────────────────────────────────────────

  describe('identity cache', () => {
    it('reuses cached identity on second call without hitting DB again', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: null, lastName: null, displayName: 'Alice',
      });
      const socket = makeSocket();

      // First call populates cache
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      const firstCallCount = (ctx.prisma.user.findUnique as jest.Mock<any>).mock.calls.length;

      // Advance time is not mocked here — cache TTL is 60s so it's still valid
      // Reset throttle to allow second emit
      ctx.handler.clearTypingThrottle('user-1');

      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect((ctx.prisma.user.findUnique as jest.Mock<any>).mock.calls.length).toBe(firstCallCount);
    });

    it('invalidateIdentityCache can be called and does not throw', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: null, lastName: null, displayName: 'Alice',
      });
      const socket = makeSocket();
      // First call populates cache
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      // Calling invalidateIdentityCache with any key should not throw
      expect(() => ctx.handler.invalidateIdentityCache('user-1')).not.toThrow();
      expect(() => ctx.handler.invalidateIdentityCache('user:user-1')).not.toThrow();
    });
  });

  // ── clearTypingThrottle ────────────────────────────────────────────────────

  describe('clearTypingThrottle', () => {
    it('clears throttle entries matching the userId prefix', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'alice', firstName: null, lastName: null, displayName: null,
      });
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });

      // First emit sets throttle
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledTimes(1);

      // Clear throttle so second emit goes through
      ctx.handler.clearTypingThrottle('user-1');
      await ctx.handler.handleTypingStart(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledTimes(2);
    });
  });

  // ── handleTypingStop ───────────────────────────────────────────────────────

  describe('handleTypingStop', () => {
    it('returns early when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad' });
      const socket = makeSocket();
      await ctx.handler.handleTypingStop(socket, VALID_DATA);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when socket is unauthenticated', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      const socket = makeSocket();
      await ctx.handler.handleTypingStop(socket, VALID_DATA);
      expect(mockNormalizeConversationId).not.toHaveBeenCalled();
    });

    it('returns early when getConnectedUser is null', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      await ctx.handler.handleTypingStop(socket, VALID_DATA);
      expect(ctx.privacyService.shouldShowTypingIndicator).not.toHaveBeenCalled();
    });

    it('returns early when privacy check disallows typing', async () => {
      setupValidTypingFlow(ctx);
      (ctx.privacyService.shouldShowTypingIndicator as jest.Mock<any>).mockResolvedValue(false);
      const socket = makeSocket();
      await ctx.handler.handleTypingStop(socket, VALID_DATA);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('emits typing:stop to conversation room', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
        id: 'user-1', username: 'bob', firstName: 'Bob', lastName: null, displayName: null,
      });
      const mockEmit = jest.fn();
      const socket = makeSocket({ to: jest.fn().mockReturnValue({ emit: mockEmit }) });
      await ctx.handler.handleTypingStop(socket, VALID_DATA);
      expect(mockEmit).toHaveBeenCalledWith('typing:stop', expect.objectContaining({
        userId: 'user-1',
        isTyping: false,
        conversationId: VALID_CONV_ID,
      }));
    });

    it('returns early when _resolveTypingIdentity returns null on stop', async () => {
      setupValidTypingFlow(ctx);
      (ctx.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue(null);
      const socket = makeSocket();
      await ctx.handler.handleTypingStop(socket, VALID_DATA);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('swallows error from unexpected exception', async () => {
      ctx.socketToUser.set('socket-abc', 'user-1');
      mockValidateSocketEvent.mockReturnValue({ success: true, data: VALID_DATA });
      mockNormalizeConversationId.mockRejectedValue(new Error('network'));
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      await expect(ctx.handler.handleTypingStop(socket, VALID_DATA)).resolves.toBeUndefined();
    });
  });
});
