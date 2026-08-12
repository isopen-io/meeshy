/**
 * CallEventsHandler — CALL_EVENTS.ALREADY_ANSWERED scope (audit calls, Vague 104)
 *
 * Item F changed what `call:join` MEANS: joinCallAttempt only ever
 * transitions the call to `ringing` (the callee's device is ringing,
 * receiving the SDP offer while the user hasn't answered yet) — never
 * `active`. iOS auto-early-joins the call room on `call:initiated`, BEFORE
 * the user answers, so it can receive the SDP offer while still ringing
 * (`joinCallRoomReliably`).
 *
 * The `call:join` handler used to emit `CALL_EVENTS.ALREADY_ANSWERED`
 * unconditionally to the joining user's other sockets on every successful
 * join. With a user signed into two devices, whichever device early-joins
 * first made the OTHER, still-ringing, never-answered device immediately
 * dismiss its incoming-call UI as "answered elsewhere" — a real call could
 * be missed entirely although both devices were genuinely ringing.
 *
 * The genuine "callee answered" transition happens on the SDP `answer`
 * signal. This suite locks: (1) join no longer emits ALREADY_ANSWERED at
 * all, regardless of call state; (2) the first real answer DOES emit it,
 * from both the normal-relay and the target-socketless branches; (3) a
 * later renegotiation answer and the initiator's own answer do NOT
 * re-trigger it — mirroring the existing `shouldMirrorAnsweredElsewhere`
 * predicate already proven for the push twin.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockJoinCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>().mockReturnValue([]);
const mockClearRingingTimeout = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();
const mockUpdateCallStatus = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    joinCall: mockJoinCall,
    generateIceServers: mockGenerateIceServers,
    clearRingingTimeout: mockClearRingingTimeout,
    getCallSession: mockGetCallSession,
    updateCallStatus: mockUpdateCallStatus,
    getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn().mockImplementation(() => ({
    sendToUser: mockSendToUser,
  })),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
  isValidationFailure: jest.fn((r: any) => !r.success),
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
  checkSocketRateLimit: jest.fn<any>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
    CALL_SIGNAL: { maxRequests: 100, windowMs: 10000, keyPrefix: 'socket:call:signal' },
    CALL_ICE_CANDIDATE: { maxRequests: 60, windowMs: 10000, keyPrefix: 'socket:call:ice' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants & factories
// ---------------------------------------------------------------------------

const CALLEE_ID = 'user-callee-abc';
const CALLER_ID = 'user-caller-xyz';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const CALLEE_PARTICIPANT_ROW_ID = 'participant-callee-row-001';
const CALLER_PARTICIPANT_ROW_ID = 'participant-caller-row-002';

const JOIN_DATA = { callId: CALL_ID };

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

/** Session shape returned by CallService.joinCall (call:join handler). */
function makeJoinedCallSession(status: 'ringing' | 'active' = 'ringing') {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    mode: 'audio',
    status,
    participants: [makeCallerParticipant(null), makeCalleeParticipant(null)],
  };
}

/** Session shape returned by CallService.getCallSession (call:signal handler). */
function makeSignalSession(overrides: Partial<{ answeredAt: Date | null; initiatorId: string }> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: overrides.initiatorId ?? CALLER_ID,
    answeredAt: 'answeredAt' in overrides ? overrides.answeredAt : null,
    status: 'ringing',
    participants: [
      { participantId: CALLER_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: CALLER_ID } },
      { participantId: CALLEE_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: CALLEE_ID } },
    ],
  };
}

function makeAnswerSignal(from: string, to: string) {
  return {
    callId: CALL_ID,
    signal: { type: 'answer' as const, from, to, sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
  };
}

function makePrisma() {
  return {
    callSession: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: CALLEE_PARTICIPANT_ROW_ID }) },
  } as unknown as PrismaClient;
}

function makeSocket(socketId = 'socket-1') {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const toEmit = jest.fn<any>();
  const socket = {
    id: socketId,
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    emit: directEmit,
    to: jest.fn<any>().mockReturnValue({ emit: toEmit }),
    data: {},
  };
  return { socket, handlers, directEmit, toEmit };
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

/** All ALREADY_ANSWERED calls emitted via `socket.to(...).emit(...)`. */
function alreadyAnsweredCalls(toEmit: jest.MockedFunction<any>) {
  return toEmit.mock.calls.filter(([ev]) => ev === CALL_EVENTS.ALREADY_ANSWERED);
}

describe('CallEventsHandler — call:join no longer emits ALREADY_ANSWERED', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not emit ALREADY_ANSWERED on an ordinary (first) join', async () => {
    mockJoinCall.mockResolvedValue({ callSession: makeJoinedCallSession('ringing'), iceServers: [] });
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    expect(alreadyAnsweredCalls(toEmit)).toHaveLength(0);
  });

  it('does not emit ALREADY_ANSWERED even when a second device joins the same still-ringing call', async () => {
    // This is the exact multi-device scenario the bug produced: two of the
    // callee's devices both received call:initiated and both auto-early-
    // join. Neither join may dismiss the other's ringing UI.
    mockJoinCall.mockResolvedValue({ callSession: makeJoinedCallSession('ringing'), iceServers: [] });
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket('socket-device-2');
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    expect(alreadyAnsweredCalls(toEmit)).toHaveLength(0);
  });
});

describe('CallEventsHandler — call:signal answer emits ALREADY_ANSWERED (relocated gate)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits ALREADY_ANSWERED to the answerer room on the first real answer', async () => {
    mockGetCallSession.mockResolvedValue(makeSignalSession({ answeredAt: null, initiatorId: CALLER_ID }));
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([{ id: 'caller-socket', leave: jest.fn() }]);

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, (sid: string) =>
      sid === 'caller-socket' ? CALLER_ID : CALLEE_ID
    );
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    const calls = alreadyAnsweredCalls(toEmit);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ callId: CALL_ID });
  });

  it('does NOT re-emit ALREADY_ANSWERED on a renegotiation answer (already answered before)', async () => {
    mockGetCallSession.mockResolvedValue(
      makeSignalSession({ answeredAt: new Date(), initiatorId: CALLER_ID })
    );
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([{ id: 'caller-socket', leave: jest.fn() }]);

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, (sid: string) =>
      sid === 'caller-socket' ? CALLER_ID : CALLEE_ID
    );
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect(alreadyAnsweredCalls(toEmit)).toHaveLength(0);
  });

  it('does NOT emit ALREADY_ANSWERED when the initiator "answers" their own call', async () => {
    mockGetCallSession.mockResolvedValue(makeSignalSession({ answeredAt: null, initiatorId: CALLER_ID }));
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([{ id: 'callee-socket', leave: jest.fn() }]);

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, (sid: string) =>
      sid === 'callee-socket' ? CALLEE_ID : CALLER_ID
    );
    // The "from" identity is the socket's own resolved userId (CALLER_ID here).
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLER_ID, CALLEE_ID), jest.fn());

    expect(alreadyAnsweredCalls(toEmit)).toHaveLength(0);
  });

  it('emits ALREADY_ANSWERED on the first answer even when the target has no active socket', async () => {
    // Mirrors the push mirror's own "no active sockets" branch (audit
    // 2026-07-11 #3) — the direct-socket twin must fire from here too, for
    // the answerer's OTHER, still-connected devices.
    mockGetCallSession.mockResolvedValue(makeSignalSession({ answeredAt: null, initiatorId: CALLER_ID }));
    const prisma = makePrisma();
    const { socket, handlers, toEmit } = makeSocket();
    const { io, fetchSockets } = makeIo();
    fetchSockets.mockResolvedValue([]); // target (caller) has no live socket

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    const calls = alreadyAnsweredCalls(toEmit);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ callId: CALL_ID });
  });
});
