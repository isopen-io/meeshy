/**
 * CallEventsHandler — call:leave absorbs CallAlreadyEndedError as an
 * idempotent no-op (Vague 182, #4202/Vague 181 follow-up).
 *
 * `CallService.leaveCall()` throws `CallAlreadyEndedError` when this leave
 * lost the race to a concurrent terminal write (see its doc comment) — the
 * call is already correctly closed by whichever path won, which already ran
 * the full call:ended broadcast/summary/missed-call fanout. Before this fix,
 * the catch block here had no special case for it: it fell straight into the
 * generic failure recovery (`forceEndOrphanedCallAfterOptimisticBroadcast`),
 * which force-ends an already-ended call a SECOND time — re-broadcasting
 * call:ended, re-posting the call-summary, and re-firing the missed-call
 * notification for a call this request did not actually end — and surfaces a
 * spurious CALL_EVENTS.ERROR to a user who, in fact, successfully hung up.
 * Identical bug class to #3581 (endCall's own conflict branch), one call
 * removed.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockLeaveCall = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();
const mockClearRingingTimeout = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();
const mockForceEndOrphanedCallSession = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  // Real CallAlreadyEndedError, not a hand-rolled lookalike — the catch
  // block under test does `error instanceof CallAlreadyEndedError`, which
  // silently mis-resolves under a partial mock that omits it (see the fix
  // to CallEventsHandler-disconnect.test.ts's own mock in this same Vague).
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn().mockImplementation(() => ({
    leaveCall: mockLeaveCall,
    getCallSession: mockGetCallSession,
    clearRingingTimeout: mockClearRingingTimeout,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    handleMissedCall: jest.fn<any>().mockResolvedValue(undefined),
    forceEndOrphanedCallSession: mockForceEndOrphanedCallSession,
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
import { CallAlreadyEndedError } from '../../../services/CallService';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAVER_ID = 'user-leaver-abc';
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
  return { io, roomEmit, fetchSockets };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:leave absorbs CallAlreadyEndedError as a no-op', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockGetCallSession.mockResolvedValue(makeCallBeforeLeave());
    mockLeaveCall.mockRejectedValue(new CallAlreadyEndedError('completed'));
  });

  it('does NOT emit CALL_EVENTS.ERROR to the leaving socket', async () => {
    const prisma = makePrisma();
    const { socket, handlers, directEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect(directEmit).not.toHaveBeenCalledWith(CALL_EVENTS.ERROR, expect.anything());
  });

  it('does NOT re-broadcast call:ended/participant-left to the call room', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io, roomEmit } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('does NOT re-post the call summary', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect(mockCreateCallSummaryMessage).not.toHaveBeenCalled();
  });

  it('does NOT run the orphaned-session force-end recovery', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect(mockForceEndOrphanedCallSession).not.toHaveBeenCalled();
  });

  it('still evicts this call room (fetches the room membership to clear it) — the always-safe local cleanup', async () => {
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io, fetchSockets } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => LEAVER_ID);
    await handlers[CALL_EVENTS.LEAVE](LEAVE_DATA);

    expect(fetchSockets).toHaveBeenCalled();
  });
});
