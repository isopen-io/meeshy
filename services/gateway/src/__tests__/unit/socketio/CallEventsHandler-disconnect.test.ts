/**
 * CallEventsHandler — disconnect handler: force-cleanup path
 *
 * Covers the `if (remainingParticipants === 0)` branch that force-ends a call
 * when every participant has left, reached when the normal `leaveCall()` path
 * throws and the fallback `$transaction` cleanup runs with zero remaining
 * participants.
 *
 * CALL-RESILIENCE 2026-07-02 — a disconnect of an ANSWERED (active) call no
 * longer ends it immediately: it arms a reconnect grace window (the P2P media
 * survives a transient signaling drop / gateway restart). The terminal
 * leave/force-cleanup path below therefore runs at grace EXPIRY, which these
 * tests drive with fake timers (`advanceTimersByTimeAsync`). The pre-answer
 * immediate-end path and the grace-vs-reconnect matrix are covered by
 * CallEventsHandler-restart-resilience.test.ts.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const GRACE_EXPIRY_MS = 31_000;

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockLeaveCallDc = jest.fn<any>();
const mockCreateCallSummaryMessageDc = jest.fn<any>();
const mockForceEndOrphanedCallSessionDc = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    leaveCall: mockLeaveCallDc,
    createCallSummaryMessage: mockCreateCallSummaryMessageDc,
    initiateCall: jest.fn<any>(),
    joinCall: jest.fn<any>(),
    endCall: jest.fn<any>(),
    getCallSession: jest.fn<any>(),
    generateIceServers: jest.fn<any>().mockReturnValue([]),
    clearRingingTimeout: jest.fn<any>(),
    scheduleRingingTimeout: jest.fn<any>(),
    listHistory: jest.fn<any>(),
    handleMissedCall: jest.fn<any>(),
    forceEndOrphanedCallSession: mockForceEndOrphanedCallSessionDc,
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

const mockCheckRateLimitDc = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimitDc,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimitDc,
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
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-dc-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const CALL_PART_ID = 'call-part-dc-abc';
const MEMBERSHIP_ID = 'membership-dc-abc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActiveParticipation(overrides: Record<string, any> = {}) {
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
    ...overrides,
  };
}

function makePrisma(): PrismaClient & {
  callParticipant: { findMany: jest.MockedFunction<any> };
  $transaction: jest.MockedFunction<any>;
} {
  // Default: $transaction executes callback with a tx that counts 0 remaining participants
  const txCallParticipantUpdate = jest.fn<any>().mockResolvedValue(undefined);
  const txCallParticipantCount = jest.fn<any>().mockResolvedValue(0);
  const txCallSessionFindUnique = jest.fn<any>().mockResolvedValue({
    id: CALL_ID,
    startedAt: new Date(Date.now() - 60_000),
  });
  const txCallSessionUpdate = jest.fn<any>().mockResolvedValue(undefined);

  const $transaction = jest.fn<any>(async (callback: (tx: any) => Promise<any>) => {
    const tx = {
      callParticipant: {
        update: txCallParticipantUpdate,
        count: txCallParticipantCount,
      },
      callSession: {
        findUnique: txCallSessionFindUnique,
        update: txCallSessionUpdate,
      },
    };
    return callback(tx);
  });

  return {
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue([makeActiveParticipation()]),
      // CALL-RESILIENCE — grace-expiry re-check: participant still present, call
      // not ended elsewhere → the terminal leave path proceeds.
      findUnique: jest.fn<any>().mockResolvedValue({
        leftAt: null,
        callSession: { status: 'active' },
      }),
    },
    $transaction,
  } as unknown as PrismaClient & {
    callParticipant: { findMany: jest.MockedFunction<any> };
    $transaction: jest.MockedFunction<any>;
  };
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-dc-1',
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

function makeIo(rooms?: Map<string, Set<string>>) {
  const roomEmit = jest.fn<any>();
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
    ...(rooms ? { sockets: { adapter: { rooms } } } : {}),
  };
  return { io, roomEmit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — disconnect handler force-cleanup', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockCreateCallSummaryMessageDc.mockResolvedValue(null);
    // Terminal write now goes through CallService.forceEndOrphanedCallSession
    // (status-guarded + version-bumped) instead of a raw callSession.update
    // inside the $transaction above — see CallService.test.ts for its own
    // unit coverage. Default: succeeds, matching the count=0 fixtures below.
    mockForceEndOrphanedCallSessionDc.mockResolvedValue({ duration: 60, conversationId: CONV_ID });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Line 1932: remainingParticipants === 0 → force-end the call
  // -------------------------------------------------------------------------

  describe('remainingParticipants === 0 branch (line 1932)', () => {
    it('force-ends the call via $transaction when leaveCall throws and 0 participants remain', async () => {
      // leaveCall throws → inner catch fires → $transaction runs → count=0 → line 1932 true
      mockLeaveCallDc.mockRejectedValue(new Error('DB error'));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);

      // Fire the disconnect event
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      // $transaction must have been invoked for force cleanup
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('broadcasts CALL_EVENTS.ENDED when force-cleanup ends the call (dcForceEndedDuration !== null)', async () => {
      mockLeaveCallDc.mockRejectedValue(new Error('DB error'));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      // After force cleanup, call:ended is broadcast to both rooms
      const endedEmits = (io.to as jest.MockedFunction<any>).mock.calls
        .filter(() => true)
        .map(([room]) => room);

      // Should include broadcasts to the call room
      expect(roomEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ENDED,
        expect.objectContaining({ callId: CALL_ID })
      );
    });

    it('posts the call-summary message when force-cleanup ends the call', async () => {
      // A crash / app-kill / network drop is a terminal path just like an
      // explicit call:leave or call:end — the "Appel … · MM:SS" system
      // message must not be silently skipped here.
      mockLeaveCallDc.mockRejectedValue(new Error('DB error'));

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(mockCreateCallSummaryMessageDc).toHaveBeenCalledWith(CALL_ID);
    });

    it('does NOT force-end the call when participants remain (remainingParticipants > 0)', async () => {
      // $transaction returns count=1 → line 1932 is false → no call:ended broadcast
      mockLeaveCallDc.mockRejectedValue(new Error('DB error'));

      const prisma = makePrisma();
      // Override count to return 1 instead of 0
      (prisma.$transaction as jest.MockedFunction<any>).mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          const tx = {
            callParticipant: {
              update: jest.fn<any>().mockResolvedValue(undefined),
              count: jest.fn<any>().mockResolvedValue(1), // still participants remaining
            },
            callSession: {
              findUnique: jest.fn<any>().mockResolvedValue(null),
              update: jest.fn<any>().mockResolvedValue(undefined),
            },
          };
          return callback(tx);
        }
      );

      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      // With 1 remaining participant, call:ended should NOT be broadcast
      const endedBroadcasts = (roomEmit as jest.MockedFunction<any>).mock.calls
        .filter(([event]) => event === CALL_EVENTS.ENDED);
      expect(endedBroadcasts).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // ZOMBIE-SOCKET GUARD (2026-07-02) — a stale socket from a previous session
  // expiring must NOT tear down calls the user is actively on through another
  // live socket (prod: two expired zombies of atabeth killed call 6a464c61
  // mid-ring while the active socket was still receiving messages).
  // -------------------------------------------------------------------------

  describe('zombie-socket guard: other live sockets for the same user', () => {
    it('does nothing (no leave, no grace, no DB scan) when the user room still has a live socket', async () => {
      mockLeaveCallDc.mockResolvedValue({
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'active',
        duration: null,
        endReason: null,
        mode: 'p2p',
      });

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      // On 'disconnect' the closing socket has already left its rooms — any
      // member left in the user room is a DIFFERENT, live connection.
      const { io, roomEmit } = makeIo(
        new Map([[ROOMS.user(USER_ID), new Set(['other-live-socket'])]])
      );

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(prisma.callParticipant.findMany).not.toHaveBeenCalled();
      expect(mockLeaveCallDc).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('proceeds with normal disconnect cleanup when the user room is empty', async () => {
      const leftSession = {
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'active',
        duration: null,
        endReason: null,
        mode: 'p2p',
      };
      mockLeaveCallDc.mockResolvedValue(leftSession);

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo(new Map());

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(prisma.callParticipant.findMany).toHaveBeenCalled();
      expect(roomEmit).toHaveBeenCalledWith(
        CALL_EVENTS.PARTICIPANT_LEFT,
        expect.objectContaining({ callId: CALL_ID })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Audit C5 (2026-07-02) — Prisma-on-Mongo `{leftAt: null}` does not match
  // documents whose leftAt field was never written; every "still in call"
  // filter must cover both shapes.
  // -------------------------------------------------------------------------

  describe('audit C5: leftAt filters match null OR unset', () => {
    it('scans active participations matching leftAt null OR unset', async () => {
      mockLeaveCallDc.mockResolvedValue({
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'active',
        duration: null,
        endReason: null,
        mode: 'p2p',
      });

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(prisma.callParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
            participant: { userId: USER_ID }
          })
        })
      );
    });

    it('force-cleanup counts remaining participants matching leftAt null OR unset', async () => {
      mockLeaveCallDc.mockRejectedValue(new Error('DB error'));

      const prisma = makePrisma();
      const countMock = jest.fn<any>().mockResolvedValue(1);
      (prisma.$transaction as jest.MockedFunction<any>).mockImplementation(
        async (callback: (tx: any) => Promise<any>) => {
          const tx = {
            callParticipant: {
              update: jest.fn<any>().mockResolvedValue(undefined),
              count: countMock,
            },
            callSession: {
              findUnique: jest.fn<any>().mockResolvedValue(null),
              update: jest.fn<any>().mockResolvedValue(undefined),
            },
          };
          return callback(tx);
        }
      );

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(countMock).toHaveBeenCalledWith({
        where: {
          callSessionId: CALL_ID,
          OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Guard: no active participations → nothing to do
  // -------------------------------------------------------------------------

  describe('no active participations → leaveCall not called', () => {
    it('exits early when user has no active call participations', async () => {
      const prisma = makePrisma();
      (prisma.callParticipant.findMany as jest.MockedFunction<any>).mockResolvedValue([]);

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(mockLeaveCallDc).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Guard: userId not recoverable
  // -------------------------------------------------------------------------

  describe('userId not recoverable → no-op', () => {
    it('returns immediately when recoverUserId returns undefined', async () => {
      const prisma = makePrisma();

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      // getUserId always returns undefined; no prior authenticated event → cachedUserId is also undefined
      handler.setupCallEvents(socket as any, io, () => undefined);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(prisma.callParticipant.findMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path: leaveCall succeeds, no force cleanup needed
  // -------------------------------------------------------------------------

  describe('happy path: leaveCall succeeds, broadcasts PARTICIPANT_LEFT', () => {
    it('broadcasts PARTICIPANT_LEFT without entering the force-cleanup path', async () => {
      const leftSession = {
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'active',
        duration: null,
        endReason: null,
        mode: 'p2p',
      };
      mockLeaveCallDc.mockResolvedValue(leftSession);

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(roomEmit).toHaveBeenCalledWith(
        CALL_EVENTS.PARTICIPANT_LEFT,
        expect.objectContaining({ callId: CALL_ID })
      );
      // Force cleanup NOT triggered
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('posts the call-summary message when leaveCall itself ends the call', async () => {
      const leftSession = {
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'ended',
        duration: 42,
        endReason: 'completed',
        mode: 'p2p',
      };
      mockLeaveCallDc.mockResolvedValue(leftSession);

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(mockCreateCallSummaryMessageDc).toHaveBeenCalledWith(CALL_ID);
    });

    // -----------------------------------------------------------------------
    // Regression: a disconnect-grace expiry that resolves a pre-answer call
    // to `missed` must trigger the same missed-call notification path as the
    // call:leave/call:force-leave/call:end sibling handlers (Vague 24).
    // -----------------------------------------------------------------------

    it('triggers handleMissedCall when the disconnect-grace leave resolves to missed', async () => {
      const leftSession = {
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'missed',
        duration: 0,
        endReason: 'missed',
        mode: 'p2p',
      };
      mockLeaveCallDc.mockResolvedValue(leftSession);

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      const handleMissedCallSpy = jest
        .spyOn(handler, 'handleMissedCall')
        .mockResolvedValue(undefined);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(handleMissedCallSpy).toHaveBeenCalledWith(CALL_ID);
    });

    it('does not trigger handleMissedCall when the disconnect-grace leave resolves to ended', async () => {
      const leftSession = {
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'ended',
        duration: 42,
        endReason: 'completed',
        mode: 'p2p',
      };
      mockLeaveCallDc.mockResolvedValue(leftSession);

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      const handleMissedCallSpy = jest
        .spyOn(handler, 'handleMissedCall')
        .mockResolvedValue(undefined);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      expect(handleMissedCallSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // CALL-RESILIENCE — call:ended must reach a still-ringing callee (joined
  // neither the call room nor the conversation room, only their own user
  // room) when the OTHER party disconnects instead of hanging up explicitly.
  // Regression guard for the phantom-ringing bug: leaveParticipationAndBroadcast
  // used to emit only to ROOMS.call/ROOMS.conversation, bypassing the shared
  // broadcastCallEnded/resolveCallEndedRooms fanout that call:end already uses.
  // -------------------------------------------------------------------------

  describe('CALL-RESILIENCE: call:ended reaches a still-ringing callee via user-room fanout', () => {
    it('fans call:ended out to every active member\'s user room when leaveCall itself ends the call', async () => {
      const leftSession = {
        id: CALL_ID,
        conversationId: CONV_ID,
        status: 'ended',
        duration: 12,
        endReason: 'completed',
        mode: 'p2p',
      };
      mockLeaveCallDc.mockResolvedValue(leftSession);

      const prisma = makePrisma();
      (prisma as any).participant = {
        findMany: jest.fn<any>().mockResolvedValue([{ userId: 'still-ringing-callee' }]),
      };

      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      const roomsPassedToIo = (io.to as jest.MockedFunction<any>).mock.calls
        .map(([rooms]) => rooms)
        .flat();
      expect(roomsPassedToIo).toContain(ROOMS.user('still-ringing-callee'));
      expect(roomEmit).toHaveBeenCalledWith(CALL_EVENTS.ENDED, expect.objectContaining({ callId: CALL_ID }));
    });

    it('fans call:ended out to every active member\'s user room via the force-cleanup path', async () => {
      mockLeaveCallDc.mockRejectedValue(new Error('DB error'));

      const prisma = makePrisma();
      (prisma as any).participant = {
        findMany: jest.fn<any>().mockResolvedValue([{ userId: 'still-ringing-callee' }]),
      };

      const { socket, handlers } = makeSocket();
      const { io, roomEmit } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers['disconnect']();
      await jest.advanceTimersByTimeAsync(GRACE_EXPIRY_MS);

      const roomsPassedToIo = (io.to as jest.MockedFunction<any>).mock.calls
        .map(([rooms]) => rooms)
        .flat();
      expect(roomsPassedToIo).toContain(ROOMS.user('still-ringing-callee'));
      expect(roomEmit).toHaveBeenCalledWith(CALL_EVENTS.ENDED, expect.objectContaining({ callId: CALL_ID }));
    });
  });
});
