/**
 * CallEventsHandler — call:join's "buffered offer's sender already left"
 * drop must scope its cleanup to the JOINING participant's own stale slot,
 * not the whole call (Vague 138, calling-stack audit 2026-08-16).
 *
 * §4.6's offer buffer is deliberately keyed per RECIPIENT (`${callId}:${to}`,
 * see `bufferOffer`'s own doc comment) so a buffered offer for one recipient
 * and a different buffered signal for another recipient on the SAME call
 * never overwrite (or clear) each other. `call:join`'s C2 guard replays a
 * buffered offer only if its sender is still an active participant; when the
 * sender has left, it drops the STALE offer — but it used to do so via
 * `clearBufferedOffer(callId)`, a WHOLE-CALL sweep, discarding every OTHER
 * still-pending buffered offer on the same call along with the one genuinely
 * proven stale.
 *
 * Group calls run a real N-pair mesh (Vague 126): a slow third participant's
 * own pending buffered offer (their socket hasn't (re)joined the call room
 * yet) must survive an unrelated joiner discovering that ITS buffered
 * offer's sender already left — otherwise `bufferedOfferFor` finds nothing
 * to replay on that third participant's own eventual `call:join`, starving
 * their mesh connection permanently.
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
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
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
// Constants — three-way group call: CALLER (already left), CALLEE (joining
// now, its buffered offer's sender is the departed CALLER), BYSTANDER (still
// active, totally unrelated to the join happening in this test).
// ---------------------------------------------------------------------------

const CALLER_ID = 'user-caller-xyz';
const CALLEE_ID = 'user-callee-abc';
const BYSTANDER_ID = 'user-bystander-def';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const CALLER_PARTICIPANT_ROW_ID = 'participant-caller-row-001';
const CALLEE_PARTICIPANT_ROW_ID = 'participant-callee-row-002';
const BYSTANDER_PARTICIPANT_ROW_ID = 'participant-bystander-row-003';

const JOIN_DATA = { callId: CALL_ID };

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeCallSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    mode: 'audio',
    status: 'active',
    participants: [
      {
        id: CALLER_PARTICIPANT_ROW_ID,
        callSessionId: CALL_ID,
        participantId: CALLER_ID,
        participant: { userId: CALLER_ID, displayName: 'Caller', user: { username: 'caller', avatar: null } },
        role: 'caller',
        joinedAt: new Date(),
        leftAt: new Date(), // CALLER already left — its buffered offer to CALLEE is stale
        isAudioEnabled: true,
        isVideoEnabled: false,
        connectionQuality: 'good',
      },
      {
        id: CALLEE_PARTICIPANT_ROW_ID,
        callSessionId: CALL_ID,
        participantId: CALLEE_ID,
        participant: { userId: CALLEE_ID, displayName: 'Callee', user: { username: 'callee', avatar: null } },
        role: 'callee',
        joinedAt: new Date(),
        leftAt: null, // joining now
        isAudioEnabled: true,
        isVideoEnabled: false,
        connectionQuality: 'good',
      },
      {
        id: BYSTANDER_PARTICIPANT_ROW_ID,
        callSessionId: CALL_ID,
        participantId: BYSTANDER_ID,
        participant: { userId: BYSTANDER_ID, displayName: 'Bystander', user: { username: 'bystander', avatar: null } },
        role: 'callee',
        joinedAt: new Date(),
        leftAt: null, // still active, unrelated to this join
        isAudioEnabled: true,
        isVideoEnabled: false,
        connectionQuality: 'good',
      },
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

describe("CallEventsHandler — call:join scopes its stale-sender buffered-offer drop to the joiner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockJoinCall.mockResolvedValue({ callSession: makeCallSession(), iceServers: [] });
  });

  it("clears the joiner's own stale slot (userId space)", async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    // Stale: buffered offer for CALLEE, sent by the now-departed CALLER.
    injectBufferedOffer(handler, CALLER_ID, CALLEE_ID);
    handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    expect((handler as any).bufferedOffers.has(`${CALL_ID}:${CALLEE_ID}`)).toBe(false);
  });

  it("does NOT clear a still-active bystander's own unrelated buffered offer slot (the group-call bug)", async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    // Stale entry that triggers the drop branch.
    injectBufferedOffer(handler, CALLER_ID, CALLEE_ID);
    // A sibling pair's still-pending offer — BYSTANDER hasn't (re)joined the
    // call room yet. CALLEE's join (and its own stale-slot drop) must not
    // touch it.
    injectBufferedOffer(handler, CALLEE_ID, BYSTANDER_ID);
    handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    expect((handler as any).bufferedOffers.has(`${CALL_ID}:${BYSTANDER_ID}`)).toBe(true);
  });

  it('does not replay the stale offer to the joining socket', async () => {
    const prisma = makePrisma();
    const { socket, handlers, directEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    injectBufferedOffer(handler, CALLER_ID, CALLEE_ID);
    handler.setupCallEvents(socket as any, io, () => CALLEE_ID);
    await handlers[CALL_EVENTS.JOIN](JOIN_DATA, jest.fn());

    const signalCalls = directEmit.mock.calls.filter(([ev]: any[]) => ev === CALL_EVENTS.SIGNAL);
    expect(signalCalls).toHaveLength(0);
  });
});
