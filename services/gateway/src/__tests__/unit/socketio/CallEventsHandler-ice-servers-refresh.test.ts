/**
 * CallEventsHandler — call:request-ice-servers handler
 *
 * Covers the TURN credential refresh flow:
 *  - happy path: authenticated participant in call room receives fresh ICE servers
 *  - not-in-room guard: socket not in call room receives NOT_A_PARTICIPANT error
 *  - unauthenticated guard: unknown socket returns early (no emit)
 *  - validation failure: invalid payload returns early (no emit)
 *  - error handling: generateIceServers throws → logs error, no crash
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockGenerateIceServers = jest.fn<any>().mockReturnValue([
  { urls: 'stun:stun.example.com:3478' },
  { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' },
]);
const mockGetIceServerTtl = jest.fn<any>().mockReturnValue(480);
// Backs `resolveActiveCallParticipantId` (authz upgrade — audit gateway prod
// 2026-07-02, backlog item "authz call:request-ice-servers"): the handler now
// verifies an ACTIVE CallParticipant of this specific call via
// `callService.getCallSession`, not merely conversation membership.
const mockGetCallSession = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    generateIceServers: mockGenerateIceServers,
    getIceServerTtl: mockGetIceServerTtl,
    getCallSession: mockGetCallSession,
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

const mockValidateSocketEvent = jest.fn<any>();
jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: mockValidateSocketEvent,
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));

const mockCheckRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    CALL_ICE_CANDIDATE: { maxRequests: 50, windowMs: 5000, keyPrefix: 'socket:call:ice' },
    CALL_SIGNAL: { maxRequests: 100, windowMs: 10000, keyPrefix: 'socket:call:signal' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
    CALL_INITIATE: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:call:initiate' },
    CALL_END: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:end' },
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-participant-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CALL_ROOM = `call:${CALL_ID}`;

const REQUEST_DATA = { callId: CALL_ID };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    callSession: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as unknown as PrismaClient;
}

// Configures `resolveActiveCallParticipantId`'s underlying
// `callService.getCallSession` lookup for the requesting USER_ID.
function configureActiveParticipant(isActiveParticipant: boolean) {
  mockGetCallSession.mockResolvedValue({
    participants: isActiveParticipant
      ? [{ participantId: 'participant-id-1', leftAt: null, participant: { userId: USER_ID } }]
      : []
  });
}

function makeSocket({ inCallRoom = true }: { inCallRoom?: boolean } = {}) {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const directEmit = jest.fn<any>();
  const rooms = new Set<string>(['socket-id-1']);
  if (inCallRoom) rooms.add(CALL_ROOM);

  const socket = {
    id: 'socket-id-1',
    on: jest.fn((event: string, fn: (...args: unknown[]) => unknown) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms,
    data: {},
  };
  return { socket, handlers, directEmit };
}

function makeIo() {
  const roomEmit = jest.fn<any>();
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
  };
  return { io, roomEmit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:request-ice-servers handler', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateSocketEvent.mockReturnValue({ success: true });
    mockGenerateIceServers.mockReturnValue([
      { urls: 'stun:stun.example.com:3478' },
      { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' },
    ]);
    mockGetIceServerTtl.mockReturnValue(480);
    configureActiveParticipant(false);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path: authenticated participant in call room', () => {
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      configureActiveParticipant(true);
      const prisma = makePrisma();
      const { socket, handlers, directEmit: emit } = makeSocket({ inCallRoom: true });
      directEmit = emit;
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);
      await handlers[CALL_EVENTS.REQUEST_ICE_SERVERS](REQUEST_DATA);
    });

    it('calls generateIceServers with the authenticated userId', () => {
      expect(mockGenerateIceServers).toHaveBeenCalledWith(USER_ID);
    });

    it('calls getIceServerTtl to include TTL in response', () => {
      expect(mockGetIceServerTtl).toHaveBeenCalled();
    });

    it('emits ICE_SERVERS_REFRESHED to the requesting socket', () => {
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ICE_SERVERS_REFRESHED,
        expect.objectContaining({
          callId: CALL_ID,
          iceServers: expect.any(Array),
          ttl: 480,
        })
      );
    });

    it('includes both STUN and TURN servers in the refresh response', () => {
      const emitCall = directEmit.mock.calls.find(
        ([event]) => event === CALL_EVENTS.ICE_SERVERS_REFRESHED
      );
      const payload = emitCall?.[1] as { iceServers: unknown[] };
      expect(payload.iceServers).toHaveLength(2);
    });

    it('does not emit a CALL_ERROR event on success', () => {
      const errorEmits = directEmit.mock.calls.filter(
        ([event]) => event === CALL_EVENTS.ERROR
      );
      expect(errorEmits).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Defense-in-depth: in room but not an active participant
  // -------------------------------------------------------------------------

  describe('stale-room guard: socket is in the call room but DB has no active participant', () => {
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      configureActiveParticipant(false);
      const prisma = makePrisma();
      const { socket, handlers, directEmit: emit } = makeSocket({ inCallRoom: true });
      directEmit = emit;
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);
      await handlers[CALL_EVENTS.REQUEST_ICE_SERVERS](REQUEST_DATA);
    });

    it('emits NOT_A_PARTICIPANT error even though the socket is in the room', () => {
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
    });

    it('does not call generateIceServers when the caller is not an active participant', () => {
      expect(mockGenerateIceServers).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Not-in-room guard
  // -------------------------------------------------------------------------

  describe('not-in-room guard: socket not joined to the call room', () => {
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      const prisma = makePrisma();
      const { socket, handlers, directEmit: emit } = makeSocket({ inCallRoom: false });
      directEmit = emit;
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);
      await handlers[CALL_EVENTS.REQUEST_ICE_SERVERS](REQUEST_DATA);
    });

    it('emits NOT_A_PARTICIPANT error to socket', () => {
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
    });

    it('does not call generateIceServers when socket is not in call room', () => {
      expect(mockGenerateIceServers).not.toHaveBeenCalled();
    });

    it('does not emit ICE_SERVERS_REFRESHED when rejected', () => {
      const refreshEmits = directEmit.mock.calls.filter(
        ([event]) => event === CALL_EVENTS.ICE_SERVERS_REFRESHED
      );
      expect(refreshEmits).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Unauthenticated guard
  // -------------------------------------------------------------------------

  describe('unauthenticated guard: getUserId returns null', () => {
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      const prisma = makePrisma();
      const { socket, handlers, directEmit: emit } = makeSocket({ inCallRoom: true });
      directEmit = emit;
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => null);
      await handlers[CALL_EVENTS.REQUEST_ICE_SERVERS](REQUEST_DATA);
    });

    it('does not emit ICE_SERVERS_REFRESHED for unauthenticated socket', () => {
      const refreshEmits = directEmit.mock.calls.filter(
        ([event]) => event === CALL_EVENTS.ICE_SERVERS_REFRESHED
      );
      expect(refreshEmits).toHaveLength(0);
    });

    it('does not call generateIceServers for unauthenticated socket', () => {
      expect(mockGenerateIceServers).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Validation failure
  // -------------------------------------------------------------------------

  describe('validation failure: invalid payload schema', () => {
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false });

      const prisma = makePrisma();
      const { socket, handlers, directEmit: emit } = makeSocket({ inCallRoom: true });
      directEmit = emit;
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);
      await handlers[CALL_EVENTS.REQUEST_ICE_SERVERS]({ invalid: 'data' });
    });

    it('does not emit ICE_SERVERS_REFRESHED on validation failure', () => {
      const refreshEmits = directEmit.mock.calls.filter(
        ([event]) => event === CALL_EVENTS.ICE_SERVERS_REFRESHED
      );
      expect(refreshEmits).toHaveLength(0);
    });

    it('does not call generateIceServers on validation failure', () => {
      expect(mockGenerateIceServers).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling: generateIceServers throws', () => {
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      mockGenerateIceServers.mockImplementation(() => {
        throw new Error('TURN service unavailable');
      });

      const prisma = makePrisma();
      const { socket, handlers, directEmit: emit } = makeSocket({ inCallRoom: true });
      directEmit = emit;
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);
      await handlers[CALL_EVENTS.REQUEST_ICE_SERVERS](REQUEST_DATA);
    });

    it('does not crash or reject the outer handler when generateIceServers throws', () => {
      // No assertion needed — the test itself would throw if the handler propagated
      expect(true).toBe(true);
    });

    it('does not emit ICE_SERVERS_REFRESHED when generation fails', () => {
      const refreshEmits = directEmit.mock.calls.filter(
        ([event]) => event === CALL_EVENTS.ICE_SERVERS_REFRESHED
      );
      expect(refreshEmits).toHaveLength(0);
    });
  });
});
