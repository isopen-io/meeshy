/**
 * CallEventsHandler — signalSessionCache must be invalidated when a
 * participant actually leaves the call (audit appels, session Vague 37).
 *
 * The 2s TTL cache added for the `call:signal` hot-path (audit #10,
 * `CallEventsHandler-signal-session-cache.test.ts`) only forces a fresh DB
 * read when a participant is ABSENT from the cached snapshot (a fresh join)
 * or when the signal is an `answer`. It never forced a fresh read when a
 * participant who WAS present in the cached snapshot has since left — the
 * cached entry still shows them with `leftAt: null` for up to 2s after
 * `call:leave` / `call:force-leave` / `call:end` / disconnect-grace expiry
 * have already written `leftAt` to the DB.
 *
 * CVE-001's "sender is actually a participant in the call" and "target
 * participant valid" checks read `findSender`/`findTarget` straight off that
 * stale snapshot — during the up-to-2s window, a participant who just left
 * (or a stale target who just left) still passes, and their `call:signal`
 * (any type other than `answer`) is relayed to the peer. Fix: evict the
 * cache entry for a callId the moment ANY leave/end path writes `leftAt`, so
 * the very next `call:signal` for that call always re-reads fresh.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetCallSession = jest.fn<any>();
const mockLeaveCall = jest.fn<any>();
const mockEndCall = jest.fn<any>();
const mockClearRingingTimeout = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();
const mockForceEndOrphanedCallSession = jest.fn<any>();
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
  // Mirrors the real CallAlreadyEndedError (services/CallService.ts) — Issue
  // #3581: endCall() now throws this (instead of returning silently) on a
  // call already in a terminal state, so the handler's `instanceof` check
  // needs a real class here, not `undefined`.
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
      getCallSession: mockGetCallSession,
      leaveCall: mockLeaveCall,
      endCall: mockEndCall,
      clearRingingTimeout: mockClearRingingTimeout,
      createCallSummaryMessage: mockCreateCallSummaryMessage,
      forceEndOrphanedCallSession: mockForceEndOrphanedCallSession,
      updateCallStatus: jest.fn<any>().mockResolvedValue(undefined),
      getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
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
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
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
  checkSocketRateLimit: jest.fn<any>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    CALL_SIGNAL: { maxRequests: 100, windowMs: 10000, keyPrefix: 'socket:call:signal' },
    CALL_ICE_CANDIDATE: { maxRequests: 60, windowMs: 10000, keyPrefix: 'socket:call:ice' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = '507f1f77bcf86cd799439021';
const CONV_ID = '507f1f77bcf86cd799439022';
const USER_A = 'user-a';
const USER_B = 'user-b';
const MEMBERSHIP_A = 'membership-a';

function makeActiveSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: USER_A,
    answeredAt: new Date(),
    status: 'active',
    participants: [
      { id: 'cp-a', participantId: 'pa', leftAt: null, participant: { userId: USER_A } },
      { id: 'cp-b', participantId: 'pb', leftAt: null, participant: { userId: USER_B } },
    ],
  };
}

function makeEndedSession() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    status: 'ended',
    duration: 42,
    endReason: 'completed',
    mode: 'p2p',
    participants: [
      { id: 'cp-a', participantId: 'pa', leftAt: new Date(), participant: { userId: USER_A } },
      { id: 'cp-b', participantId: 'pb', leftAt: null, participant: { userId: USER_B } },
    ],
  };
}

function makeSignal(overrides: Partial<{ type: string; from: string; to: string }> = {}) {
  return {
    callId: CALL_ID,
    signal: {
      type: overrides.type ?? 'ice-candidate',
      from: overrides.from ?? USER_A,
      to: overrides.to ?? USER_B,
      payload: {},
    },
  };
}

function makePrisma() {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: MEMBERSHIP_A }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
  } as unknown as PrismaClient;
}

function makeHarness() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-inv-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(['socket-inv-1', `call:${CALL_ID}`]),
    data: {},
  };
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
  };
  const prisma = makePrisma();
  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(socket as any, io as any, () => USER_A);
  return { handler, handlers, directEmit, io };
}

async function primeCache(handlers: Record<string, (...args: any[]) => any>) {
  await handlers[CALL_EVENTS.SIGNAL](makeSignal(), jest.fn<any>());
}

describe('CallEventsHandler — signalSessionCache invalidated on leave/end', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallSession.mockResolvedValue(makeActiveSession());
    mockCreateCallSummaryMessage.mockResolvedValue(null);
  });

  it('call:leave evicts the cached session for that callId', async () => {
    const { handler, handlers } = makeHarness();
    await primeCache(handlers);
    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(true);

    mockLeaveCall.mockResolvedValue(makeEndedSession());
    await handlers['call:leave']({ callId: CALL_ID });

    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(false);
  });

  it('call:force-leave evicts the cached session for that callId', async () => {
    const prisma = makePrisma();
    (prisma as any).callSession.findMany = jest.fn<any>().mockResolvedValue([makeActiveSession()]);
    const handlers: Record<string, (...args: any[]) => any> = {};
    const socket = {
      id: 'socket-inv-2',
      on: jest.fn((event: string, fn: (...args: any[]) => any) => { handlers[event] = fn; }),
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      data: {},
    };
    const io = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      in: jest.fn().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
    };
    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io as any, () => USER_A);
    await primeCache(handlers);
    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(true);

    mockLeaveCall.mockResolvedValue(makeEndedSession());
    await handlers['call:force-leave']({ conversationId: CONV_ID });

    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(false);
  });

  it('call:end evicts the cached session for that callId', async () => {
    const { handler, handlers } = makeHarness();
    await primeCache(handlers);
    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(true);

    mockEndCall.mockResolvedValue(makeEndedSession());
    await handlers['call:end']({ callId: CALL_ID, reason: 'completed' }, jest.fn<any>());

    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(false);
  });

  it('call:end error-recovery (endCall throws) still evicts the cached session', async () => {
    // When endCall() rejects with a non-authorization error, its transaction
    // rolls back and the happy-path invalidateSignalSession is skipped. The
    // catch block force-ends the call via forceEndOrphanedCallSession, which
    // stamps CallParticipant.leftAt for every still-open participant — so the
    // same "every leftAt write evicts the cache" invariant applies here too.
    const { handler, handlers } = makeHarness();
    await primeCache(handlers);
    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(true);

    mockEndCall.mockRejectedValue(new Error('transient write failure'));
    mockForceEndOrphanedCallSession.mockResolvedValue({
      duration: 42,
      conversationId: CONV_ID,
      status: 'ended',
      endReason: 'completed',
    });
    await handlers['call:end']({ callId: CALL_ID, reason: 'completed' }, jest.fn<any>());

    expect(mockForceEndOrphanedCallSession).toHaveBeenCalledWith(CALL_ID, 'completed');
    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(false);
  });

  it("the anonymous-guest disconnect fanout (AuthHandler → broadcastParticipantLeftResult) evicts the cached session", async () => {
    // AuthHandler.handleDisconnection is the ONLY cleanup path for anonymous
    // participants (this handler's own disconnect flow is keyed on
    // participant.userId, always null for a guest). It calls
    // CallService.leaveCall — which writes leftAt — then fans out through
    // broadcastParticipantLeftResult. Every other leftAt-writing path above
    // evicts the cache; this one did not, leaving up to 2s in which a reaped
    // call's ICE/SDP still relays off the stale snapshot.
    const { handler, handlers, io } = makeHarness();
    await primeCache(handlers);
    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(true);

    await handler.broadcastParticipantLeftResult({
      io: io as any,
      leftSession: makeEndedSession() as any,
      participation: {
        id: 'cp-anon',
        participantId: 'p-anon',
        callSessionId: CALL_ID,
        callSession: { mode: 'p2p', conversationId: CONV_ID, status: 'ended' },
      } as any,
      userId: 'anon-guest',
    });

    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(false);
  });

  it('forceCleanupParticipationAfterLeaveFailure evicts the cache AFTER the leftAt write commits, not before (Vague 50)', async () => {
    // `forceCleanupParticipationAfterLeaveFailure` invalidated the cache
    // BEFORE awaiting the `leftAt` transaction, unlike every other one of the
    // 8 invalidation call sites (all invalidate strictly after their write
    // commits). A `call:signal` racing the in-flight transaction can hit the
    // now-empty cache, force a fresh read of the still-uncommitted (pre-write)
    // session, and repopulate the cache with a stale "not left" snapshot that
    // then survives the full 2s TTL *after* the write actually lands.
    const { handler, handlers, io, directEmit } = makeHarness();
    await primeCache(handlers);
    expect((handler as any).signalSessionCache.has(CALL_ID)).toBe(true);

    const sessionAfterWrite = {
      ...makeActiveSession(),
      participants: [
        { id: 'cp-a', participantId: 'pa', leftAt: new Date(), participant: { userId: USER_A } },
        { id: 'cp-b', participantId: 'pb', leftAt: null, participant: { userId: USER_B } },
      ],
    };

    (handler as any).prisma.$transaction = jest.fn(async () => {
      // A signal from A races the in-flight write: at this instant the DB
      // has not committed yet, so a forced re-read (triggered by an
      // already-evicted cache) would still see A as `leftAt: null`.
      await handlers[CALL_EVENTS.SIGNAL](
        makeSignal({ type: 'ice-candidate', from: USER_A, to: USER_B }),
        jest.fn<any>()
      );
      // The write "commits" only now.
      mockGetCallSession.mockResolvedValue(sessionAfterWrite);
      return 1; // one remaining participant (B) — skips the force-end branch
    });

    await handler.forceCleanupParticipationAfterLeaveFailure({
      io: io as any,
      participation: {
        id: 'cp-a',
        participantId: 'pa',
        callSessionId: CALL_ID,
        callSession: { mode: 'p2p', conversationId: CONV_ID, status: 'active' }
      } as any,
      userId: USER_A,
      leaveError: new Error('db blip')
    });

    // Within the TTL, a second signal from the now-departed A must be
    // rejected — not served from a snapshot repopulated mid-transaction,
    // before the write committed.
    directEmit.mockClear();
    await handlers[CALL_EVENTS.SIGNAL](
      makeSignal({ type: 'ice-candidate', from: USER_A, to: USER_B }),
      jest.fn<any>()
    );

    expect(directEmit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({ code: 'NOT_A_PARTICIPANT' })
    );
  });

  it('forceCleanupParticipationAfterLeaveFailure emits PARTICIPANT_LEFT with userId, mirroring broadcastParticipantLeftResult (Vague 133)', async () => {
    // Vague 132 added `userId` to broadcastParticipantLeftResult's own emit
    // (this file's harness doesn't cover the payload shape, only cache
    // timing) but left this sibling fallback — reached when leaveCall
    // itself throws (DB blip, validation failure) — on the old shape.
    // Every client that resolves PARTICIPANT_LEFT identity by `userId`
    // (VideoCallInterface.handleParticipantLeft, useRemoteCallAlerts)
    // silently no-ops specifically on this path, leaving the other
    // participants with a stale tile/zombie RTCPeerConnection.
    const { handler, handlers, io } = makeHarness();
    await primeCache(handlers);
    // makePrisma()'s mock has no `$transaction` — stub it the same way the
    // Vague 50 test above does, so the leftAt-write branch actually runs
    // instead of throwing before reaching the emit below.
    (handler as any).prisma.$transaction = jest.fn<any>().mockResolvedValue(1);

    await handler.forceCleanupParticipationAfterLeaveFailure({
      io: io as any,
      participation: {
        id: 'cp-a',
        participantId: 'pa',
        callSessionId: CALL_ID,
        callSession: { mode: 'p2p', conversationId: CONV_ID, status: 'active' }
      } as any,
      userId: USER_A,
      leaveError: new Error('db blip')
    });

    const emitMock = (io.to(ROOMS.call(CALL_ID)) as any).emit as jest.Mock<any>;
    const participantLeftCall = emitMock.mock.calls.find(
      ([event]: any[]) => event === CALL_EVENTS.PARTICIPANT_LEFT
    );
    expect(participantLeftCall).toBeDefined();
    expect(participantLeftCall![1]).toMatchObject({
      callId: CALL_ID,
      participantId: 'cp-a',
      userId: USER_A
    });
  });

  it('a stale-cache signal from a just-left sender is rejected (fresh read forced), not relayed', async () => {
    const { handlers, directEmit } = makeHarness();
    await primeCache(handlers);

    // A leaves — call:leave's own pre-check ("callBefore") still needs to see
    // A as active (default mock), same as it would in prod at the moment the
    // leave request lands.
    mockLeaveCall.mockResolvedValue(makeEndedSession());
    await handlers['call:leave']({ callId: CALL_ID });

    // Only NOW does the authoritative session reflect the leave.
    mockGetCallSession.mockResolvedValue(makeEndedSession());

    // Without invalidation this would be served from the (now stale) 2s
    // cache primed above, where A still shows leftAt: null, and relayed.
    await handlers[CALL_EVENTS.SIGNAL](makeSignal({ type: 'ice-candidate' }), jest.fn<any>());

    expect(directEmit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({ code: 'NOT_A_PARTICIPANT' })
    );
  });
});
