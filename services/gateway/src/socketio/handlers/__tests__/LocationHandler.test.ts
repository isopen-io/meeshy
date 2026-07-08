/**
 * Unit tests for LocationHandler
 * Covers: handleLocationShare, handleLiveLocationStart, handleLiveLocationUpdate,
 *         handleLiveLocationStop — all auth/validation/broadcast branches
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetConnectedUser = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { LocationHandler } from '../LocationHandler';
import type { Socket, Server as SocketIOServer } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ─── Factories ────────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-loc';
const USER_ID = 'user-loc-001';
const CONV_ID = '507f1f77bcf86cd799439011';
const NORMALIZED_CONV_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = 'participant-loc-001';

const VALID_COORDINATES = { latitude: 48.8566, longitude: 2.3522 };

function makeSocket(): Socket {
  return {
    id: SOCKET_ID,
    emit: jest.fn(),
  } as unknown as Socket;
}

function makeIo() {
  const toRoom = { emit: jest.fn() };
  return {
    io: { to: jest.fn<any>().mockReturnValue(toRoom), _toRoom: toRoom } as any,
    toRoom,
  };
}

function makePrisma(participantResult: unknown = { id: PARTICIPANT_ID }): any {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(participantResult),
    },
  };
}

function makeConnectedUsers(isAnonymous = false, participantId?: string) {
  const users = new Map();
  users.set(USER_ID, {
    id: USER_ID, socketId: SOCKET_ID, isAnonymous, language: 'fr',
    resolvedLanguages: [], participantId, displayName: 'Alice Loc',
  });
  return users;
}

const mockNormalize = jest.fn<any>().mockResolvedValue(NORMALIZED_CONV_ID);

function makeHandler({
  io = makeIo().io,
  prisma = makePrisma(),
  connectedUsers = makeConnectedUsers(),
  socketToUser = new Map([[SOCKET_ID, USER_ID]]),
} = {}) {
  return {
    handler: new LocationHandler({
      io: io as any,
      prisma,
      connectedUsers,
      socketToUser,
      normalizeConversationId: mockNormalize,
    }),
    io,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocationHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalize.mockResolvedValue(NORMALIZED_CONV_ID);
    mockGetConnectedUser.mockReturnValue({
      user: {
        id: USER_ID, isAnonymous: false, socketId: SOCKET_ID,
        language: 'fr', resolvedLanguages: [], displayName: 'Alice Loc',
      },
      realUserId: USER_ID,
    });
  });

  // ── handleLocationShare ────────────────────────────────────────────────────

  describe('handleLocationShare', () => {
    it('broadcasts LOCATION_SHARED and calls callback success', async () => {
      const cb = jest.fn();
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, {
        ...VALID_COORDINATES,
        conversationId: CONV_ID,
        altitude: 50,
        accuracy: 10,
        placeName: 'Paris',
        address: '1 Rue de Rivoli',
      }, cb);

      expect(io.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_CONV_ID));
      expect(io._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_SHARED,
        expect.objectContaining({
          conversationId: NORMALIZED_CONV_ID,
          userId: USER_ID,
          latitude: VALID_COORDINATES.latitude,
          longitude: VALID_COORDINATES.longitude,
          placeName: 'Paris',
          address: '1 Rue de Rivoli',
        })
      );
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('messageId in response is a temp loc_ prefixed string', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, cb);

      const eventData = (cb as jest.Mock).mock.calls[0][0] as any;
      expect(eventData.data.messageId).toMatch(/^loc_\d+_.+$/);
    });

    it('returns error when socket is not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socketToUser = new Map<string, string>();
      const cb = jest.fn();
      const { handler } = makeHandler({ socketToUser });
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
    });

    it('returns error for invalid latitude (out of range)', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { latitude: 91, longitude: 0, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('returns error for invalid longitude (out of range)', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { latitude: 0, longitude: 181, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('returns error for non-number coordinate', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(
        socket,
        { latitude: 'bad' as any, longitude: 0, conversationId: CONV_ID },
        cb
      );

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('returns error when user is not a participant (registered)', async () => {
      const prisma = makePrisma(null);
      const cb = jest.fn();
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not a participant in this conversation' });
    });

    it('verifies anonymous participant belongs to the target conversation before broadcasting', async () => {
      mockGetConnectedUser.mockReturnValue({
        user: {
          id: USER_ID, isAnonymous: true, participantId: PARTICIPANT_ID,
          language: 'fr', resolvedLanguages: [], displayName: 'Anon',
        },
        realUserId: USER_ID,
      });
      const prisma = makePrisma({ id: PARTICIPANT_ID });
      const cb = jest.fn();
      const { handler, io } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, cb);

      // Anonymous membership is scoped to THIS conversation (id + conversationId + isActive)
      expect(prisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: PARTICIPANT_ID,
            conversationId: NORMALIZED_CONV_ID,
            isActive: true,
          }),
        })
      );
      expect(io._toRoom.emit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_SHARED, expect.anything());
    });

    it('rejects anonymous participant that does not belong to the target conversation', async () => {
      // Security: an anonymous socket whose participant belongs to conversation A
      // must NOT be able to broadcast into conversation B. findFirst returns null
      // because the participant is not a member of the requested conversation.
      mockGetConnectedUser.mockReturnValue({
        user: {
          id: USER_ID, isAnonymous: true, participantId: PARTICIPANT_ID,
          language: 'fr', resolvedLanguages: [], displayName: 'Anon',
        },
        realUserId: USER_ID,
      });
      const prisma = makePrisma(null);
      const cb = jest.fn();
      const { handler, io } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, cb);

      expect(prisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: PARTICIPANT_ID,
            conversationId: NORMALIZED_CONV_ID,
            isActive: true,
          }),
        })
      );
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not a participant in this conversation' });
      expect(io._toRoom.emit).not.toHaveBeenCalled();
    });

    it('passes error message from thrown Error to callback', async () => {
      mockNormalize.mockRejectedValue(new Error('normalizeConv failed'));
      const prisma = makePrisma({ id: PARTICIPANT_ID });
      const cb = jest.fn();
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'normalizeConv failed' });
    });

    it('passes generic error string on non-Error exception', async () => {
      mockNormalize.mockRejectedValue('raw string error');
      const prisma = makePrisma({ id: PARTICIPANT_ID });
      const cb = jest.fn();
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Failed to share location' });
    });

    it('handles no callback (undefined) without crashing', async () => {
      const { handler } = makeHandler();
      const socket = makeSocket();

      await expect(
        handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, undefined)
      ).resolves.toBeUndefined();
    });

    it('accepts boundary latitude = -90', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { latitude: -90, longitude: 0, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('accepts boundary latitude = 90', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { latitude: 90, longitude: 0, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('accepts boundary longitude = -180', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { latitude: 0, longitude: -180, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('rejects latitude = -90.001 (just past boundary)', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { latitude: -90.001, longitude: 0, conversationId: CONV_ID }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });
  });

  // ── handleLiveLocationStart ────────────────────────────────────────────────

  describe('handleLiveLocationStart', () => {
    it('broadcasts LOCATION_LIVE_STARTED and calls callback success', async () => {
      const cb = jest.fn();
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES,
        conversationId: CONV_ID,
        durationMinutes: 30,
      }, cb);

      expect(io.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_CONV_ID));
      expect(io._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STARTED,
        expect.objectContaining({
          conversationId: NORMALIZED_CONV_ID,
          userId: USER_ID,
          durationMinutes: 30,
        })
      );
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('computes expiresAt correctly from durationMinutes', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();
      const before = Date.now();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 10,
      }, cb);

      const eventData = (cb as jest.Mock).mock.calls[0][0] as any;
      const expiresAt = eventData.data.expiresAt as Date;
      const elapsed = expiresAt.getTime() - before;
      expect(elapsed).toBeGreaterThanOrEqual(10 * 60_000);
      expect(elapsed).toBeLessThan(10 * 60_000 + 500);
    });

    it('returns error when socket is not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socketToUser = new Map<string, string>();
      const cb = jest.fn();
      const { handler } = makeHandler({ socketToUser });
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 5,
      }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
    });

    it('returns error for invalid coordinates', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        latitude: 200, longitude: 0, conversationId: CONV_ID, durationMinutes: 5,
      }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('returns error for durationMinutes = 0', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 0,
      }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid duration (must be 1-480 minutes)' });
    });

    it('returns error for durationMinutes = 481 (over max)', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 481,
      }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid duration (must be 1-480 minutes)' });
    });

    it('accepts durationMinutes = 1 (boundary min)', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 1,
      }, cb);

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('accepts durationMinutes = 480 (boundary max)', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 480,
      }, cb);

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns error when user is not a participant', async () => {
      const prisma = makePrisma(null);
      const cb = jest.fn();
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 5,
      }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not a participant in this conversation' });
    });

    it('includes username as displayName in emitted event', async () => {
      const cb = jest.fn();
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 5,
      }, cb);

      const toRoom = io._toRoom;
      const emittedData = (toRoom.emit as jest.Mock).mock.calls[0][1] as any;
      expect(emittedData.username).toBe('Alice Loc');
    });

    it('catches errors and returns error via callback', async () => {
      mockNormalize.mockRejectedValue(new Error('normalize failed'));
      const prisma = makePrisma({ id: PARTICIPANT_ID });
      const cb = jest.fn();
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 5,
      }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'normalize failed' });
    });
  });

  // ── handleLiveLocationUpdate ───────────────────────────────────────────────

  describe('handleLiveLocationUpdate', () => {
    it('broadcasts LOCATION_LIVE_UPDATED with full fields', async () => {
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES,
        conversationId: CONV_ID,
        altitude: 100,
        accuracy: 5,
        speed: 50,
        heading: 90,
      });

      expect(io.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_CONV_ID));
      expect(io._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_UPDATED,
        expect.objectContaining({
          conversationId: NORMALIZED_CONV_ID,
          userId: USER_ID,
          latitude: VALID_COORDINATES.latitude,
          longitude: VALID_COORDINATES.longitude,
          altitude: 100,
          accuracy: 5,
          speed: 50,
          heading: 90,
        })
      );
    });

    it('returns early when socket is not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socketToUser = new Map<string, string>();
      const { handler, io } = makeHandler({ socketToUser });
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID,
      });

      expect(io._toRoom.emit).not.toHaveBeenCalled();
    });

    it('returns early for invalid coordinates', async () => {
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        latitude: 999, longitude: 0, conversationId: CONV_ID,
      });

      expect(io._toRoom.emit).not.toHaveBeenCalled();
    });

    it('returns early when user is not a participant', async () => {
      const prisma = makePrisma(null);
      const { handler, io } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID,
      });

      expect(io._toRoom.emit).not.toHaveBeenCalled();
    });

    it('catches errors without propagating', async () => {
      mockNormalize.mockRejectedValue(new Error('update error'));
      const { handler } = makeHandler();
      const socket = makeSocket();

      await expect(handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID,
      })).resolves.toBeUndefined();
    });

    it('includes timestamp in emitted event', async () => {
      const { handler, io } = makeHandler();
      const socket = makeSocket();
      const before = Date.now();

      await handler.handleLiveLocationUpdate(socket, { ...VALID_COORDINATES, conversationId: CONV_ID });

      const emittedData = (io._toRoom.emit as jest.Mock).mock.calls[0][1] as any;
      expect(emittedData.timestamp).toBeInstanceOf(Date);
      expect(emittedData.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  // ── handleLiveLocationStop ─────────────────────────────────────────────────

  describe('handleLiveLocationStop', () => {
    it('broadcasts LOCATION_LIVE_STOPPED', async () => {
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect(io.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_CONV_ID));
      expect(io._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STOPPED,
        expect.objectContaining({
          conversationId: NORMALIZED_CONV_ID,
          userId: USER_ID,
        })
      );
    });

    it('includes stoppedAt Date in emitted event', async () => {
      const { handler, io } = makeHandler();
      const socket = makeSocket();
      const before = Date.now();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      const emittedData = (io._toRoom.emit as jest.Mock).mock.calls[0][1] as any;
      expect(emittedData.stoppedAt).toBeInstanceOf(Date);
      expect(emittedData.stoppedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('returns early when socket is not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socketToUser = new Map<string, string>();
      const { handler, io } = makeHandler({ socketToUser });
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect(io._toRoom.emit).not.toHaveBeenCalled();
    });

    it('returns early when user is not a participant', async () => {
      const prisma = makePrisma(null);
      const { handler, io } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect(io._toRoom.emit).not.toHaveBeenCalled();
    });

    it('catches errors without propagating', async () => {
      mockNormalize.mockRejectedValue(new Error('stop error'));
      const { handler } = makeHandler();
      const socket = makeSocket();

      await expect(handler.handleLiveLocationStop(socket, { conversationId: CONV_ID })).resolves.toBeUndefined();
    });
  });

  // ── Anonymous user participantId resolution ────────────────────────────────

  describe('anonymous user (isAnonymous = true)', () => {
    beforeEach(() => {
      mockGetConnectedUser.mockReturnValue({
        user: {
          id: USER_ID, isAnonymous: true, participantId: PARTICIPANT_ID,
          language: 'fr', resolvedLanguages: [], displayName: 'AnonUser',
        },
        realUserId: USER_ID,
      });
    });

    it('handleLiveLocationUpdate succeeds for anonymous user using session participantId', async () => {
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, { ...VALID_COORDINATES, conversationId: CONV_ID });

      expect(io._toRoom.emit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_UPDATED, expect.anything());
    });

    it('handleLiveLocationStop succeeds for anonymous user using session participantId', async () => {
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect(io._toRoom.emit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_STOPPED, expect.anything());
    });

    it('returns early when anonymous user has no participantId in session', async () => {
      mockGetConnectedUser.mockReturnValue({
        user: {
          id: USER_ID, isAnonymous: true, participantId: undefined,
          language: 'fr', resolvedLanguages: [], displayName: 'AnonUser',
        },
        realUserId: USER_ID,
      });
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLocationShare(socket, { ...VALID_COORDINATES, conversationId: CONV_ID }, jest.fn());

      // participantId is undefined → _resolveParticipantId returns undefined
      // That triggers the "Not a participant" error
      expect(io._toRoom.emit).not.toHaveBeenCalled();
    });
  });
});
