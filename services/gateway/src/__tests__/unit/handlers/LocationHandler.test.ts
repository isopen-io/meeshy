/**
 * LocationHandler Unit Tests
 *
 * Tests location sharing, live location start/update/stop,
 * coordinate validation, authentication checks, and participant verification.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { LocationHandler } from '../../../socketio/handlers/LocationHandler';
import type { LocationHandlerDependencies } from '../../../socketio/handlers/LocationHandler';
import type { SocketUser } from '../../../socketio/utils/socket-helpers';

// ===== MOCKS =====

function createMockIO() {
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  return { to: mockTo, emit: mockEmit };
}

function createMockPrisma() {
  return {
    participant: {
      findFirst: jest.fn(),
    },
  } as any;
}

function createMockSocket(socketId = 'socket-1') {
  return { id: socketId } as any;
}

function createConnectedUsers(entries: Array<{ key: string; user: SocketUser }>) {
  const map = new Map<string, SocketUser>();
  for (const entry of entries) {
    map.set(entry.key, entry.user);
  }
  return map;
}

function createSocketToUser(entries: Array<{ socketId: string; userId: string }>) {
  const map = new Map<string, string>();
  for (const entry of entries) {
    map.set(entry.socketId, entry.userId);
  }
  return map;
}

function createMockUser(overrides: Partial<SocketUser> = {}): SocketUser {
  return {
    id: 'user-1',
    socketId: 'socket-1',
    isAnonymous: false,
    language: 'fr',
    userId: 'user-1',
    displayName: 'TestUser',
    ...overrides,
  };
}

// ===== TEST CONSTANTS =====

const USER_ID = 'user-1';
const SOCKET_ID = 'socket-1';
const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const NORMALIZED_ID = '507f1f77bcf86cd799439011';
const PARTICIPANT_ID = 'participant-1';

// ===== TESTS =====

describe('LocationHandler', () => {
  let handler: LocationHandler;
  let mockIO: ReturnType<typeof createMockIO>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let connectedUsers: Map<string, SocketUser>;
  let socketToUser: Map<string, string>;
  let normalizeConversationId: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockIO = createMockIO();
    mockPrisma = createMockPrisma();
    connectedUsers = createConnectedUsers([
      { key: USER_ID, user: createMockUser() },
    ]);
    socketToUser = createSocketToUser([
      { socketId: SOCKET_ID, userId: USER_ID },
    ]);
    normalizeConversationId = jest.fn<any>().mockResolvedValue(NORMALIZED_ID);

    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });

    handler = new LocationHandler({
      io: mockIO as any,
      prisma: mockPrisma,
      connectedUsers,
      socketToUser,
      normalizeConversationId,
    });
  });

  // =========================================================================
  // handleLocationShare
  // =========================================================================

  describe('handleLocationShare', () => {
    const validData = {
      conversationId: CONVERSATION_ID,
      latitude: 48.8566,
      longitude: 2.3522,
      altitude: 35,
      accuracy: 10,
      placeName: 'Paris',
      address: '1 Rue de Rivoli',
    };

    it('broadcasts location to conversation room on valid share', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);

      await handler.handleLocationShare(socket, validData as any, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: expect.objectContaining({
          conversationId: NORMALIZED_ID,
          userId: USER_ID,
          latitude: 48.8566,
          longitude: 2.3522,
        }) })
      );
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_SHARED,
        expect.objectContaining({
          conversationId: NORMALIZED_ID,
          userId: USER_ID,
          latitude: 48.8566,
          longitude: 2.3522,
          placeName: 'Paris',
          address: '1 Rue de Rivoli',
        })
      );
    });

    it('returns error for invalid coordinates (latitude out of range)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, latitude: 91 };

      await handler.handleLocationShare(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('returns error for invalid coordinates (longitude out of range)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, longitude: -181 };

      await handler.handleLocationShare(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('returns error when user is not authenticated', async () => {
      const callback = jest.fn();
      const socket = createMockSocket('unknown-socket');

      await handler.handleLocationShare(socket, validData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('returns error when user is not a participant', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await handler.handleLocationShare(socket, validData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Not a participant in this conversation' });
      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      normalizeConversationId.mockRejectedValue(new Error('DB error'));

      await handler.handleLocationShare(socket, validData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'DB error' });
    });

    it('works without callback', async () => {
      const socket = createMockSocket(SOCKET_ID);

      await handler.handleLocationShare(socket, validData as any);

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_SHARED,
        expect.objectContaining({ userId: USER_ID })
      );
    });
  });

  // =========================================================================
  // handleLiveLocationStart
  // =========================================================================

  describe('handleLiveLocationStart', () => {
    const validData = {
      conversationId: CONVERSATION_ID,
      latitude: 48.8566,
      longitude: 2.3522,
      durationMinutes: 60,
    };

    it('broadcasts live location start on valid data', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);

      await handler.handleLiveLocationStart(socket, validData as any, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: expect.objectContaining({
          conversationId: NORMALIZED_ID,
          userId: USER_ID,
          durationMinutes: 60,
        }) })
      );
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STARTED,
        expect.objectContaining({
          conversationId: NORMALIZED_ID,
          userId: USER_ID,
          durationMinutes: 60,
          username: 'TestUser',
        })
      );
    });

    it('includes expiresAt and startedAt in event data', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);

      await handler.handleLiveLocationStart(socket, validData as any, callback);

      const eventData = (callback.mock.calls[0][0] as any).data;
      expect(eventData.expiresAt).toBeInstanceOf(Date);
      expect(eventData.startedAt).toBeInstanceOf(Date);
      expect(eventData.expiresAt.getTime() - eventData.startedAt.getTime()).toBe(60 * 60_000);
    });

    it('returns error for invalid duration (zero)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, durationMinutes: 0 };

      await handler.handleLiveLocationStart(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid duration (must be 1-480 minutes)' });
    });

    it('returns error for invalid duration (exceeds max)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, durationMinutes: 481 };

      await handler.handleLiveLocationStart(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid duration (must be 1-480 minutes)' });
    });

    it('returns error for invalid duration (negative)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, durationMinutes: -5 };

      await handler.handleLiveLocationStart(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid duration (must be 1-480 minutes)' });
    });

    it('returns error for invalid coordinates', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, latitude: 'not-a-number' };

      await handler.handleLiveLocationStart(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Invalid coordinates' });
    });

    it('returns error when not authenticated', async () => {
      const callback = jest.fn();
      const socket = createMockSocket('unknown-socket');

      await handler.handleLiveLocationStart(socket, validData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
    });

    it('returns error when not a participant', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await handler.handleLiveLocationStart(socket, validData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Not a participant in this conversation' });
    });
  });

  // =========================================================================
  // handleLiveLocationUpdate
  // =========================================================================

  describe('handleLiveLocationUpdate', () => {
    const validData = {
      conversationId: CONVERSATION_ID,
      latitude: 48.8570,
      longitude: 2.3525,
      altitude: 36,
      accuracy: 8,
      speed: 1.5,
      heading: 90,
    };

    it('broadcasts location update to conversation room', async () => {
      const socket = createMockSocket(SOCKET_ID);

      await handler.handleLiveLocationUpdate(socket, validData as any);

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_UPDATED,
        expect.objectContaining({
          conversationId: NORMALIZED_ID,
          userId: USER_ID,
          latitude: 48.8570,
          longitude: 2.3525,
          speed: 1.5,
          heading: 90,
        })
      );
    });

    it('silently ignores when user is not authenticated', async () => {
      const socket = createMockSocket('unknown-socket');

      await handler.handleLiveLocationUpdate(socket, validData as any);

      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('silently ignores invalid coordinates', async () => {
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, latitude: 999 };

      await handler.handleLiveLocationUpdate(socket, invalidData as any);

      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('silently ignores when not a participant', async () => {
      const socket = createMockSocket(SOCKET_ID);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await handler.handleLiveLocationUpdate(socket, validData as any);

      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('handles errors without throwing', async () => {
      const socket = createMockSocket(SOCKET_ID);
      normalizeConversationId.mockRejectedValue(new Error('Network error'));

      await expect(handler.handleLiveLocationUpdate(socket, validData as any)).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // handleLiveLocationStop
  // =========================================================================

  describe('handleLiveLocationStop', () => {
    const validData = {
      conversationId: CONVERSATION_ID,
    };

    it('broadcasts live location stop to conversation room', async () => {
      const socket = createMockSocket(SOCKET_ID);

      await handler.handleLiveLocationStop(socket, validData as any);

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STOPPED,
        expect.objectContaining({
          conversationId: NORMALIZED_ID,
          userId: USER_ID,
          stoppedAt: expect.any(Date),
        })
      );
    });

    it('silently ignores when user is not authenticated', async () => {
      const socket = createMockSocket('unknown-socket');

      await handler.handleLiveLocationStop(socket, validData as any);

      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('silently ignores when not a participant', async () => {
      const socket = createMockSocket(SOCKET_ID);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await handler.handleLiveLocationStop(socket, validData as any);

      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('handles errors without throwing', async () => {
      const socket = createMockSocket(SOCKET_ID);
      normalizeConversationId.mockRejectedValue(new Error('DB down'));

      await expect(handler.handleLiveLocationStop(socket, validData as any)).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Coordinate validation edge cases
  // =========================================================================

  describe('coordinate validation edge cases', () => {
    const baseData = {
      conversationId: CONVERSATION_ID,
      latitude: 0,
      longitude: 0,
    };

    it('accepts boundary coordinates (90, 180)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const data = { ...baseData, latitude: 90, longitude: 180, durationMinutes: 10 };

      await handler.handleLiveLocationStart(socket, data as any, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('accepts boundary coordinates (-90, -180)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const data = { ...baseData, latitude: -90, longitude: -180, durationMinutes: 10 };

      await handler.handleLiveLocationStart(socket, data as any, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('accepts zero coordinates (0, 0)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const data = { ...baseData, latitude: 0, longitude: 0, placeName: 'Null Island' };

      await handler.handleLocationShare(socket, data as any, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // =========================================================================
  // Anonymous user handling
  // =========================================================================

  describe('anonymous user handling', () => {
    it('uses participantId for anonymous users', async () => {
      const anonUser = createMockUser({
        id: 'anon-token',
        isAnonymous: true,
        participantId: 'anon-participant-1',
      });
      connectedUsers.set('anon-token', anonUser);
      socketToUser.set('anon-socket', 'anon-token');

      const callback = jest.fn();
      const socket = createMockSocket('anon-socket');
      const data = {
        conversationId: CONVERSATION_ID,
        latitude: 48.8566,
        longitude: 2.3522,
      };

      await handler.handleLocationShare(socket, data as any, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    });
  });
});
