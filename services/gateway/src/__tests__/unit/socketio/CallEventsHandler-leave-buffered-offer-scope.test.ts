/**
 * CallEventsHandler — call:leave must scope its buffered-offer cleanup to
 * the LEAVING participant, not the whole call (calling-stack audit
 * 2026-08-16).
 *
 * §4.6's offer buffer is deliberately keyed per RECIPIENT
 * (`${callId}:${to}`, see `bufferOffer`'s own doc comment) so a caller's
 * offer buffered for one callee and a different buffered signal for another
 * recipient on the SAME call never overwrite each other. But `call:leave`
 * used to clear via `clearBufferedOffer(callId)` — a WHOLE-CALL sweep —
 * regardless of whether the leave ended the call or merely removed one
 * participant from a GROUP call that continues for everyone else.
 *
 * Group calls now run a real N-pair mesh (Vague 126): a participant leaving
 * must not discard a totally unrelated, still-active sibling's own pending
 * buffered offer (e.g. their socket hasn't (re)joined the call room yet) —
 * doing so permanently starves that sibling's mesh connection, since
 * `bufferedOfferFor` finds nothing left to replay on their eventual
 * `call:join`.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockLeaveCall = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();
const mockClearRingingTimeout = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    leaveCall: mockLeaveCall,
    getCallSession: mockGetCallSession,
    clearRingingTimeout: mockClearRingingTimeout,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    handleMissedCall: jest.fn<any>().mockResolvedValue(undefined),
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

const LEAVER_ID = 'user-leaver-abc';
const BYSTANDER_ID = 'user-bystander-xyz';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const LEAVER_PARTICIPANT_ROW_ID = 'participant-leaver-row-001';
const LEAVER_MEMBERSHIP_ID = 'membership-leaver-001';

const LEAVE_DATA = { callId: CALL_ID };

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeCallBeforeLeave() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    participants: [
      {
        id: LEAVER_PARTICIPANT_ROW_ID,
        participantId: LEAVER_MEMBERSHIP_ID,
        participant: { userId: LEAVER_ID },
        leftAt: null,
      },
      {
        id: 'participant-bystander-row-002',
        participantId: 'membership-bystander-002',
        participant: { userId: BYSTANDER_ID },
        leftAt: null,
      },
    ],
  };
}

/** Group call continues for the bystander — leaveCall() returns a still-active session. */
function makeContinuingCallSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    mode: 'p2p',
    status: 'active',
    duration: null,
    endReason: null,
    participants: [
      {
        id: LEAVER_PARTICIPANT_ROW_ID,
        participantId: LEAVER_MEMBERSHIP_ID,
        participant: { userId: LEAVER_ID },
        leftAt: new Date(),
      },
      {
        id: 'participant-bystander-row-002',
        participantId: 'membership-bystander-002',
        participant: { userId: BYSTANDER_ID },
        leftAt: null,
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
      findFirst: jest.fn<any>().mockResolvedValue({ id: LEAVER_MEMBERSHIP_ID }),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-leaver-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
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
  return { io, roomEmit };
}

/** Inject a buffered offer into the handler's private map, keyed by recipient. */
function injectBufferedOffer(handler: CallEventsHandler, recipient: string): void {
  (handler as any).bufferedOffers.set(`${CALL_ID}:${recipient}`, {
    signal: {
      callId: CALL_ID,
      signal: { type: 'offer', from: 'someone', to: recipient, sdp: 'v=0' },
    },
    bufferedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:leave scopes its buffered-offer cleanup to the leaver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockGetCallSession.mockResolvedValue(makeCallBeforeLeave());
    mockLeaveCall.mockResolvedValue(makeContinuingCallSession());
  });

  it("clears the leaving participant's own buffered offer slot", async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    injectBufferedOffer(handler, LEAVER_ID);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect((handler as any).bufferedOffers.has(`${CALL_ID}:${LEAVER_ID}`)).toBe(false);
  });

  it("also clears the leaver's buffered slot keyed by their Participant.id (membership FK) space", async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    injectBufferedOffer(handler, LEAVER_MEMBERSHIP_ID);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect((handler as any).bufferedOffers.has(`${CALL_ID}:${LEAVER_MEMBERSHIP_ID}`)).toBe(false);
  });

  it('does NOT clear a still-active bystander\'s own buffered offer slot (the group-call bug)', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    // A sibling pair's offer, buffered because the bystander hadn't
    // (re)joined the call room yet. LEAVER_ID leaving must not touch it.
    injectBufferedOffer(handler, BYSTANDER_ID);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect((handler as any).bufferedOffers.has(`${CALL_ID}:${BYSTANDER_ID}`)).toBe(true);
  });

  // Same defect class as the buffered-offer scoping above, on the call-wide
  // ring timer: `ringingTimeouts` is keyed by callId, not by participant
  // (CallService.ts), so clearing it here — while the group call
  // demonstrably continues for the bystander (`makeContinuingCallSession`,
  // status 'active') — silently drops the missed-call notification for any
  // OTHER invitee who never joined, with no recovery path once the call is
  // active (rehydrateActiveCalls only re-arms `initiated|ringing` calls).
  it('does NOT clear the call-wide ring timer when the group call continues', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect(mockClearRingingTimeout).not.toHaveBeenCalled();
  });
});
