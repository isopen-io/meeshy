/**
 * CallEventsHandler — call:end handler
 *
 * Covers the call-termination flow: happy path (broadcast to both rooms, ack),
 * fallback branches (duration=null→0, endReason=null→'completed'), error paths
 * (endCall throws with and without .message), non-participant guard, and
 * unauthenticated guard.
 *
 * Branch targets (Istanbul):
 *  - Line 1593: `callSession.endReason || 'completed'` → null branch
 *  - Line 1597: `callSession.duration || 0`             → null branch
 *  - Lines 1624-1632: catch block + `error.message || 'Failed to end call'`
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CALLER_ID = 'user-caller-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = 'participant-abc';

const END_DATA = { callId: CALL_ID, reason: 'hangup' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCallSession(overrides: Partial<{
  id: string;
  conversationId: string;
  duration: number | null;
  endReason: string | null;
  status: string;
}> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    duration: 60,
    endReason: 'hangup',
    status: 'ended',
    ...overrides,
  };
}

function makePrisma(overrides: {
  callSessionFindUnique?: jest.MockedFunction<any>;
  participantFindFirst?: jest.MockedFunction<any>;
} = {}) {
  return {
    callSession: {
      findUnique: overrides.callSessionFindUnique
        ?? jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
    participant: {
      findFirst: overrides.participantFindFirst
        ?? jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
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
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
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

describe('CallEventsHandler — call:end handler', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCreateCallSummaryMessage.mockResolvedValue(null);
    mockClearRingingTimeout.mockReturnValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path: authenticated participant ends active call', () => {
    let roomEmit: jest.MockedFunction<any>;
    let ack: jest.MockedFunction<any>;
    let io: ReturnType<typeof makeIo>['io'];

    beforeEach(async () => {
      const session = makeCallSession();
      mockEndCall.mockResolvedValue(session);

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      ({ io, roomEmit } = makeIo());
      ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);
    });

    it('calls callService.endCall with the correct arguments', () => {
      expect(mockEndCall).toHaveBeenCalledWith(
        CALL_ID, CALLER_ID, PARTICIPANT_ID, false, END_DATA.reason
      );
    });

    it('broadcasts ENDED to the call room', () => {
      const callRoomCalls = (io.to as jest.MockedFunction<any>).mock.calls
        .filter(([room]) => room === `call:${CALL_ID}`);
      expect(callRoomCalls).toHaveLength(1);
    });

    it('broadcasts ENDED to the conversation room', () => {
      const convRoomCalls = (io.to as jest.MockedFunction<any>).mock.calls
        .filter(([room]) => room === `conversation:${CONV_ID}`);
      expect(convRoomCalls).toHaveLength(1);
    });

    it('emits CALL_EVENTS.ENDED on both rooms', () => {
      expect(roomEmit).toHaveBeenCalledTimes(2);
      const events = roomEmit.mock.calls.map(([ev]) => ev);
      expect(events).toEqual([CALL_EVENTS.ENDED, CALL_EVENTS.ENDED]);
    });

    it('acks { success: true }', () => {
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it('clears ringing timeout after ending', () => {
      expect(mockClearRingingTimeout).toHaveBeenCalledWith(CALL_ID);
    });

    it('posts call summary', () => {
      expect(mockCreateCallSummaryMessage).toHaveBeenCalledWith(CALL_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Duration fallback — covers line 1597 `|| 0` branch
  // -------------------------------------------------------------------------

  describe('duration fallback: callSession.duration is null', () => {
    it('endedEvent.duration is 0 when session has no persisted duration', async () => {
      mockEndCall.mockResolvedValue(makeCallSession({ duration: null }));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, jest.fn<any>());

      const endedPayload = roomEmit.mock.calls[0][1];
      expect(endedPayload.duration).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // EndReason fallback — covers line 1593 `|| 'completed'` branch
  // -------------------------------------------------------------------------

  describe('endReason fallback: callSession.endReason is null', () => {
    it('endedEvent.reason is "completed" when session has no endReason', async () => {
      mockEndCall.mockResolvedValue(makeCallSession({ endReason: null }));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, jest.fn<any>());

      const endedPayload = roomEmit.mock.calls[0][1];
      expect(endedPayload.reason).toBe('completed');
    });
  });

  // -------------------------------------------------------------------------
  // Error path: endCall throws with error.message
  // Covers lines 1624-1632 catch block
  // -------------------------------------------------------------------------

  describe('error path: endCall throws an error with a message', () => {
    let directEmit: jest.MockedFunction<any>;
    let ack: jest.MockedFunction<any>;

    beforeEach(async () => {
      mockEndCall.mockRejectedValue(new Error('CALL_NOT_FOUND: call does not exist'));

      const prisma = makePrisma();
      const { socket, handlers, directEmit: d } = makeSocket();
      directEmit = d;
      const { io } = makeIo();
      ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);
    });

    it('acks { success: false }', () => {
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    it('emits CALL_EVENTS.ERROR to the sender socket', () => {
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'CALL_NOT_FOUND' })
      );
    });

    it('parses the message after the colon', () => {
      const [, payload] = directEmit.mock.calls[0];
      expect(payload.message).toBe('call does not exist');
    });
  });

  // -------------------------------------------------------------------------
  // Error path: endCall throws without .message (covers the || fallback)
  // -------------------------------------------------------------------------

  describe('error path: thrown value has no .message property', () => {
    it('uses "Failed to end call" as fallback message', async () => {
      // Throw a plain object (no .message)
      mockEndCall.mockRejectedValue({ code: 500 });

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ message: 'Failed to end call' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Non-participant guard
  // -------------------------------------------------------------------------

  describe('non-participant: resolveParticipantIdFromCall returns null', () => {
    let directEmit: jest.MockedFunction<any>;
    let ack: jest.MockedFunction<any>;

    beforeEach(async () => {
      const prisma = makePrisma({
        // callSession.findUnique returns null → call not found → participantId is null
        callSessionFindUnique: jest.fn<any>().mockResolvedValue(null),
      });
      const { socket, handlers, directEmit: d } = makeSocket();
      directEmit = d;
      const { io } = makeIo();
      ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);
    });

    it('emits NOT_A_PARTICIPANT error to sender', () => {
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
    });

    it('acks { success: false }', () => {
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    it('does NOT call endCall', () => {
      expect(mockEndCall).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Unauthenticated guard
  // -------------------------------------------------------------------------

  describe('unauthenticated socket: getUserId returns undefined', () => {
    let directEmit: jest.MockedFunction<any>;
    let ack: jest.MockedFunction<any>;

    beforeEach(async () => {
      const prisma = makePrisma();
      const { socket, handlers, directEmit: d } = makeSocket();
      directEmit = d;
      const { io } = makeIo();
      ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      // getUserId returns undefined → not authenticated
      handler.setupCallEvents(socket as any, io, () => undefined);
      await handlers[CALL_EVENTS.END](END_DATA, ack);
    });

    it('emits NOT_AUTHENTICATED error to the socket', () => {
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'NOT_AUTHENTICATED' })
      );
    });

    it('acks { success: false }', () => {
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    it('does NOT call endCall', () => {
      expect(mockEndCall).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // M3 security: anonymous user (session-token) must be denied via denyAnonymous
  // -------------------------------------------------------------------------

  describe('anonymous user: getUserInfo returns isAnonymous=true', () => {
    let directEmit: jest.MockedFunction<any>;
    let ack: jest.MockedFunction<any>;

    beforeEach(async () => {
      const prisma = makePrisma();
      const { socket, handlers, directEmit: d } = makeSocket();
      directEmit = d;
      const { io } = makeIo();
      ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      // Session-token user has a valid userId but isAnonymous flag is true
      handler.setupCallEvents(
        socket as any,
        io,
        () => CALLER_ID,
        () => ({ id: CALLER_ID, isAnonymous: true })
      );
      await handlers[CALL_EVENTS.END](END_DATA, ack);
    });

    it('emits PERMISSION_DENIED to the socket', () => {
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.PERMISSION_DENIED })
      );
    });

    it('acks { success: false }', () => {
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    it('does NOT call endCall', () => {
      expect(mockEndCall).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // postCallSummary: non-Error throw covers line 206 (String(error) branch)
  // -------------------------------------------------------------------------

  describe('postCallSummary: createCallSummaryMessage throws a non-Error value', () => {
    it('call:end still acks success=true (summary errors are absorbed)', async () => {
      mockEndCall.mockResolvedValue(makeCallSession());
      // Throw a plain string — not an Error instance → covers `String(error)` branch
      mockCreateCallSummaryMessage.mockRejectedValue('summary-failed');

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      // postCallSummary absorbs errors; call:end should still succeed
      expect(ack).toHaveBeenCalledWith({ success: true });
    });
  });
});
