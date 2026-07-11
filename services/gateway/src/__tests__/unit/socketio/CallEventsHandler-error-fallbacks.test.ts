/**
 * CallEventsHandler — error fallback branches
 *
 * Covers the `error.message || 'Failed to …'` fallback branches inside the
 * catch blocks of call:join (line 838) and call:leave (lines 1006-1008).
 *
 * These branches are only reached when a thrown value has no `.message`
 * property (e.g. a plain object or number). Testing them ensures the error
 * response is always a well-formed string and never `undefined`.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockJoinCall = jest.fn<any>();
const mockLeaveCall = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>();
const mockClearRingingTimeout2 = jest.fn<any>();
const mockCreateCallSummaryMessage2 = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    joinCall: mockJoinCall,
    leaveCall: mockLeaveCall,
    getCallSession: mockGetCallSession,
    generateIceServers: mockGenerateIceServers,
    clearRingingTimeout: mockClearRingingTimeout2,
    createCallSummaryMessage: mockCreateCallSummaryMessage2,
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    endCall: jest.fn<any>(),
    listHistory: jest.fn<any>(),
    handleMissedCall: jest.fn<any>(),
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

const mockCheckRateLimit3 = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimit3,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimit3,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
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

const USER_ID = 'user-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = 'participant-abc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    id: 'socket-test-1',
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
  return { io, roomEmit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — error fallback branches', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCreateCallSummaryMessage2.mockResolvedValue(null);
    mockClearRingingTimeout2.mockReturnValue(undefined);
    mockGenerateIceServers.mockReturnValue([]);
  });

  // -------------------------------------------------------------------------
  // call:join — error.message fallback (line 838)
  // -------------------------------------------------------------------------

  describe('call:join error path: thrown value has no .message', () => {
    it('emits CALL_EVENTS.ERROR with "Failed to join call" when error has no .message', async () => {
      // Throw a plain object — no .message property → triggers the `|| 'Failed to join call'` branch
      mockJoinCall.mockRejectedValue({ statusCode: 500 });

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.JOIN]({ callId: CALL_ID }, jest.fn<any>());

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ message: 'Failed to join call' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // call:leave — error.message fallback (lines 1006-1008)
  // -------------------------------------------------------------------------

  describe('call:leave error path: thrown value has no .message', () => {
    it('emits CALL_EVENTS.ERROR with "Failed to leave call" when error has no .message', async () => {
      // getCallSession throws plain object so the leave handler's catch fires
      mockGetCallSession.mockRejectedValue({ statusCode: 500 });

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.LEAVE]({ callId: CALL_ID });

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ message: 'Failed to leave call' })
      );
    });
  });
});
