/**
 * Unit tests for LocationHandler
 * Covers: handleLiveLocationStart, handleLiveLocationUpdate,
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
import { findFirstHonouringWhere } from '../../../__tests__/helpers/find-first-honouring-where';

// ─── Factories ────────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-loc';
const USER_ID = 'user-loc-001';
const CONV_ID = '507f1f77bcf86cd799439011';
const NORMALIZED_CONV_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = 'participant-loc-001';
// Un AUTRE participant, ACTIF dans la MÊME conversation — ni `USER_ID` ni
// `PARTICIPANT_ID`. Placé en tête du double, il fait échouer tout `where` qui
// perdrait son `userId` (branche inscrite) ou son `id` (branche anonyme) : la
// garde plate rendrait alors CET intrus, jamais `null` (#5191).
const INTRUDER_USER_ID = 'user-loc-intruder';
const INTRUDER_PARTICIPANT_ID = 'participant-loc-intruder';

const VALID_COORDINATES = { latitude: 48.8566, longitude: 2.3522 };

function makeSocket(): Socket {
  const toRoom = { emit: jest.fn() };
  return {
    id: SOCKET_ID,
    emit: jest.fn(),
    // `socket.to(room)` excludes the emitter — the sharer must never receive
    // its own LOCATION_LIVE_* echo (see LocationHandler broadcast comments).
    to: jest.fn<any>().mockReturnValue(toRoom),
    _toRoom: toRoom,
  } as unknown as Socket;
}

function makeIo() {
  const toRoom = { emit: jest.fn() };
  return {
    io: { to: jest.fn<any>().mockReturnValue(toRoom), _toRoom: toRoom } as any,
    toRoom,
  };
}

// Une ligne satisfaisant les DEUX `where` (`id` pour la branche anonyme,
// `userId` pour la branche inscrite) — comme une vraie ligne `Participant`,
// qui porte toujours les deux colonnes à la fois.
const REAL_PARTICIPANT_ROW = {
  id: PARTICIPANT_ID,
  userId: USER_ID,
  conversationId: NORMALIZED_CONV_ID,
  isActive: true,
};
const INTRUDER_ROW = {
  id: INTRUDER_PARTICIPANT_ID,
  userId: INTRUDER_USER_ID,
  conversationId: NORMALIZED_CONV_ID,
  isActive: true,
};

function makePrisma(rows: ReadonlyArray<Record<string, unknown>> = [INTRUDER_ROW, REAL_PARTICIPANT_ROW]): any {
  return {
    participant: {
      findFirst: jest.fn<any>(findFirstHonouringWhere(rows)),
    },
    // Conversation OUVERTE par défaut — l'état terminal a sa propre suite.
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ isActive: true, closedAt: null }),
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

      expect((socket as any).to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_CONV_ID));
      expect((socket as any)._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STARTED,
        expect.objectContaining({
          conversationId: NORMALIZED_CONV_ID,
          userId: USER_ID,
          durationMinutes: 30,
        })
      );
      // Regression: NEVER broadcast to the whole room (would self-echo the sharer).
      expect(io.to).not.toHaveBeenCalled();
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

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Validation failed: Invalid coordinates' });
    });

    it('returns error for durationMinutes = 0', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 0,
      }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Validation failed: Invalid duration (must be 1-480 minutes)' });
    });

    it('returns error for durationMinutes = 481 (over max)', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 481,
      }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Validation failed: Invalid duration (must be 1-480 minutes)' });
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
      const prisma = makePrisma([INTRUDER_ROW]);
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
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStart(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, durationMinutes: 5,
      }, cb);

      const toRoom = (socket as any)._toRoom;
      const emittedData = (toRoom.emit as jest.Mock).mock.calls[0][1] as any;
      expect(emittedData.username).toBe('Alice Loc');
    });

    it('catches errors and returns error via callback', async () => {
      mockNormalize.mockRejectedValue(new Error('normalize failed'));
      const prisma = makePrisma();
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

      expect((socket as any).to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_CONV_ID));
      expect((socket as any)._toRoom.emit).toHaveBeenCalledWith(
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
      // Regression: never broadcast to the whole room (would self-echo the sharer).
      expect(io.to).not.toHaveBeenCalled();
    });

    it('returns early when socket is not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socketToUser = new Map<string, string>();
      const { handler } = makeHandler({ socketToUser });
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID,
      });

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
    });

    it('returns early for invalid coordinates', async () => {
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        latitude: 999, longitude: 0, conversationId: CONV_ID,
      });

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
    });

    it('returns early when user is not a participant', async () => {
      const prisma = makePrisma([INTRUDER_ROW]);
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID,
      });

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
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
      const { handler } = makeHandler();
      const socket = makeSocket();
      const before = Date.now();

      await handler.handleLiveLocationUpdate(socket, { ...VALID_COORDINATES, conversationId: CONV_ID });

      const emittedData = ((socket as any)._toRoom.emit as jest.Mock).mock.calls[0][1] as any;
      expect(emittedData.timestamp).toBeInstanceOf(Date);
      expect(emittedData.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    });

    // ── Boundary: the four optional telemetry fields travel À CÔTÉ of the two
    // guarded coordinates. They are broadcast verbatim to every peer's map, so
    // a forged non-finite / non-numeric value must be REFUSED at the boundary,
    // never relayed (cycle 107 "douzième famille" + itération 280 emoji bound).
    it.each([
      ['speed', Number.POSITIVE_INFINITY],
      ['altitude', Number.NaN],
      ['accuracy', Number.NEGATIVE_INFINITY],
    ])('drops an update whose %s is non-finite (never relays it to peers)', async (field, value) => {
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, [field]: value,
      } as any);

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
    });

    it('drops an update whose heading is not a number', async () => {
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID, heading: 'north',
      } as any);

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
    });

    it('drops an update whose latitude is non-finite (NaN)', async () => {
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        latitude: Number.NaN, longitude: 0, conversationId: CONV_ID,
      } as any);

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
    });

    it('still relays valid finite telemetry', async () => {
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, {
        ...VALID_COORDINATES, conversationId: CONV_ID,
        altitude: 12.5, accuracy: 3, speed: 0, heading: 359.9,
      });

      expect((socket as any)._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_UPDATED,
        expect.objectContaining({ altitude: 12.5, accuracy: 3, speed: 0, heading: 359.9 }),
      );
    });
  });

  // ── handleLiveLocationStop ─────────────────────────────────────────────────

  describe('handleLiveLocationStop', () => {
    it('broadcasts LOCATION_LIVE_STOPPED', async () => {
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect((socket as any).to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_CONV_ID));
      expect((socket as any)._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STOPPED,
        expect.objectContaining({
          conversationId: NORMALIZED_CONV_ID,
          userId: USER_ID,
        })
      );
      // Regression: never broadcast to the whole room (would self-echo the sharer).
      expect(io.to).not.toHaveBeenCalled();
    });

    it('includes stoppedAt Date in emitted event', async () => {
      const { handler } = makeHandler();
      const socket = makeSocket();
      const before = Date.now();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      const emittedData = ((socket as any)._toRoom.emit as jest.Mock).mock.calls[0][1] as any;
      expect(emittedData.stoppedAt).toBeInstanceOf(Date);
      expect(emittedData.stoppedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('returns early when socket is not authenticated', async () => {
      mockGetConnectedUser.mockReturnValue(null);
      const socketToUser = new Map<string, string>();
      const { handler } = makeHandler({ socketToUser });
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
    });

    it('rejects a forged payload missing conversationId at the Zod boundary', async () => {
      // location:live-stop had no boundary guard before iter 281 — a forged
      // payload without conversationId went straight to normalizeConversationId.
      // The schema now refuses it before any work; the stream verb has no
      // callback, so the only observable is that nothing is normalized/emitted.
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, {} as any);

      expect(mockNormalize).not.toHaveBeenCalled();
      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
    });

    it('returns early when user is not a participant', async () => {
      const prisma = makePrisma([INTRUDER_ROW]);
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
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
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, { ...VALID_COORDINATES, conversationId: CONV_ID });

      expect((socket as any)._toRoom.emit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_UPDATED, expect.anything());
    });

    it('handleLiveLocationStop succeeds for anonymous user using session participantId', async () => {
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect((socket as any)._toRoom.emit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_STOPPED, expect.anything());
    });

    // La branche anonyme n'avait AUCUN témoin de refus : les deux tests
    // ci-dessus prouvent seulement que « quelqu'un » de trouvé suffit. Ici
    // aucune ligne ne porte `PARTICIPANT_ID` — seul un `where` honorant `id`
    // peut légitimement rendre `null` ; un `where` qui l'aurait perdu
    // trouverait l'intrus, actif dans la MÊME conversation (#5191).
    it('handleLiveLocationUpdate stays silent for an anonymous session whose participantId matches no one', async () => {
      const prisma = makePrisma([INTRUDER_ROW]);
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleLiveLocationUpdate(socket, { ...VALID_COORDINATES, conversationId: CONV_ID });

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalled();
    });
  });
});
