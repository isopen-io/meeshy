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
const mockForceEndOrphanedCallSession = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    endCall: mockEndCall,
    clearRingingTimeout: mockClearRingingTimeout,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
    forceEndOrphanedCallSession: mockForceEndOrphanedCallSession,
    getCallSession: mockGetCallSession,
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
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

function makeSocket(rooms: string[] = []) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socketToEmit = jest.fn<any>();
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: socketToEmit }),
    rooms: new Set<string>(['socket-test-1', ...rooms]),
    data: {},
  };
  return { socket, handlers, directEmit, socketToEmit };
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
    mockGetCallSession.mockResolvedValue({
      participants: [{ participantId: PARTICIPANT_ID, leftAt: null, participant: { userId: CALLER_ID } }],
    });
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

    it('broadcasts ENDED targeting the call room', () => {
      const callRoomCalls = (io.to as jest.MockedFunction<any>).mock.calls
        .filter(([rooms]) => Array.isArray(rooms) && rooms.includes(`call:${CALL_ID}`));
      expect(callRoomCalls).toHaveLength(1);
    });

    it('broadcasts ENDED targeting the conversation room', () => {
      const convRoomCalls = (io.to as jest.MockedFunction<any>).mock.calls
        .filter(([rooms]) => Array.isArray(rooms) && rooms.includes(`conversation:${CONV_ID}`));
      expect(convRoomCalls).toHaveLength(1);
    });

    it('emits CALL_EVENTS.ENDED once (single deduplicated multi-room emit)', () => {
      expect(roomEmit).toHaveBeenCalledTimes(1);
      const events = roomEmit.mock.calls.map(([ev]) => ev);
      expect(events).toEqual([CALL_EVENTS.ENDED]);
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
  // Fast-path: instant call:ended to the call room BEFORE any DB round trip
  // (2026-07-04 — the peer must hang up immediately, not after the multi-query
  // termination path). Room membership is the in-memory authorization.
  // -------------------------------------------------------------------------

  describe('fast-path: sender socket is inside the call room', () => {
    it('emits an immediate call:ended to the call room (excluding the sender)', async () => {
      mockEndCall.mockResolvedValue(makeCallSession());

      const prisma = makePrisma();
      const { socket, handlers, socketToEmit } = makeSocket([`call:${CALL_ID}`]);
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, jest.fn<any>());

      expect(socket.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
      expect(socketToEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ENDED,
        expect.objectContaining({
          callId: CALL_ID,
          endedBy: CALLER_ID,
          reason: END_DATA.reason,
        })
      );
    });

    it('fires the fast-path even when the DB termination path then fails', async () => {
      mockEndCall.mockRejectedValue(new Error('CALL_NOT_FOUND: call does not exist'));

      const prisma = makePrisma();
      const { socket, handlers, socketToEmit } = makeSocket([`call:${CALL_ID}`]);
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, jest.fn<any>());

      expect(socketToEmit).toHaveBeenCalledWith(CALL_EVENTS.ENDED, expect.anything());
    });

    it('defaults the fast-path reason to "completed" when the client sends none', async () => {
      mockEndCall.mockResolvedValue(makeCallSession());

      const prisma = makePrisma();
      const { socket, handlers, socketToEmit } = makeSocket([`call:${CALL_ID}`]);
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END]({ callId: CALL_ID }, jest.fn<any>());

      expect(socketToEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ENDED,
        expect.objectContaining({ reason: 'completed' })
      );
    });
  });

  describe('fast-path guard: sender socket is NOT in the call room', () => {
    it('does not emit any early call:ended (authorization = room membership)', async () => {
      mockEndCall.mockResolvedValue(makeCallSession());

      const prisma = makePrisma();
      const { socket, handlers, socketToEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, jest.fn<any>());

      expect(socketToEmit).not.toHaveBeenCalled();
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

    // This is a genuine infra-style failure (call vanished mid-request), not
    // an authorization rejection — the orphaned-session recovery must still
    // run so the call session isn't left stuck ACTIVE for other callers.
    it('force-ends the orphaned call session (recovery preserved for non-authorization errors)', () => {
      expect(mockForceEndOrphanedCallSession).toHaveBeenCalledWith(CALL_ID, END_DATA.reason);
    });
  });

  // -------------------------------------------------------------------------
  // Room-membership leak: forceEndOrphanedCallAfterOptimisticBroadcast (the
  // recovery path shared by call:end/call:leave/call:force-leave's catch
  // blocks) terminates the call session but, unlike their happy paths, never
  // evicted straggling sockets from the call room — leaking Socket.IO room
  // membership for any device that never explicitly left. Regression guard.
  // -------------------------------------------------------------------------
  describe('error path: endCall throws, orphaned-session recovery actually ends the call', () => {
    it('evicts every remaining socket from the call room', async () => {
      mockEndCall.mockRejectedValue(new Error('CALL_NOT_FOUND: call does not exist'));
      mockForceEndOrphanedCallSession.mockResolvedValue({
        conversationId: CONV_ID,
        duration: 30,
        endReason: 'connectionLost',
        status: 'ended',
      });

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, fetchSockets } = makeIo();
      const staleSocket = { id: 'stale-device', leave: jest.fn() };
      fetchSockets.mockResolvedValue([staleSocket]);
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect(staleSocket.leave).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });
  });

  // -------------------------------------------------------------------------
  // Security fix 2026-07-10: endCall() rejecting the caller's own
  // authorization (NOT_A_PARTICIPANT / PERMISSION_DENIED) must NOT trigger
  // the orphaned-call force-end recovery — that recovery previously let a
  // conversation member who wasn't an active participant of THIS call (or
  // an anonymous user) terminate it anyway by causing endCall() to reject.
  // -------------------------------------------------------------------------

  describe('security: endCall rejects caller authorization (NOT_A_PARTICIPANT)', () => {
    it('does NOT force-end the call session', async () => {
      mockEndCall.mockRejectedValue(new Error(`${CALL_ERROR_CODES.NOT_A_PARTICIPANT}: You are not in this call`));

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect(mockForceEndOrphanedCallSession).not.toHaveBeenCalled();
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
      expect(ack).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('security: endCall rejects caller authorization (PERMISSION_DENIED)', () => {
    it('does NOT force-end the call session', async () => {
      mockEndCall.mockRejectedValue(new Error(`${CALL_ERROR_CODES.PERMISSION_DENIED}: Anonymous users cannot end calls. Use leave instead.`));

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect(mockForceEndOrphanedCallSession).not.toHaveBeenCalled();
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.PERMISSION_DENIED })
      );
      expect(ack).toHaveBeenCalledWith({ success: false });
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

  describe('non-participant: resolveActiveCallParticipantId returns null', () => {
    let directEmit: jest.MockedFunction<any>;
    let ack: jest.MockedFunction<any>;

    beforeEach(async () => {
      // No CallParticipant row matches this user for this call → not an
      // active participant → participantId is null.
      mockGetCallSession.mockResolvedValue({ participants: [] });

      const prisma = makePrisma();
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

    // Security fix 2026-07-10: this branch previously force-ended the call
    // session unconditionally via `forceEndOrphanedCallAfterOptimisticBroadcast`
    // whenever the caller had no conversation membership at all — i.e. any
    // caller (including a total stranger who merely learned/guessed a
    // callId) could terminate a real, live call they had no relationship to.
    it('does NOT force-end the call session (no destructive fallback for an unauthorized caller)', () => {
      expect(mockForceEndOrphanedCallSession).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Regression: the fast-path authorization gate must require an ACTIVE
  // participant of THIS call, not merely conversation membership. A caller
  // who already left this specific call (e.g. a stale/duplicate socket
  // still lingering in the call room after a reconnect race) is still a
  // conversation member, so `resolveParticipantIdFromCall` would wrongly
  // authorize them — firing the instant `call:ended` fast-path broadcast at
  // the real active participant before `endCall()` ever ran its own
  // (correct) NOT_A_PARTICIPANT rejection.
  // -------------------------------------------------------------------------

  describe('authorization: caller already left THIS call (stale call-room socket)', () => {
    let directEmit: jest.MockedFunction<any>;
    let socketToEmit: jest.MockedFunction<any>;
    let ack: jest.MockedFunction<any>;

    beforeEach(async () => {
      // Conversation membership still resolves fine (they never left the
      // conversation) — only their CallParticipant row for THIS call has
      // `leftAt` set.
      mockGetCallSession.mockResolvedValue({
        participants: [{ participantId: PARTICIPANT_ID, leftAt: new Date(), participant: { userId: CALLER_ID } }],
      });

      const prisma = makePrisma();
      // Socket is still (erroneously) inside the call room — the exact
      // condition the fast-path's room-membership check alone cannot catch.
      const { socket, handlers, directEmit: d, socketToEmit: ste } = makeSocket([`call:${CALL_ID}`]);
      directEmit = d;
      socketToEmit = ste;
      const { io } = makeIo();
      ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);
    });

    it('does NOT fire the fast-path call:ended broadcast', () => {
      expect(socketToEmit).not.toHaveBeenCalled();
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
  // Audit C3/C4: endCall() resolving pre-answer calls to `missed` must trigger
  // the same missed-call notification path as call:leave.
  // -------------------------------------------------------------------------

  describe('C3/C4: pre-answer end resolving to missed status', () => {
    it('broadcasts call:ended with reason=missed and posts a summary', async () => {
      mockEndCall.mockResolvedValue(makeCallSession({ status: 'missed', endReason: 'missed', duration: 0 }));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      const endedPayload = roomEmit.mock.calls[0][1];
      expect(endedPayload.reason).toBe('missed');
      expect(endedPayload.duration).toBe(0);
      expect(mockCreateCallSummaryMessage).toHaveBeenCalledWith(CALL_ID);
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it('does not attempt missed-call handling for a normally completed call', async () => {
      mockEndCall.mockResolvedValue(makeCallSession({ status: 'ended', endReason: 'completed' }));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      const handleMissedCallSpy = jest.spyOn(handler, 'handleMissedCall');
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect(handleMissedCallSpy).not.toHaveBeenCalled();
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
