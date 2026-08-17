/**
 * CallEventsHandler — call:signal's "negotiation complete" cleanup on the
 * `answer` path must scope its buffered-offer drop to the two participants
 * whose negotiation just finished, not the whole call (Vague 139,
 * calling-stack audit 2026-08-17).
 *
 * §4.6's offer buffer is deliberately keyed per RECIPIENT (`${callId}:${to}`,
 * see `bufferOffer`'s own doc comment) so a buffered offer for one recipient
 * and a different buffered signal for another recipient on the SAME call
 * never overwrite (or clear) each other. When an `answer` is successfully
 * relayed, the handler used to drop EVERY buffered entry for the call via
 * `clearBufferedOffer(callId)` — a whole-call sweep — reasoning that
 * negotiation was "complete". That reasoning only holds for a 1:1 call: in a
 * group call (real N-pair mesh, Vague 126), a completely unrelated third
 * participant's own still-pending buffered offer (their socket hasn't
 * (re)joined the call room yet) shares nothing with THIS pair's answer, and
 * a call-wide sweep discards it anyway — the exact same bug class already
 * fixed for call:leave/call:force-leave/call:end/call:join (Vague 137/138).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockClearRingingTimeout = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();
const mockUpdateCallStatus = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    generateIceServers: jest.fn<any>().mockReturnValue([]),
    clearRingingTimeout: mockClearRingingTimeout,
    getCallSession: mockGetCallSession,
    updateCallStatus: mockUpdateCallStatus,
    getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn().mockImplementation(() => ({
    sendToUser: jest.fn<any>().mockResolvedValue(undefined),
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
// Constants — three-way group call: CALLER (answering PARTY B's earlier
// offer here), CALLEE (the other end of THIS negotiation), BYSTANDER (a
// totally unrelated third participant whose own buffered offer must survive).
// ---------------------------------------------------------------------------

const CALLER_ID = 'user-caller-xyz';
const CALLEE_ID = 'user-callee-abc';
const BYSTANDER_ID = 'user-bystander-def';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const CALLER_PARTICIPANT_ROW_ID = 'participant-caller-row-001';
const CALLEE_PARTICIPANT_ROW_ID = 'participant-callee-row-002';
const BYSTANDER_PARTICIPANT_ROW_ID = 'participant-bystander-row-003';

function makeSignalSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: CALLER_ID,
    answeredAt: null,
    status: 'ringing',
    participants: [
      { participantId: CALLER_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: CALLER_ID } },
      { participantId: CALLEE_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: CALLEE_ID } },
      { participantId: BYSTANDER_PARTICIPANT_ROW_ID, leftAt: null, participant: { userId: BYSTANDER_ID } },
    ],
  };
}

/** CALLEE answering CALLER's earlier offer — the negotiation this test exercises. */
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

function makeSocket(socketId = 'socket-callee-1') {
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

function makeIo(targetSocketIds: string[] = ['socket-caller-1']) {
  const roomEmit = jest.fn<any>();
  const fetchSockets = jest.fn<any>().mockResolvedValue(
    targetSocketIds.map((id) => ({ id, leave: jest.fn() }))
  );
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets }),
  };
  return { io, roomEmit, fetchSockets };
}

/** Inject a buffered offer/signal into the handler's private map, keyed by recipient. */
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

describe("CallEventsHandler — call:signal's answer-received cleanup scopes its buffered-offer drop", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallSession.mockResolvedValue(makeSignalSession());
  });

  it("does NOT clear a still-active bystander's own unrelated buffered offer slot (the group-call bug)", async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo(['socket-caller-1']);

    const handler = new CallEventsHandler(prisma);
    // A sibling pair's still-pending offer — BYSTANDER hasn't (re)joined the
    // call room yet. This negotiation completing must not touch it.
    injectBufferedOffer(handler, CALLER_ID, BYSTANDER_ID);
    handler.setupCallEvents(socket as any, io, (sid: string) =>
      sid === 'socket-caller-1' ? CALLER_ID : CALLEE_ID
    );
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect((handler as any).bufferedOffers.has(`${CALL_ID}:${BYSTANDER_ID}`)).toBe(true);
  });

  it("clears the answerer's own now-stale buffered slot (userId space)", async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo(['socket-caller-1']);

    const handler = new CallEventsHandler(prisma);
    // CALLER's earlier offer to CALLEE was buffered (CALLEE's socket hadn't
    // joined yet); CALLEE has now joined and answered live.
    injectBufferedOffer(handler, CALLER_ID, CALLEE_ID);
    handler.setupCallEvents(socket as any, io, (sid: string) =>
      sid === 'socket-caller-1' ? CALLER_ID : CALLEE_ID
    );
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect((handler as any).bufferedOffers.has(`${CALL_ID}:${CALLEE_ID}`)).toBe(false);
  });

  it("clears the offerer's own now-stale buffered slot (userId space)", async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo(['socket-caller-1']);

    const handler = new CallEventsHandler(prisma);
    // An earlier answer/ice-restart from CALLEE to CALLER had itself been
    // buffered (CALLER's socket briefly down); this fresh live answer
    // supersedes it.
    injectBufferedOffer(handler, CALLEE_ID, CALLER_ID);
    handler.setupCallEvents(socket as any, io, (sid: string) =>
      sid === 'socket-caller-1' ? CALLER_ID : CALLEE_ID
    );
    await handlers[CALL_EVENTS.SIGNAL](makeAnswerSignal(CALLEE_ID, CALLER_ID), jest.fn());

    expect((handler as any).bufferedOffers.has(`${CALL_ID}:${CALLER_ID}`)).toBe(false);
  });
});
