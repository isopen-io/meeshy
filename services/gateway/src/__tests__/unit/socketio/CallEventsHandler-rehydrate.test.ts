/**
 * CallEventsHandler — boot rehydration (CALL-RESILIENCE item H)
 *
 * A gateway crash/restart wipes the in-process ringing timers
 * (CallService.ringingTimeouts). Without re-arming them at boot, a
 * pre-answer call interrupted by the restart keeps "ringing" server-side
 * until the 120s GC tier reaps it — and its callee never receives the
 * missed-call push that only the ringing-timeout path sends.
 *
 * rehydrateActiveCalls(io) must:
 *  - query pre-answer calls (initiated/ringing) from MongoDB
 *  - re-arm each one via callService.rescheduleRingingTimeout with the call's
 *    original startedAt (the remaining-budget computation lives in CallService)
 *  - hand it the SAME missed-path handler as call:initiate (status-guarded
 *    updateMany → broadcasts → summary → push), so firing one resolves the
 *    call to `missed` exactly like a normal ringing timeout.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockRescheduleRingingTimeout = jest.fn<any>();
const mockScheduleRingingTimeout = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();
const mockMarkCallAsMissed = jest.fn<any>();
const mockReleaseActiveCallClaim = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    rescheduleRingingTimeout: mockRescheduleRingingTimeout,
    scheduleRingingTimeout: mockScheduleRingingTimeout,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
    markCallAsMissed: mockMarkCallAsMissed,
    releaseActiveCallClaim: mockReleaseActiveCallClaim,
    getUnrespondedParticipants: jest.fn<any>().mockResolvedValue([]),
    clearRingingTimeout: jest.fn<any>(),
    getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
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
  isValidationFailure: jest.fn((r: any) => !r.success),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: jest.fn<any>().mockResolvedValue(true),
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: jest.fn<any>().mockResolvedValue(true),
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {},
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
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const CALL_FRESH = '507f1f77bcf86cd799439021';
const CALL_OVERDUE = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439012';
const INITIATOR_ID = 'user-initiator-abc';

function makePrisma(preAnswerCalls: Array<{ id: string; startedAt: Date }>) {
  return {
    callSession: {
      findMany: jest.fn<any>().mockResolvedValue(preAnswerCalls),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn<any>().mockResolvedValue({
        conversationId: CONV_ID,
        initiatorId: INITIATOR_ID,
        initiator: { displayName: 'Alice Smith', username: 'alice' },
      }),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

type RoomEmission = { room: string | string[]; event: string; payload: unknown };

function makeIo() {
  const emissions: RoomEmission[] = [];
  const io = {
    to: jest.fn((room: string | string[]) => ({
      emit: jest.fn((event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
      }),
    })),
    in: jest.fn<any>().mockReturnValue({
      fetchSockets: jest.fn<any>().mockResolvedValue([]),
    }),
  };
  return { io, emissions };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — rehydrateActiveCalls (boot rehydration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCallSummaryMessage.mockResolvedValue(null);
    mockMarkCallAsMissed.mockResolvedValue(undefined);
  });

  it('re-arms a ringing timer for every pre-answer call found in MongoDB', async () => {
    const startedFresh = new Date(Date.now() - 10_000);
    const startedOverdue = new Date(Date.now() - 300_000);
    const prisma = makePrisma([
      { id: CALL_FRESH, startedAt: startedFresh },
      { id: CALL_OVERDUE, startedAt: startedOverdue },
    ]);
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.rehydrateActiveCalls(io as any);

    expect((prisma.callSession.findMany as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['initiated', 'ringing'] },
        }),
      })
    );
    expect(mockRescheduleRingingTimeout).toHaveBeenCalledTimes(2);
    expect(mockRescheduleRingingTimeout).toHaveBeenCalledWith(
      CALL_FRESH, startedFresh, expect.any(Function)
    );
    expect(mockRescheduleRingingTimeout).toHaveBeenCalledWith(
      CALL_OVERDUE, startedOverdue, expect.any(Function)
    );
  });

  it('the re-armed handler resolves the call to missed exactly like a normal ringing timeout', async () => {
    const prisma = makePrisma([
      { id: CALL_FRESH, startedAt: new Date(Date.now() - 10_000) },
    ]);
    const { io, emissions } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.rehydrateActiveCalls(io as any);

    const timeoutCallback =
      mockRescheduleRingingTimeout.mock.calls[0][2] as () => Promise<void>;
    await timeoutCallback();

    expect((prisma.callSession.updateMany as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: CALL_FRESH,
          status: { in: ['initiated', 'ringing'] },
        }),
        data: expect.objectContaining({ status: 'missed', endReason: 'missed' }),
      })
    );
    const ended = emissions.filter(e => e.event === CALL_EVENTS.ENDED);
    expect(ended).toHaveLength(1);
    expect(ended[0].room).toEqual(
      expect.arrayContaining([`call:${CALL_FRESH}`, `conversation:${CONV_ID}`])
    );
    const missed = emissions.find(e => e.event === CALL_EVENTS.MISSED);
    expect(missed).toBeDefined();
    expect(missed!.payload).toEqual({
      callId: CALL_FRESH,
      conversationId: CONV_ID,
      callerId: INITIATOR_ID,
      callerName: 'Alice Smith',
    });
    // The rehydrated handler must release the conversation's active-call
    // claim exactly like the normal ringing timeout — a leaked claim blocks
    // every future initiateCall on the conversation (prod 2026-07-02).
    expect(mockReleaseActiveCallClaim).toHaveBeenCalledWith(CONV_ID, CALL_FRESH);
  });

  it('does nothing when no pre-answer call survived the restart', async () => {
    const prisma = makePrisma([]);
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.rehydrateActiveCalls(io as any);

    expect(mockRescheduleRingingTimeout).not.toHaveBeenCalled();
  });

  it('survives a DB error without throwing (boot must not crash)', async () => {
    const prisma = makePrisma([]);
    (prisma.callSession.findMany as jest.Mock).mockRejectedValue(
      new Error('mongo down') as never
    );
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await expect(handler.rehydrateActiveCalls(io as any)).resolves.toBeUndefined();
    expect(mockRescheduleRingingTimeout).not.toHaveBeenCalled();
  });
});
