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
  (handler as any).bufferedOffers.set(`${CALL_ID}:${signalTo}`, { signal: offer, bufferedAt: Date.now() });
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
      const buffered = (handler as any).bufferedOffers.get(`${CALL_ID}:${CALLEE_ID}`);
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

// ---------------------------------------------------------------------------
// §4.6 follow-up — buffered ANSWER replay to the (re)joining caller
//
// The offer/answer buffer is keyed `${callId}:${to}` (independent per
// recipient) precisely so a buffered offer for the callee and a buffered
// answer for the caller can coexist on the same call without one
// overwriting the other. This proves the replay path (call:join) delivers
// a buffered answer just like it already delivers a buffered offer.
// ---------------------------------------------------------------------------

describe('CallEventsHandler — buffered ANSWER replay on (re)join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
  });

  function injectBufferedAnswer(handler: CallEventsHandler, signalFrom: string, signalTo: string): void {
    const answer = {
      callId: CALL_ID,
      signal: {
        type: 'answer' as const,
        from: signalFrom,
        to: signalTo,
        sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
      },
    };
    (handler as any).bufferedOffers.set(`${CALL_ID}:${signalTo}`, { signal: answer, bufferedAt: Date.now() });
  }

  it('replays a buffered answer to the (re)joining caller', async () => {
    // Callee (sender of the answer) is still active
    mockJoinCall.mockResolvedValue({ callSession: makeCallSession(null, null), iceServers: [] });

    const prisma = makePrisma();
    const { socket, handlers, directEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    injectBufferedAnswer(handler, CALLEE_ID, CALLER_ID);
    handler.setupCallEvents(socket as any, io, () => CALLER_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    const signalCalls = directEmit.mock.calls.filter(([ev]: any[]) => ev === CALL_EVENTS.SIGNAL);
    expect(signalCalls).toHaveLength(1);
    expect(signalCalls[0][1].signal.type).toBe('answer');
  });

  it('does not replay a buffered offer meant for the callee to the (re)joining caller', async () => {
    mockJoinCall.mockResolvedValue({ callSession: makeCallSession(null, null), iceServers: [] });

    const prisma = makePrisma();
    const { socket, handlers, directEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    // Offer buffered for the CALLEE's slot — the CALLER joining must not see it.
    injectBufferedOffer(handler, CALLER_ID, CALLEE_ID);
    handler.setupCallEvents(socket as any, io, () => CALLER_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    const signalCalls = directEmit.mock.calls.filter(([ev]: any[]) => ev === CALL_EVENTS.SIGNAL);
    expect(signalCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ringing timer ownership (item F follow-up — chaos-2 re-test)
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:join leaves the ringing timer alone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
  });

  it('does NOT clear the ringing timer on join — only the SDP answer settles the ring', async () => {
    // The callee EARLY-joins while still ringing (the offer must flow during
    // the ring). Clearing the timer in the join handler's finally left NO
    // server-side bound on the ring after any join, and wiped the timer the
    // boot rehydration had just re-armed after a mid-ring restart — the call
    // then decayed via the GC tier (~150s) instead of resolving missed at its
    // nominal remaining budget. The answer path (call:signal answer) and the
    // terminal paths (leave/end/service-level, item I) already own the clear.
    mockJoinCall.mockResolvedValue({ callSession: makeCallSession(null, null), iceServers: [] });
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    expect(mockClearRingingTimeout).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C8 — last join wins: evict stale same-user sockets from the call room
// ---------------------------------------------------------------------------

describe('CallEventsHandler — C8 same-user socket dedup on join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
  });

  function makeRemoteSocket(id: string) {
    return { id, leave: jest.fn<any>() };
  }

  it('evicts older sockets of the SAME user from the call room on join', async () => {
    // Prod audit C8 (callIds 6a4607a9…/6a4607bb…): a user re-joining from a
    // NEW socket (churn, second tab) left stale sockets of the same user in
    // the room — every targeted signal then fanned out to N sockets
    // (targetSockets:2, glare risk, double analytics). A P2P call has exactly
    // one signaling endpoint per user: last join wins.
    mockJoinCall.mockResolvedValue({ callSession: makeCallSession(null, null), iceServers: [] });
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const staleOwn = makeRemoteSocket('stale-own-socket');
    const peerSocket = makeRemoteSocket('peer-socket');
    const { io } = makeIo();
    (io as any).in = jest.fn(() => ({
      fetchSockets: jest.fn<any>().mockResolvedValue([staleOwn, peerSocket, { id: socket.id, leave: jest.fn() }]),
    }));

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, (sid: string) =>
      sid === 'peer-socket' ? CALLER_ID : CALLEE_ID
    );
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    expect(staleOwn.leave).toHaveBeenCalledWith(`call:${CALL_ID}`);
    expect(peerSocket.leave).not.toHaveBeenCalled();
  });
});
