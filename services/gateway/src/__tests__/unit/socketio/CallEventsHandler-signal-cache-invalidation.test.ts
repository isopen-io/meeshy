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

jest.mock('../../../services/CallService', () => ({
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
}));

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
  return { handler, handlers, directEmit };
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
