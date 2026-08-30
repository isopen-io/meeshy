/**
 * CallEventsHandler — disconnect-grace leave absorbs CallAlreadyEndedError
 * as an idempotent no-op (Vague 182, #4202/Vague 181 follow-up).
 *
 * `leaveParticipationAndBroadcast` (the terminal leave+broadcast path shared
 * by an expired reconnect-grace window) used to treat ANY `leaveCall()`
 * rejection the same way: force-end the call via
 * `forceCleanupParticipationAfterLeaveFailure` (see
 * `CallEventsHandler-disconnect.test.ts`'s "remainingParticipants === 0
 * branch" suite for that genuine-failure case). But `CallAlreadyEndedError`
 * means this leave lost the race to a concurrent terminal write, not that it
 * genuinely failed — the call is already correctly closed by whichever path
 * won, which already ran the full call:ended broadcast/summary/missed-call
 * fanout. Force-cleaning it up a second time would force-end an
 * already-ended call and re-broadcast for it.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockLeaveCallDae = jest.fn<any>();
const mockCreateCallSummaryMessageDae = jest.fn<any>();
const mockForceEndOrphanedCallSessionDae = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  // Real CallAlreadyEndedError, not a partial mock that omits it — the
  // catch block under test does `error instanceof CallAlreadyEndedError`.
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn().mockImplementation(() => ({
    leaveCall: mockLeaveCallDae,
    createCallSummaryMessage: mockCreateCallSummaryMessageDae,
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    handleMissedCall: jest.fn<any>(),
    forceEndOrphanedCallSession: mockForceEndOrphanedCallSessionDae,
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

const mockCheckRateLimitDae = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimitDae,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimitDae,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
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
import { CallAlreadyEndedError } from '../../../services/CallService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-dae-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const CALL_PART_ID = 'call-part-dae-abc';
const MEMBERSHIP_ID = 'membership-dae-abc';
const GRACE_EXPIRY_MS = 31_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActiveParticipation() {
  return {
    id: CALL_PART_ID,
    callSessionId: CALL_ID,
    participantId: MEMBERSHIP_ID,
    leftAt: null,
    callSession: {
      id: CALL_ID,
      conversationId: CONV_ID,
      status: 'active',
      mode: 'p2p',
      duration: null,
      endReason: null,
      startedAt: new Date(Date.now() - 60_000),
    },
  };
}

function makePrisma(): PrismaClient {
  return {
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue([makeActiveParticipation()]),
      // CALL-RESILIENCE — grace-expiry re-check: participant still present,
      // call not ended elsewhere → the terminal leave path proceeds.
      findUnique: jest.fn<any>().mockResolvedValue({
        leftAt: null,
        callSession: { status: 'active' },
      }),
    },
    $transaction: jest.fn<any>(),
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-dae-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — disconnect-grace leave absorbs CallAlreadyEndedError as a no-op', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockLeaveCallDae.mockRejectedValue(new CallAlreadyEndedError('completed'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does NOT force-end the call via $transaction a second time', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers['disconnect']();
    await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT re-broadcast call:ended/participant-left to the call room', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io, roomEmit } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers['disconnect']();
    await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('does NOT re-post the call summary', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers['disconnect']();
    await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

    expect(mockCreateCallSummaryMessageDae).not.toHaveBeenCalled();
  });

  it('still evicts this call room (fetches the room membership to clear it) — the always-safe local cleanup', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io, fetchSockets } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers['disconnect']();
    await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

    expect(fetchSockets).toHaveBeenCalled();
  });
});
