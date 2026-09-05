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
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';

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
    // Conversation OUVERTE par défaut — l'état terminal a sa propre suite.
    conversation: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true, closedAt: null }),
    },
  } as any;
}

function createMockSocket(socketId = 'socket-1') {
  // `socket.to(room).emit(...)` excludes the emitter — the sharer must never
  // receive its own LOCATION_LIVE_* echo (see LocationHandler broadcast comments).
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { id: socketId, to, emit } as any;
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
    resolvedLanguages: [],
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
// Un AUTRE membre de la MÊME conversation — placé en tête du double, il fait
// échouer tout `where` qui aurait perdu `userId` : la garde plate (#5191)
// rendrait alors CE participant-là, jamais `null`.
const INTRUDER_USER_ID = 'user-intruder';
const INTRUDER_PARTICIPANT_ID = 'participant-intruder';

function seedParticipant(prisma: ReturnType<typeof createMockPrisma>): void {
  prisma.participant.findFirst.mockImplementation(
    findFirstHonouringWhere([
      { id: INTRUDER_PARTICIPANT_ID, userId: INTRUDER_USER_ID, conversationId: NORMALIZED_ID, isActive: true },
      { id: PARTICIPANT_ID, userId: USER_ID, conversationId: NORMALIZED_ID, isActive: true },
    ])
  );
}

// Un membre de la conversation, mais PAS `USER_ID` : un `where` qui perdrait
// `userId` le trouverait quand même — c'est exactement la garde plate que
// #5191 nomme. Aucune ligne pour `USER_ID` : seul un `where` honorant
// `userId` peut légitimement rendre `null` ici.
function seedOnlyAnotherMember(prisma: ReturnType<typeof createMockPrisma>): void {
  prisma.participant.findFirst.mockImplementation(
    findFirstHonouringWhere([
      { id: INTRUDER_PARTICIPANT_ID, userId: INTRUDER_USER_ID, conversationId: NORMALIZED_ID, isActive: true },
    ])
  );
}

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

    seedParticipant(mockPrisma);

    handler = new LocationHandler({
      io: mockIO as any,
      prisma: mockPrisma,
      connectedUsers,
      socketToUser,
      normalizeConversationId,
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
      expect(socket.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_ID));
      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STARTED,
        expect.objectContaining({
          conversationId: NORMALIZED_ID,
          userId: USER_ID,
          durationMinutes: 60,
          username: 'TestUser',
        })
      );
      // Regression: NEVER broadcast to the whole room (would self-echo the sharer).
      expect(mockIO.to).not.toHaveBeenCalled();
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

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Validation failed: Invalid duration (must be 1-480 minutes)' });
    });

    it('returns error for invalid duration (exceeds max)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, durationMinutes: 481 };

      await handler.handleLiveLocationStart(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Validation failed: Invalid duration (must be 1-480 minutes)' });
    });

    it('returns error for invalid duration (negative)', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, durationMinutes: -5 };

      await handler.handleLiveLocationStart(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Validation failed: Invalid duration (must be 1-480 minutes)' });
    });

    it('returns error for invalid coordinates', async () => {
      const callback = jest.fn();
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, latitude: 'not-a-number' };

      await handler.handleLiveLocationStart(socket, invalidData as any, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Validation failed: Invalid coordinates' });
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
      seedOnlyAnotherMember(mockPrisma);

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

      expect(socket.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_ID));
      expect(socket.emit).toHaveBeenCalledWith(
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
      // Regression: never broadcast to the whole room (would self-echo the sharer).
      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('silently ignores when user is not authenticated', async () => {
      const socket = createMockSocket('unknown-socket');

      await handler.handleLiveLocationUpdate(socket, validData as any);

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('silently ignores invalid coordinates', async () => {
      const socket = createMockSocket(SOCKET_ID);
      const invalidData = { ...validData, latitude: 999 };

      await handler.handleLiveLocationUpdate(socket, invalidData as any);

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('silently ignores when not a participant', async () => {
      const socket = createMockSocket(SOCKET_ID);
      seedOnlyAnotherMember(mockPrisma);

      await handler.handleLiveLocationUpdate(socket, validData as any);

      expect(socket.to).not.toHaveBeenCalled();
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

      expect(socket.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_ID));
      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STOPPED,
        expect.objectContaining({
          conversationId: NORMALIZED_ID,
          userId: USER_ID,
          stoppedAt: expect.any(Date),
        })
      );
      // Regression: never broadcast to the whole room (would self-echo the sharer).
      expect(mockIO.to).not.toHaveBeenCalled();
    });

    it('silently ignores when user is not authenticated', async () => {
      const socket = createMockSocket('unknown-socket');

      await handler.handleLiveLocationStop(socket, validData as any);

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('silently ignores when not a participant', async () => {
      const socket = createMockSocket(SOCKET_ID);
      seedOnlyAnotherMember(mockPrisma);

      await handler.handleLiveLocationStop(socket, validData as any);

      expect(socket.to).not.toHaveBeenCalled();
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
  });
});
