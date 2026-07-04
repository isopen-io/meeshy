/**
 * CallEventsHandler — postCallSummary retry logic
 *
 * Verifies that a transient failure in createCallSummaryMessage triggers
 * up to 3 retry attempts with exponential backoff before giving up.
 *
 * postCallSummary is private and is triggered via the call:end handler,
 * which calls it unconditionally after a successful endCall.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockEndCall = jest.fn<any>();
const mockClearRingingTimeout = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    endCall: mockEndCall,
    clearRingingTimeout: mockClearRingingTimeout,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
    initiateCall: jest.fn<any>(),
    joinCall: jest.fn<any>(),
    getCallSession: jest.fn<any>(),
    generateIceServers: jest.fn<any>().mockReturnValue([]),
    scheduleRingingTimeout: jest.fn<any>(),
    listHistory: jest.fn<any>(),
    handleMissedCall: jest.fn<any>(),
    leaveCall: jest.fn<any>(),
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
    CALL_SIGNAL: { maxRequests: 100, windowMs: 10000, keyPrefix: 'socket:call:signal' },
    CALL_ICE_CANDIDATE: { maxRequests: 50, windowMs: 5000, keyPrefix: 'socket:call:ice' },
  },
}));

const mockLoggerError = jest.fn<any>();
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: mockLoggerError,
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

const CALLER_ID = 'user-retry-test';
const CALL_ID = '507f1f77bcf86cd799439099';
const CONV_ID = '507f1f77bcf86cd799439098';
const PARTICIPANT_ID = 'participant-retry-test';

const END_DATA = { callId: CALL_ID, reason: 'hangup' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCallSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    duration: 30,
    endReason: 'hangup',
    status: 'ended',
  };
}

function makePrisma() {
  return {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-retry-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(['socket-retry-1']),
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

describe('CallEventsHandler — postCallSummary retry', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockEndCall.mockResolvedValue(makeCallSession());
    mockClearRingingTimeout.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Retry on transient failure
  // -------------------------------------------------------------------------

  it('retries on transient failure and eventually broadcasts the summary', async () => {
    const fakeMessage = { id: 'msg-1', conversationId: CONV_ID };
    // Fail twice, then succeed on the third attempt
    mockCreateCallSummaryMessage
      .mockRejectedValueOnce(new Error('transient DB error'))
      .mockRejectedValueOnce(new Error('transient DB error'))
      .mockResolvedValueOnce(fakeMessage);

    const messageBroadcaster = jest.fn<any>().mockResolvedValue(undefined);
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();
    const ack = jest.fn<any>();

    const handler = new CallEventsHandler(prisma);
    handler.setMessageBroadcaster(messageBroadcaster);
    handler.setupCallEvents(socket as any, io, () => CALLER_ID);

    // Start the call:end handler — it runs postCallSummary internally
    const handlerPromise = handlers[CALL_EVENTS.END](END_DATA, ack);

    // Destroy before advancing — clears the buffer cleanup interval so
    // jest.advanceTimersByTimeAsync doesn't spin it 100 000 times.
    handler.destroy();
    // Advance 5 s — enough to cover 1 s + 2 s backoff delays for 3 attempts.
    await jest.advanceTimersByTimeAsync(5_000);
    await handlerPromise;

    // createCallSummaryMessage should have been called 3 times (2 failures + 1 success)
    expect(mockCreateCallSummaryMessage).toHaveBeenCalledTimes(3);
    expect(mockCreateCallSummaryMessage).toHaveBeenCalledWith(CALL_ID);

    // The message was eventually broadcast
    expect(messageBroadcaster).toHaveBeenCalledWith(fakeMessage, CONV_ID);
  });

  // -------------------------------------------------------------------------
  // Gives up after max attempts without throwing
  // -------------------------------------------------------------------------

  it('gives up after max attempts and logs the giveup message without throwing', async () => {
    // Always fail
    mockCreateCallSummaryMessage.mockRejectedValue(new Error('persistent DB error'));

    const messageBroadcaster = jest.fn<any>().mockResolvedValue(undefined);
    const prisma = makePrisma();
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();
    const ack = jest.fn<any>();

    const handler = new CallEventsHandler(prisma);
    handler.setMessageBroadcaster(messageBroadcaster);
    handler.setupCallEvents(socket as any, io, () => CALLER_ID);

    const handlerPromise = handlers[CALL_EVENTS.END](END_DATA, ack);

    // Destroy before advancing — clears the buffer cleanup interval.
    handler.destroy();
    // Advance 10 s — enough to exhaust 1 s + 2 s backoff delays for all 3 attempts.
    await jest.advanceTimersByTimeAsync(10_000);
    await handlerPromise;

    // Should have tried exactly 3 times (MAX_ATTEMPTS)
    expect(mockCreateCallSummaryMessage).toHaveBeenCalledTimes(3);

    // The message should NOT have been broadcast
    expect(messageBroadcaster).not.toHaveBeenCalled();

    // The 'giving up' error must have been logged
    const givingUpCall = mockLoggerError.mock.calls.find(
      ([msg]: any[]) => typeof msg === 'string' && msg.includes('Giving up on call summary')
    );
    expect(givingUpCall).toBeDefined();

    // call:end itself must still ack success (summary errors are absorbed)
    expect(ack).toHaveBeenCalledWith({ success: true });
  });
});
