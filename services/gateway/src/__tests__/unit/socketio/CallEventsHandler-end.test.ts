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
const mockResolveEndReason = jest.fn((reason?: string) => {
  switch (reason) {
    case 'missed': return 'missed';
    case 'rejected': return 'rejected';
    case 'failed': return 'failed';
    case 'connectionLost': return 'connectionLost';
    case 'heartbeatTimeout': return 'heartbeatTimeout';
    case 'garbageCollected': return 'garbageCollected';
    default: return 'completed';
  }
}) as jest.Mock<any>;

jest.mock('../../../services/CallService', () => {
  // Mirrors the real CallAlreadyEndedError (services/CallService.ts) — same
  // message shape `parseCallHandlerError` splits on, plus the `endReason`
  // the production class carries on top of it. Issue #3581: endCall() now
  // throws this on a call already in a terminal state instead of returning
  // silently — the handler must treat it as an idempotent no-op.
  class CallAlreadyEndedError extends Error {
    readonly endReason: string;
    constructor(endReason: string) {
      super('CALL_ENDED: This call has already ended');
      this.name = 'CallAlreadyEndedError';
      this.endReason = endReason;
    }
  }
  return {
    CallService: jest.fn().mockImplementation(() => ({
      endCall: mockEndCall,
      clearRingingTimeout: mockClearRingingTimeout,
      createCallSummaryMessage: mockCreateCallSummaryMessage,
      createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
      forceEndOrphanedCallSession: mockForceEndOrphanedCallSession,
      getCallSession: mockGetCallSession,
      resolveEndReason: mockResolveEndReason,
    })),
    CallAlreadyEndedError,
  };
});

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
    leave: jest.fn<any>(),
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
        CALL_ID, CALLER_ID, PARTICIPANT_ID, false, END_DATA.reason,
        { preJoinDecline: false }
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
      // END_DATA.reason ('hangup') is schema-valid but not a CallEndReason
      // member — the fast path must normalize it via resolveEndReason(),
      // same as the authoritative broadcast, not forward it raw.
      expect(socketToEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ENDED,
        expect.objectContaining({
          callId: CALL_ID,
          endedBy: CALLER_ID,
          reason: 'completed',
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
      // Same normalization requirement as the fast-path broadcast: 'hangup'
      // is schema-valid but not a CallEndReason member.
      expect(mockForceEndOrphanedCallSession).toHaveBeenCalledWith(CALL_ID, 'completed');
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
  // Issue #3581 — endCall() throws CallAlreadyEndedError (instead of
  // returning the current session) when the call is already in a terminal
  // state. A retried/duplicate call:end (e.g. a client that never received
  // its ack, or a race against another path resolving the same call, like
  // the ringing-timeout's markCallAsMissed) must be an idempotent no-op:
  // ack success, but do NOT re-broadcast call:ended, re-post the summary,
  // or run the orphaned-session force-end recovery (the call is already
  // correctly closed — nothing is orphaned).
  // -------------------------------------------------------------------------

  describe('idempotency: endCall throws CallAlreadyEndedError (already-terminal call)', () => {
    let directEmit: jest.MockedFunction<any>;
    let ack: jest.MockedFunction<any>;
    let io: ReturnType<typeof makeIo>['io'];
    let roomEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      mockEndCall.mockRejectedValue(new CallAlreadyEndedError('completed'));

      const prisma = makePrisma();
      const { socket, handlers, directEmit: d } = makeSocket();
      directEmit = d;
      ({ io, roomEmit } = makeIo());
      ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);
    });

    it('acks { success: true } — the caller\'s intent (call ended) already holds', () => {
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it('does NOT emit CALL_EVENTS.ERROR to the sender socket', () => {
      expect(directEmit).not.toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.anything()
      );
    });

    it('does NOT re-broadcast call:ended to the call/conversation rooms', () => {
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('does NOT re-post the call summary', () => {
      expect(mockCreateCallSummaryMessage).not.toHaveBeenCalled();
    });

    it('does NOT run the orphaned-session force-end recovery', () => {
      expect(mockForceEndOrphanedCallSession).not.toHaveBeenCalled();
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
  // Decline-before-join fix (2026-08-14): a callee declining a still-ringing
  // call has NO CallParticipant row yet — `call:join` is the only path that
  // creates one for a callee, and the decline button fires `call:end` with
  // reason='rejected' before ever joining. resolveActiveCallParticipantId
  // correctly returns null for them; the handler must fall back to
  // resolvePreJoinDeclineParticipantId (itself backed by getCallSession +
  // conversation-membership) instead of rejecting outright.
  // -------------------------------------------------------------------------

  describe('pre-join decline: callee declines a still-ringing call before ever joining', () => {
    const REJECT_DATA = { callId: CALL_ID, reason: 'rejected' };

    it('authorizes the decline and calls endCall with preJoinDecline: true', async () => {
      // No CallParticipant row at all for CALLER_ID (the callee here) —
      // resolveActiveCallParticipantId returns null. Call never answered.
      mockGetCallSession.mockResolvedValue({
        answeredAt: null,
        participants: [{ participantId: 'other-participant', leftAt: null, participant: { userId: 'other-user' } }],
      });
      mockEndCall.mockResolvedValue(makeCallSession({ status: 'rejected', endReason: 'rejected', duration: 0 }));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](REJECT_DATA, ack);

      expect(mockEndCall).toHaveBeenCalledWith(
        CALL_ID, CALLER_ID, PARTICIPANT_ID, false, 'rejected',
        { preJoinDecline: true }
      );
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it('does NOT authorize a stranger with no conversation membership', async () => {
      mockGetCallSession.mockResolvedValue({ answeredAt: null, participants: [] });

      const prisma = makePrisma({
        // Not a conversation member either.
        participantFindFirst: jest.fn<any>().mockResolvedValue(null),
      });
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](REJECT_DATA, ack);

      expect(mockEndCall).not.toHaveBeenCalled();
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    it('does NOT authorize a caller who already has a row for this call (even a left one) — stays on the stricter path', async () => {
      // Has a row, but it's left — this is 2026-07-10b's exact target, must
      // stay blocked regardless of reason='rejected'.
      mockGetCallSession.mockResolvedValue({
        answeredAt: null,
        participants: [{ participantId: PARTICIPANT_ID, leftAt: new Date(), participant: { userId: CALLER_ID } }],
      });

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](REJECT_DATA, ack);

      expect(mockEndCall).not.toHaveBeenCalled();
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
    });

    it('does NOT authorize a pre-join decline once the call has already been answered', async () => {
      mockGetCallSession.mockResolvedValue({
        answeredAt: new Date(),
        participants: [{ participantId: 'other-participant', leftAt: null, participant: { userId: 'other-user' } }],
      });

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](REJECT_DATA, ack);

      expect(mockEndCall).not.toHaveBeenCalled();
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
    });

    it('group call (2026-08-15): does NOT broadcast call:ended or post a summary when endCall no-ops for a group decline', async () => {
      // CallService.endCall() no-ops for a preJoinDecline landing on a group
      // call and returns the session UNCHANGED — still non-terminal
      // ('ringing'), not one of CALL_TERMINAL_STATUSES. The handler must
      // detect that and skip every side effect that assumes the call
      // actually ended, so the other invitees keep ringing undisturbed.
      mockGetCallSession.mockResolvedValue({
        answeredAt: null,
        participants: [{ participantId: 'other-participant', leftAt: null, participant: { userId: 'other-user' } }],
      });
      mockEndCall.mockResolvedValue(makeCallSession({ status: 'ringing' }));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](REJECT_DATA, ack);

      expect(roomEmit).not.toHaveBeenCalled();
      expect(mockCreateCallSummaryMessage).not.toHaveBeenCalled();
      expect(mockClearRingingTimeout).not.toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it('does not affect the non-decline non-participant path (reason != rejected stays rejected outright)', async () => {
      // Same "never joined, but IS a conversation member" shape as the
      // authorized case above, but with the default reason ('hangup') — the
      // pre-join fallback must not even be attempted.
      mockGetCallSession.mockResolvedValue({
        answeredAt: null,
        participants: [{ participantId: 'other-participant', leftAt: null, participant: { userId: 'other-user' } }],
      });

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect(mockEndCall).not.toHaveBeenCalled();
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT })
      );
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

  // -------------------------------------------------------------------------
  // Group hang-up buffered-offer scoping (calling-stack audit 2026-08-16) —
  // when call:end is treated as a leave because the group call continues for
  // other participants, the buffered-offer cleanup must be scoped to the
  // hanger-up alone. It used to sweep the WHOLE call's buffered offers
  // (`clearBufferedOffer`), silently discarding a totally unrelated,
  // still-active participant's own pending buffered offer (e.g. their socket
  // hasn't (re)joined the call room yet) — permanently starving their mesh
  // connection, since the buffer is per-recipient and nothing would replay
  // it on their eventual `call:join`. Mirrors the same fix already applied
  // to `call:leave` and `call:force-leave`.
  // -------------------------------------------------------------------------

  describe('group hang-up: buffered-offer cleanup is scoped to the hanger-up, not the whole call', () => {
    function injectBufferedOffer(handler: InstanceType<typeof CallEventsHandler>, recipient: string): void {
      (handler as any).bufferedOffers.set(`${CALL_ID}:${recipient}`, {
        signal: { callId: CALL_ID, signal: { type: 'offer', from: 'someone', to: recipient, sdp: 'v=0' } },
        bufferedAt: Date.now(),
      });
    }

    beforeEach(() => {
      // Two ACTIVE participants (caller + a bystander) with no `conversation`
      // field — `isDirectCall` reads `callSession.conversation?.type ===
      // 'direct'`, so `undefined` already resolves falsy (non-direct), and a
      // second active participant makes `hasOtherActiveParticipants` true —
      // together these satisfy `willContinueAsGroupLeave`.
      mockGetCallSession.mockResolvedValue({
        mode: 'p2p',
        participants: [
          { id: 'call-participant-row-caller', participantId: PARTICIPANT_ID, leftAt: null, participant: { userId: CALLER_ID } },
          { id: 'call-participant-row-bystander', participantId: 'bystander-participant-id', leftAt: null, participant: { userId: 'bystander-user-id' } },
        ],
      });
      // Non-terminal status: endCall() delegated to leaveCall() because the
      // group call continues for the bystander.
      mockEndCall.mockResolvedValue(makeCallSession({ status: 'active' }));
    });

    it("clears the hanger-up's own buffered offer slot", async () => {
      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      injectBufferedOffer(handler, CALLER_ID);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect((handler as any).bufferedOffers.has(`${CALL_ID}:${CALLER_ID}`)).toBe(false);
    });

    it("does NOT clear the still-active bystander's own buffered offer slot", async () => {
      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      injectBufferedOffer(handler, 'bystander-user-id');
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect((handler as any).bufferedOffers.has(`${CALL_ID}:bystander-user-id`)).toBe(true);
    });

    it('broadcasts PARTICIPANT_LEFT with the CallParticipant row id, not the participantId FK (Vague 142)', async () => {
      const prisma = makePrisma();
      const { socket, handlers, socketToEmit } = makeSocket([`call:${CALL_ID}`]);
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      // The hanger-up's CallParticipant ROW id ('call-participant-row-caller',
      // per the beforeEach fixture) is what `removeParticipant`/roster lookups
      // on every client key on — never `PARTICIPANT_ID`, the FK to
      // `Participant.id`, which is what `endCall()`/`clearBufferedOfferFor`
      // consume instead. Emitting the FK here left every client's roster
      // entry for the hanger-up stuck (never removed), even though the
      // hanger-up's own WebRTC connection was correctly torn down elsewhere.
      expect(socketToEmit).toHaveBeenCalledWith(
        CALL_EVENTS.PARTICIPANT_LEFT,
        expect.objectContaining({
          callId: CALL_ID,
          participantId: 'call-participant-row-caller',
          userId: CALLER_ID,
        })
      );
    });

    // Group-calls gap analysis S3 regression: `ringingTimeouts` is keyed by
    // callId, not by participant (CallService.ts) — it is the ONLY thing
    // standing between "an invitee never answered" and a missed-call
    // notification for them (buildRingingTimeoutHandler's count===0 branch).
    // The `call:signal` answer handler deliberately leaves this timer armed
    // for a group call for exactly this reason. This branch is reached only
    // when the call is KNOWN to continue for other participants — clearing
    // the call-wide timer here permanently loses the missed-call
    // notification for whichever invitee never joined, with no recovery
    // path (rehydrateActiveCalls only re-arms `initiated|ringing` calls, and
    // an `active` call never re-enters that state).
    it('does NOT clear the call-wide ring timer when the group call continues (S3)', async () => {
      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);
      await handlers[CALL_EVENTS.END](END_DATA, ack);

      expect(mockClearRingingTimeout).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Fire-and-forget: no ack callback at all
  //
  // Every real web emitter of call:end (CallManager.tsx's rejectWaitingCall/
  // decline-incoming paths, use-video-call.ts's superseded-call cleanup) fires
  // it with NO third argument — none of them read a response. The shared
  // `ClientToServerEvents[CALL_END]` contract used to declare `ack` as
  // REQUIRED regardless, a mismatch every real call site hid behind its own
  // `as unknown` cast on the socket instead of a shared, honest signature.
  // This handler already guards every `ack?.(...)` call with optional
  // chaining — this test proves that guard actually matters: invoked exactly
  // as socket.io calls it when the client passed no callback (a single
  // positional argument, no second one at all), the handler must run to
  // completion without throwing.
  // -------------------------------------------------------------------------
  describe('fire-and-forget: emitted with no ack callback (real client shape)', () => {
    it('completes the happy path without throwing when invoked with only the data argument', async () => {
      const session = makeCallSession();
      mockEndCall.mockResolvedValue(session);

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => CALLER_ID);

      await expect(handlers[CALL_EVENTS.END](END_DATA)).resolves.not.toThrow();
      expect(mockEndCall).toHaveBeenCalled();
      // If `ack({...})` were ever called unconditionally on the happy path
      // (instead of `ack?.({...})`), invoking the handler exactly as a
      // no-callback client does would throw "ack is not a function" INSIDE
      // the try block — caught by the handler's own catch, which then
      // force-ends the session and emits CALL_EVENTS.ERROR back to the
      // socket. Neither must happen here: this asserts the happy path
      // actually completed rather than silently falling into recovery.
      expect(mockForceEndOrphanedCallSession).not.toHaveBeenCalled();
      expect(directEmit).not.toHaveBeenCalledWith(CALL_EVENTS.ERROR, expect.anything());
    });

    it('completes without throwing on the unauthenticated-guard early return', async () => {
      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => undefined);

      await expect(handlers[CALL_EVENTS.END](END_DATA)).resolves.not.toThrow();
      expect(mockEndCall).not.toHaveBeenCalled();
    });
  });
});
