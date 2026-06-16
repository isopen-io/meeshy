import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mocks (must precede SUT import) ──────────────────────────────────────────

const mockLoggerChild = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => mockLoggerChild) },
}));

const mockGetConnectedUser = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { LocationHandler, type LocationHandlerDependencies } from '../LocationHandler';
import type { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SocketUser } from '../../utils/socket-helpers';
import type {
  LocationShareData,
  LocationLiveStartData,
  LocationLiveUpdateData,
  LocationLiveStopData,
} from '@meeshy/shared/types/socketio-events';

// ── Factories ────────────────────────────────────────────────────────────────

const VALID_CONV_ID = '000000000000000000000001';
const USER_ID = 'user-1';

function makeSocket(overrides: Partial<Record<string, unknown>> = {}): Socket {
  return {
    id: 'socket-abc',
    emit: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

function makeIo(): SocketIOServer {
  const toMock = { emit: jest.fn() };
  return {
    to: jest.fn().mockReturnValue(toMock),
    _toMock: toMock,
  } as unknown as SocketIOServer & { _toMock: { emit: jest.Mock } };
}

function makePrisma(): PrismaClient {
  return {
    participant: { findFirst: jest.fn() },
  } as unknown as PrismaClient;
}

function makeSocketUser(overrides: Partial<SocketUser> = {}): SocketUser {
  return {
    id: USER_ID,
    socketId: 'socket-abc',
    isAnonymous: false,
    language: 'fr',
    resolvedLanguages: ['fr'],
    displayName: 'Test User',
    userId: USER_ID,
    ...overrides,
  };
}

function makeHandler(): {
  handler: LocationHandler;
  io: SocketIOServer & { _toMock: { emit: jest.Mock<any> } };
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  normalizeMock: jest.Mock<any>;
} {
  const io = makeIo() as SocketIOServer & { _toMock: { emit: jest.Mock } };
  const prisma = makePrisma();
  const connectedUsers = new Map<string, SocketUser>();
  const socketToUser = new Map<string, string>();
  const normalizeMock = jest.fn() as jest.Mock<any>;

  const handler = new LocationHandler({
    io,
    prisma,
    connectedUsers,
    socketToUser,
    normalizeConversationId: normalizeMock,
  } as LocationHandlerDependencies);

  return { handler, io, prisma, connectedUsers, socketToUser, normalizeMock };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupAuthenticatedUser(
  ctx: ReturnType<typeof makeHandler>,
  opts: { isAnonymous?: boolean; participantId?: string } = {}
): void {
  const { socketToUser, connectedUsers } = ctx;
  socketToUser.set('socket-abc', USER_ID);
  const user = makeSocketUser({
    isAnonymous: opts.isAnonymous ?? false,
    participantId: opts.participantId,
  });
  connectedUsers.set(USER_ID, user);
  mockGetConnectedUser.mockReturnValue({ user, realUserId: USER_ID });
}

const validShareData: LocationShareData = {
  conversationId: VALID_CONV_ID,
  latitude: 48.8566,
  longitude: 2.3522,
  altitude: null,
  accuracy: null,
  placeName: null,
  address: null,
};

const validLiveStartData: LocationLiveStartData = {
  conversationId: VALID_CONV_ID,
  latitude: 48.8566,
  longitude: 2.3522,
  durationMinutes: 30,
};

const validLiveUpdateData: LocationLiveUpdateData = {
  conversationId: VALID_CONV_ID,
  latitude: 48.8566,
  longitude: 2.3522,
  altitude: null,
  accuracy: null,
  speed: null,
  heading: null,
};

const validLiveStopData: LocationLiveStopData = {
  conversationId: VALID_CONV_ID,
};

// ── LocationHandler tests ─────────────────────────────────────────────────────

describe('LocationHandler', () => {
  let ctx: ReturnType<typeof makeHandler>;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = makeHandler();
  });

  // ── handleLocationShare ────────────────────────────────────────────────────

  describe('handleLocationShare', () => {
    it('calls callback with error when user is not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, validShareData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
    });

    it('calls callback with error when coordinates are out of range', async () => {
      setupAuthenticatedUser(ctx);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, { ...validShareData, latitude: 999 }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('calls callback with error when longitude is out of range', async () => {
      setupAuthenticatedUser(ctx);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, { ...validShareData, longitude: -200 }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('calls callback with error when participant not found (registered user)', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue(null);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, validShareData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Not a participant in this conversation' });
    });

    it('succeeds and emits location:shared to conversation room for registered user', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({ id: 'p-1' });
      ctx.normalizeMock.mockResolvedValue(VALID_CONV_ID);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, validShareData, callback);
      expect(callback).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({
        conversationId: VALID_CONV_ID,
        userId: USER_ID,
        latitude: 48.8566,
        longitude: 2.3522,
      }) });
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).toHaveBeenCalledWith(
        'location:shared',
        expect.objectContaining({ conversationId: VALID_CONV_ID })
      );
    });

    it('succeeds for anonymous user without prisma query', async () => {
      setupAuthenticatedUser(ctx, { isAnonymous: true, participantId: 'anon-p-1' });
      ctx.normalizeMock.mockResolvedValue(VALID_CONV_ID);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, validShareData, callback);
      expect(callback).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({
        userId: USER_ID,
      }) });
      expect(ctx.prisma.participant.findFirst).not.toHaveBeenCalled();
    });

    it('calls callback with error on unexpected exception', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockRejectedValue(new Error('db fail'));
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, validShareData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'db fail' });
    });

    it('calls callback without error message when non-Error is thrown', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockRejectedValue('string error');
      const callback = jest.fn() as jest.Mock<any>;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, validShareData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Failed to share location' });
    });

    it('does not throw when called without callback on error path', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      await expect(ctx.handler.handleLocationShare(socket, validShareData)).resolves.toBeUndefined();
    });
  });

  // ── handleLiveLocationStart ────────────────────────────────────────────────

  describe('handleLiveLocationStart', () => {
    it('calls callback with error when user not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, validLiveStartData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
    });

    it('calls callback with error when coordinates invalid', async () => {
      setupAuthenticatedUser(ctx);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, { ...validLiveStartData, latitude: 91 }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('calls callback with error when duration is 0', async () => {
      setupAuthenticatedUser(ctx);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, { ...validLiveStartData, durationMinutes: 0 }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid duration (must be 1-480 minutes)' });
    });

    it('calls callback with error when duration exceeds 480 minutes', async () => {
      setupAuthenticatedUser(ctx);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, { ...validLiveStartData, durationMinutes: 481 }, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid duration (must be 1-480 minutes)' });
    });

    it('calls callback with error when participant not in conversation', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue(null);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, validLiveStartData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Not a participant in this conversation' });
    });

    it('succeeds and emits location:live-started', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({ id: 'p-1' });
      ctx.normalizeMock.mockResolvedValue(VALID_CONV_ID);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, validLiveStartData, callback);
      expect(callback).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({
        conversationId: VALID_CONV_ID,
        userId: USER_ID,
        durationMinutes: 30,
      }) });
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).toHaveBeenCalledWith(
        'location:live-started',
        expect.objectContaining({ conversationId: VALID_CONV_ID })
      );
    });

    it('computes expiresAt from durationMinutes', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({ id: 'p-1' });
      ctx.normalizeMock.mockResolvedValue(VALID_CONV_ID);
      const before = Date.now();
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, { ...validLiveStartData, durationMinutes: 60 }, callback);
      const after = Date.now();
      const result = (callback.mock.calls[0] as [{ success: boolean; data: { expiresAt: Date } }])[0];
      const expiresAt = result.data.expiresAt.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 60 * 60_000);
      expect(expiresAt).toBeLessThanOrEqual(after + 60 * 60_000);
    });

    it('calls callback with Error message when unexpected Error is thrown', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockRejectedValue(new Error('live-start fail'));
      const callback = jest.fn() as jest.Mock<any>;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, validLiveStartData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'live-start fail' });
    });

    it('calls callback with generic message when non-Error is thrown', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockRejectedValue({ code: 42 });
      const callback = jest.fn() as jest.Mock<any>;
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStart(socket, validLiveStartData, callback);
      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Failed to start live location' });
    });

    it('handles undefined callback without throwing when unexpected error occurs', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockRejectedValue(new Error('oops'));
      const socket = makeSocket();
      await expect(ctx.handler.handleLiveLocationStart(socket, validLiveStartData)).resolves.toBeUndefined();
    });
  });

  // ── handleLiveLocationUpdate ───────────────────────────────────────────────

  describe('handleLiveLocationUpdate', () => {
    it('returns early when user not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationUpdate(socket, validLiveUpdateData);
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).not.toHaveBeenCalled();
    });

    it('returns early when coordinates invalid', async () => {
      setupAuthenticatedUser(ctx);
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationUpdate(socket, { ...validLiveUpdateData, latitude: -91 });
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).not.toHaveBeenCalled();
    });

    it('returns early when participant not found', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue(null);
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationUpdate(socket, validLiveUpdateData);
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).not.toHaveBeenCalled();
    });

    it('emits location:live-updated to conversation room on success', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({ id: 'p-1' });
      ctx.normalizeMock.mockResolvedValue(VALID_CONV_ID);
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationUpdate(socket, validLiveUpdateData);
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).toHaveBeenCalledWith(
        'location:live-updated',
        expect.objectContaining({ conversationId: VALID_CONV_ID, userId: USER_ID })
      );
    });

    it('swallows unexpected errors', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockRejectedValue(new Error('crash'));
      const socket = makeSocket();
      await expect(ctx.handler.handleLiveLocationUpdate(socket, validLiveUpdateData)).resolves.toBeUndefined();
    });
  });

  // ── handleLiveLocationStop ─────────────────────────────────────────────────

  describe('handleLiveLocationStop', () => {
    it('returns early when user not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStop(socket, validLiveStopData);
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).not.toHaveBeenCalled();
    });

    it('returns early when participant not found', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue(null);
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStop(socket, validLiveStopData);
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).not.toHaveBeenCalled();
    });

    it('emits location:live-stopped to conversation room on success', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({ id: 'p-1' });
      ctx.normalizeMock.mockResolvedValue(VALID_CONV_ID);
      const socket = makeSocket();
      await ctx.handler.handleLiveLocationStop(socket, validLiveStopData);
      expect((ctx.io as unknown as { _toMock: { emit: jest.Mock } })._toMock.emit).toHaveBeenCalledWith(
        'location:live-stopped',
        expect.objectContaining({ conversationId: VALID_CONV_ID, userId: USER_ID })
      );
    });

    it('swallows unexpected errors', async () => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockRejectedValue(new Error('crash'));
      const socket = makeSocket();
      await expect(ctx.handler.handleLiveLocationStop(socket, validLiveStopData)).resolves.toBeUndefined();
    });
  });

  // ── coordinate validation edge cases ──────────────────────────────────────

  describe('coordinate boundary validation', () => {
    it.each([
      { lat: -90, lon: 0, valid: true },
      { lat: 90, lon: 0, valid: true },
      { lat: 0, lon: -180, valid: true },
      { lat: 0, lon: 180, valid: true },
      { lat: -90.001, lon: 0, valid: false },
      { lat: 90.001, lon: 0, valid: false },
      { lat: 0, lon: -180.001, valid: false },
      { lat: 0, lon: 180.001, valid: false },
    ])('latitude=$lat longitude=$lon → valid=$valid', async ({ lat, lon, valid }) => {
      setupAuthenticatedUser(ctx);
      (ctx.prisma.participant.findFirst as jest.Mock<any>).mockResolvedValue({ id: 'p-1' });
      ctx.normalizeMock.mockResolvedValue(VALID_CONV_ID);
      const callback = jest.fn() as jest.Mock;
      const socket = makeSocket();
      await ctx.handler.handleLocationShare(socket, { ...validShareData, latitude: lat, longitude: lon }, callback);
      if (valid) {
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      } else {
        expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
      }
    });
  });
});
