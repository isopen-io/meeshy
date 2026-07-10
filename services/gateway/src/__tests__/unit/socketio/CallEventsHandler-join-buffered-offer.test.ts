/**
 * CallEventsHandler — buffered offer sender validation (C2 fix)
 *
 * §4.6: When a joining participant's socket arrives after the caller's offer
 * was buffered, the gateway replays it. The C2 fix gates this replay on the
 * sender still being an active (leftAt === null) participant in the call.
 *
 * If the sender left between buffering and the (re)join, the offer is stale:
 * - Replaying it leaks the departed sender's identity
 * - The callee would send an answer to a participant no longer in the call
 * Both are silent failures without this guard.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockJoinCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>().mockReturnValue([]);
const mockClearRingingTimeout = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    joinCall: mockJoinCall,
    generateIceServers: mockGenerateIceServers,
    clearRingingTimeout: mockClearRingingTimeout,
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),

  isValidationFailure: jest.fn((r) => !r.success),
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
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
    CALL_SIGNAL: { maxRequests: 60, windowMs: 60000, keyPrefix: 'socket:call:signal' },
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
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CALLEE_ID = 'user-callee-abc';
const CALLER_ID = 'user-caller-xyz';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const CALLEE_PARTICIPANT_ROW_ID = 'participant-callee-row-001';
const CALLER_PARTICIPANT_ROW_ID = 'participant-caller-row-002';

const JOIN_DATA = { callId: CALL_ID };

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeCalleeParticipant(leftAt: Date | null = null) {
  return {
    id: CALLEE_PARTICIPANT_ROW_ID,
    callSessionId: CALL_ID,
    participantId: CALLEE_ID,
    participant: { userId: CALLEE_ID, displayName: 'Callee', user: { username: 'callee', avatar: null } },
    role: 'callee',
    joinedAt: new Date(),
    leftAt,
    isAudioEnabled: true,
    isVideoEnabled: false,
    connectionQuality: 'good',
  };
}

function makeCallerParticipant(leftAt: Date | null = null) {
  return {
    id: CALLER_PARTICIPANT_ROW_ID,
    callSessionId: CALL_ID,
    participantId: CALLER_ID,
    participant: { userId: CALLER_ID, displayName: 'Caller', user: { username: 'caller', avatar: null } },
    role: 'caller',
    joinedAt: new Date(),
    leftAt,
    isAudioEnabled: true,
    isVideoEnabled: false,
    connectionQuality: 'good',
  };
}

function makeCallSession(calleeLeft: Date | null = null, callerLeft: Date | null = null) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    mode: 'audio',
    status: 'active',
    participants: [
      makeCallerParticipant(callerLeft),
      makeCalleeParticipant(calleeLeft),
    ],
  };
}

function makePrisma() {
  return {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: CALLEE_PARTICIPANT_ROW_ID }),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-callee-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    join: jest.fn<any>(),
    emit: directEmit,
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }),
    data: {},
  };
  return { socket, handlers, directEmit };
}

function makeIo() {
  const roomEmit = jest.fn<any>();
  const fetchSockets = jest.fn<any>().mockResolvedValue([]);
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets }),
  };
  return { io, roomEmit, fetchSockets };
}

/** Inject a buffered offer into the handler's private map. */
function injectBufferedOffer(handler: CallEventsHandler, signalFrom: string, signalTo: string): void {
  const offer = {
    callId: CALL_ID,
    signal: {
      type: 'offer' as const,
      from: signalFrom,
      to: signalTo,
      sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
    },
  };
  (handler as any).bufferedOffers.set(CALL_ID, { signal: offer, bufferedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — buffered offer sender validation (C2)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
  });

  // -------------------------------------------------------------------------
  // Sender still active — offer should be replayed
  // -------------------------------------------------------------------------

  describe('when the buffered offer sender is still an active participant', () => {
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      // Caller (sender) is still active (leftAt = null)
      mockJoinCall.mockResolvedValue({ callSession: makeCallSession(null, null), iceServers: [] });

      const prisma = makePrisma();
      const { socket, handlers, directEmit: d } = makeSocket();
      directEmit = d;
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      injectBufferedOffer(handler, CALLER_ID, CALLEE_ID);
      handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
      await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());
    });

    it('replays the buffered offer to the joining socket', () => {
      const signalCalls = directEmit.mock.calls.filter(([ev]) => ev === CALL_EVENTS.SIGNAL);
      expect(signalCalls).toHaveLength(1);
    });

    it('replays the offer with the correct callId', () => {
      const [, payload] = directEmit.mock.calls.find(([ev]) => ev === CALL_EVENTS.SIGNAL)!;
      expect(payload.callId).toBe(CALL_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Sender left — offer should be suppressed and buffer cleared
  // -------------------------------------------------------------------------

  describe('when the buffered offer sender has already left the call', () => {
    let directEmit: jest.MockedFunction<any>;
    let handler: CallEventsHandler;

    beforeEach(async () => {
      // Caller (sender) has leftAt set — they are no longer active
      mockJoinCall.mockResolvedValue({
        callSession: makeCallSession(null, new Date()),  // callerLeft = now
        iceServers: [],
      });

      const prisma = makePrisma();
      const { socket, handlers, directEmit: d } = makeSocket();
      directEmit = d;
      const { io } = makeIo();

      handler = new CallEventsHandler(prisma);
      injectBufferedOffer(handler, CALLER_ID, CALLEE_ID);
      handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
      await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());
    });

    it('does NOT replay the stale offer to the joining socket', () => {
      const signalCalls = directEmit.mock.calls.filter(([ev]) => ev === CALL_EVENTS.SIGNAL);
      expect(signalCalls).toHaveLength(0);
    });

    it('clears the buffered offer from the map so it cannot replay again', () => {
      const buffered = (handler as any).bufferedOffers.get(CALL_ID);
      expect(buffered).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // No buffered offer — join completes normally without emitting SIGNAL
  // -------------------------------------------------------------------------

  describe('when there is no buffered offer for the call', () => {
    let directEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      mockJoinCall.mockResolvedValue({ callSession: makeCallSession(), iceServers: [] });

      const prisma = makePrisma();
      const { socket, handlers, directEmit: d } = makeSocket();
      directEmit = d;
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      // No injectBufferedOffer call — map is empty
      handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
      await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());
    });

    it('does not emit CALL_EVENTS.SIGNAL', () => {
      const signalCalls = directEmit.mock.calls.filter(([ev]) => ev === CALL_EVENTS.SIGNAL);
      expect(signalCalls).toHaveLength(0);
    });
  });
});
