/**
 * CallService.leaveCall() — heartbeat cleanup regression tests
 *
 * Regression for the memory leak where clearHeartbeats(callId) was never
 * called from leaveCall() terminal paths (last participant leaves, or the
 * idempotent-leave direct-call force-end path).
 *
 * These tests mock Prisma at the module level so no DB is needed.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_EVENTS: { ENDED: 'call:ended' },
  CALL_ERROR_CODES: {
    CALL_NOT_FOUND: 'CALL_NOT_FOUND',
    NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  },
  ACTIVE_STATUSES: ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'],
  TERMINAL_STATUSES: ['ended', 'missed', 'rejected', 'failed'],
  CALL_HISTORY_WINDOW_MS: 3 * 30 * 24 * 60 * 60 * 1000,
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  ROOMS: {
    call: (id: string) => `call:${id}`,
    conversation: (id: string) => `conversation:${id}`,
  },
}));

import { CallService } from '../../../services/CallService';
import { CallStatus, CallEndReason } from '@meeshy/shared/prisma/client';

type MockFn = jest.Mock<any>;

const buildMockPrisma = () => ({
  callParticipant: {
    findFirst: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
    updateMany: jest.fn() as MockFn,
    // Vague 183 — leaveCall()'s fresh in-transaction remaining-active count
    // (see CallService.leaveCall). No default: every test that reaches it
    // states the participant count it means to exercise.
    count: jest.fn() as MockFn,
  },
  callSession: {
    findUnique: jest.fn() as MockFn,
    findFirst: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
  },
  conversation: {
    findUnique: jest.fn() as MockFn,
  },
  $transaction: jest.fn() as MockFn,
});

/**
 * `remainingActive` mirrors what leaveCall()'s fresh in-transaction
 * `callParticipant.count` would read for the OTHER active participants —
 * defaults to 0 (the leaver is the last one), the common case among this
 * file's callers.
 */
const setupTransactionPassthrough = (
  prisma: ReturnType<typeof buildMockPrisma>,
  remainingActive = 0
) => {
  prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
    const tx = {
      callParticipant: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(remainingActive),
      },
      callSession: {
        update: jest.fn().mockResolvedValue({ id: 'call-1', status: CallStatus.ended }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    return cb(tx);
  });
};

describe('CallService.leaveCall() — never-answered reconnecting call resolves missed', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let service: CallService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    service = new CallService(prisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('classifies the last leave of a reconnecting-but-never-answered call as missed (prod 2026-07-03)', async () => {
    // Same defect as endCall: the pre-answer status list forgot
    // `reconnecting` (reachable pre-answer via a client watchdog firing
    // during the ring). answeredAt is the authoritative signal.
    const callId = 'call-reco-1';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    const callRow = {
      id: callId,
      conversationId: 'conv-1',
      status: CallStatus.reconnecting,
      startedAt: new Date(Date.now() - 40_000),
      answeredAt: null,
      participants: [callParticipantRow],
      metadata: null,
    };

    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(callRow)
      .mockResolvedValue({ ...callRow, status: CallStatus.missed });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });

    let capturedStatus: string | undefined;
    let capturedReason: string | undefined;
    prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          // Direct call, sole participant — the fresh in-transaction count confirms it.
          count: jest.fn().mockResolvedValue(0),
        },
        callSession: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            if (data?.status !== undefined) {
              capturedStatus = data.status;
              capturedReason = data.endReason;
            }
            return { count: 1 };
          }),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    await service.leaveCall({ callId, userId, participantId });

    expect(capturedStatus).toBe(CallStatus.missed);
    expect(capturedReason).toBe(CallEndReason.missed);
  });
});

describe('CallService.leaveCall() — clearHeartbeats memory leak regression', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let service: CallService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    service = new CallService(prisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls clearHeartbeats after the last participant leaves a direct call', async () => {
    const callId = 'call-direct-1';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    const callRow = {
      id: callId,
      conversationId: 'conv-1',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 60_000),
      answeredAt: new Date(Date.now() - 30_000),
      participants: [callParticipantRow],
      metadata: null,
    };

    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(callRow)
      .mockResolvedValue({ ...callRow, status: CallStatus.ended });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    setupTransactionPassthrough(prisma);

    const clearSpy = jest.spyOn(service as any, 'clearHeartbeats');

    await service.leaveCall({ callId, userId, participantId });

    expect(clearSpy).toHaveBeenCalledWith(callId);
  });

  it('calls clearHeartbeats when last participant leaves a group call', async () => {
    const callId = 'call-group-1';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    const callRow = {
      id: callId,
      conversationId: 'conv-group',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 120_000),
      answeredAt: new Date(Date.now() - 60_000),
      participants: [callParticipantRow], // only one left
      metadata: null,
    };

    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(callRow)
      .mockResolvedValue({ ...callRow, status: CallStatus.ended });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'group' });
    setupTransactionPassthrough(prisma);

    const clearSpy = jest.spyOn(service as any, 'clearHeartbeats');

    await service.leaveCall({ callId, userId, participantId });

    expect(clearSpy).toHaveBeenCalledWith(callId);
  });

  it('does NOT call clearHeartbeats when a non-last participant leaves a group call', async () => {
    const callId = 'call-group-2';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    const otherParticipant = { id: 'cp-2', callSessionId: callId, participantId: 'part-2', leftAt: null };
    const callRow = {
      id: callId,
      conversationId: 'conv-group',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 120_000),
      answeredAt: new Date(Date.now() - 60_000),
      participants: [callParticipantRow, otherParticipant],
      metadata: null,
    };

    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(callRow)
      .mockResolvedValue({ ...callRow, participants: [otherParticipant] });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'group' });
    // `otherParticipant` genuinely remains active — confirmed fresh, inside
    // leaveCall()'s own transaction (Vague 183).
    setupTransactionPassthrough(prisma, 1);

    const clearSpy = jest.spyOn(service as any, 'clearHeartbeats');

    await service.leaveCall({ callId, userId, participantId });

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('idempotent leave — group continues: still deletes the departed participant\'s heartbeat entry', async () => {
    // Vague 157 — twin of the two branches above (last-participant-leaves,
    // terminal-guard leave): this is the THIRD branch that resolves a
    // departed participant without ending the call — the idempotent leave
    // whose CallParticipant row is already gone (racing auto-leave, a
    // duplicate call:leave, or CallEventsHandler's
    // forceCleanupParticipationAfterLeaveFailure fallback stamping leftAt
    // directly) — for a GROUP call where others are still active. Unlike
    // its two siblings, it returned early without calling
    // clearParticipantBackgrounded()/deleting the heartbeat entry, leaking
    // the departed participant's heartbeat for the rest of the call. Left
    // long enough, the leaked entry inflates CallCleanupService's stale-vs-
    // live ratio and can force-end a call that is still legitimately active
    // for its remaining participants.
    const callId = 'call-group-idem-1';
    const participantId = 'part-gone';

    const existingCall = {
      id: callId,
      conversationId: 'conv-group',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 120_000),
      answeredAt: new Date(Date.now() - 60_000),
      endedAt: null,
      version: 3,
      metadata: null,
      participants: [
        { id: 'cp-gone', callSessionId: callId, participantId, leftAt: new Date() },
        { id: 'cp-2', callSessionId: callId, participantId: 'part-2', leftAt: null },
        { id: 'cp-3', callSessionId: callId, participantId: 'part-3', leftAt: null },
      ],
    };

    // findFirst returns null: the leaver's row is already gone → idempotent branch.
    prisma.callParticipant.findFirst.mockResolvedValue(null);
    prisma.callSession.findUnique.mockResolvedValue(existingCall);
    prisma.conversation.findUnique.mockResolvedValue({ type: 'group' });

    service.recordHeartbeat(callId, participantId);
    expect(service['heartbeats'].get(callId)?.has(participantId)).toBe(true);

    await service.leaveCall({ callId, userId: 'user-x', participantId });

    expect(service['heartbeats'].get(callId)?.has(participantId)).toBe(false);
  });

  it('calls clearHeartbeats on the idempotent-leave direct-call force-end path', async () => {
    const callId = 'call-idem-1';
    const participantId = 'part-missing';
    const userId = 'user-1';

    const existingCall = {
      id: callId,
      conversationId: 'conv-direct',
      status: CallStatus.active,
      startedAt: new Date(Date.now() - 30_000),
      endedAt: null,
      participants: [],
    };

    // findFirst returns null (participant row already gone)
    prisma.callParticipant.findFirst.mockResolvedValue(null);
    prisma.callSession.findUnique
      .mockResolvedValueOnce(existingCall)
      .mockResolvedValue({ ...existingCall, status: CallStatus.ended, endedAt: new Date() });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    setupTransactionPassthrough(prisma);

    const clearSpy = jest.spyOn(service as any, 'clearHeartbeats');

    await service.leaveCall({ callId, userId, participantId });

    expect(clearSpy).toHaveBeenCalledWith(callId);
  });
});

describe('CallService.leaveCall() — endedBy stampé sur les DEUX branches terminales', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let service: CallService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    service = new CallService(prisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const captureTerminalWrite = () => {
    let capturedData: any;
    prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          // Direct call in every test using this helper — irrelevant to the
          // outcome (isDirectCall short-circuits), but the fresh
          // in-transaction read always runs.
          count: jest.fn().mockResolvedValue(0),
        },
        callSession: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            if (data?.status !== undefined) {
              capturedData = data;
            }
            return { count: 1 };
          }),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });
    return () => capturedData;
  };

  it('branche principale : le dernier leave écrit metadata.endedBy = userId en préservant type', async () => {
    const callId = 'call-main-1';
    const participantId = 'part-1';
    const userId = 'user-leaver';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce({
        id: callId,
        conversationId: 'conv-1',
        status: CallStatus.ringing,
        startedAt: new Date(Date.now() - 20_000),
        answeredAt: null,
        endedAt: null,
        version: 3,
        participants: [callParticipantRow],
        metadata: { type: 'video', mode: 'p2p' },
      })
      .mockResolvedValue({ id: callId, status: CallStatus.missed, participants: [] });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    const getData = captureTerminalWrite();

    await service.leaveCall({ callId, userId, participantId });

    expect(getData()).toBeDefined();
    expect(getData().metadata).toEqual({ type: 'video', mode: 'p2p', endedBy: userId });
  });

  it('branche idempotente : le force-end écrit aussi metadata.endedBy = userId', async () => {
    const callId = 'call-idem-2';
    const participantId = 'part-missing';
    const userId = 'user-canceller';

    prisma.callParticipant.findFirst.mockResolvedValue(null);
    prisma.callSession.findUnique
      .mockResolvedValueOnce({
        id: callId,
        conversationId: 'conv-direct',
        status: CallStatus.ringing,
        startedAt: new Date(Date.now() - 10_000),
        answeredAt: null,
        endedAt: null,
        version: 1,
        participants: [],
        metadata: { type: 'audio' },
      })
      .mockResolvedValue({ id: callId, status: CallStatus.missed, endedAt: new Date(), participants: [] });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    const getData = captureTerminalWrite();

    await service.leaveCall({ callId, userId, participantId });

    expect(getData()).toBeDefined();
    expect(getData().metadata).toEqual({ type: 'audio', endedBy: userId });
  });
});

describe('CallService.leaveCall() — endReasonHint (disconnect-grace vs explicit hangup)', () => {
  // The disconnect-grace-expiry path (CallEventsHandler.leaveParticipationAndBroadcast,
  // the ONLY caller of this method's happy-path branch) is reached exclusively from an
  // involuntary socket disconnect that never reconnected within the grace window — never
  // from an explicit call:leave/call:end. Its own error-fallback branch a few lines away
  // already stamps `CallEndReason.connectionLost` for this exact scenario when leaveCall
  // throws (see forceEndOrphanedCallSession call site). Without this hint, the SAME
  // scenario's happy path silently defaulted to `completed` instead — indistinguishable
  // from a deliberate hangup, and invisible to the web retry-on-failure feature
  // (`isRetryableCallFailure`, which only offers "Réessayer" for `failed`/`connectionLost`).
  let prisma: ReturnType<typeof buildMockPrisma>;
  let service: CallService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildMockPrisma();
    service = new CallService(prisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const captureTerminalWrite = () => {
    let capturedData: any;
    prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        callParticipant: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          // Direct call in every test using this helper — irrelevant to the
          // outcome (isDirectCall short-circuits), but the fresh
          // in-transaction read always runs.
          count: jest.fn().mockResolvedValue(0),
        },
        callSession: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockImplementation(({ data }: any) => {
            if (data?.status !== undefined) {
              capturedData = data;
            }
            return { count: 1 };
          }),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });
    return () => capturedData;
  };

  it('main branch: a post-answer leave with endReasonHint connectionLost writes endReason connectionLost, not completed', async () => {
    const callId = 'call-hint-1';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce({
        id: callId,
        conversationId: 'conv-1',
        status: CallStatus.active,
        startedAt: new Date(Date.now() - 60_000),
        answeredAt: new Date(Date.now() - 30_000),
        endedAt: null,
        version: 1,
        participants: [callParticipantRow],
        metadata: null,
      })
      .mockResolvedValue({ id: callId, status: CallStatus.ended, participants: [] });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    const getData = captureTerminalWrite();

    await service.leaveCall({ callId, userId, participantId, endReasonHint: CallEndReason.connectionLost });

    expect(getData().status).toBe(CallStatus.ended);
    expect(getData().endReason).toBe(CallEndReason.connectionLost);
  });

  it('main branch: no endReasonHint still defaults to completed (explicit call:leave/call:end unaffected)', async () => {
    const callId = 'call-hint-2';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce({
        id: callId,
        conversationId: 'conv-1',
        status: CallStatus.active,
        startedAt: new Date(Date.now() - 60_000),
        answeredAt: new Date(Date.now() - 30_000),
        endedAt: null,
        version: 1,
        participants: [callParticipantRow],
        metadata: null,
      })
      .mockResolvedValue({ id: callId, status: CallStatus.ended, participants: [] });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    const getData = captureTerminalWrite();

    await service.leaveCall({ callId, userId, participantId });

    expect(getData().endReason).toBe(CallEndReason.completed);
  });

  it('main branch: a PRE-answer leave still resolves to missed regardless of endReasonHint', async () => {
    const callId = 'call-hint-3';
    const participantId = 'part-1';
    const userId = 'user-1';

    const callParticipantRow = { id: 'cp-1', callSessionId: callId, participantId, leftAt: null };
    prisma.callParticipant.findFirst.mockResolvedValue(callParticipantRow);
    prisma.callSession.findUnique
      .mockResolvedValueOnce({
        id: callId,
        conversationId: 'conv-1',
        status: CallStatus.ringing,
        startedAt: new Date(Date.now() - 20_000),
        answeredAt: null,
        endedAt: null,
        version: 1,
        participants: [callParticipantRow],
        metadata: null,
      })
      .mockResolvedValue({ id: callId, status: CallStatus.missed, participants: [] });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    const getData = captureTerminalWrite();

    await service.leaveCall({ callId, userId, participantId, endReasonHint: CallEndReason.connectionLost });

    expect(getData().status).toBe(CallStatus.missed);
    expect(getData().endReason).toBe(CallEndReason.missed);
  });

  it('idempotent-leave branch: endReasonHint connectionLost is honoured on the force-end path too', async () => {
    const callId = 'call-hint-idem-1';
    const participantId = 'part-missing';
    const userId = 'user-1';

    prisma.callParticipant.findFirst.mockResolvedValue(null);
    prisma.callSession.findUnique
      .mockResolvedValueOnce({
        id: callId,
        conversationId: 'conv-direct',
        status: CallStatus.active,
        startedAt: new Date(Date.now() - 30_000),
        answeredAt: new Date(Date.now() - 15_000),
        endedAt: null,
        version: 1,
        participants: [],
        metadata: null,
      })
      .mockResolvedValue({ id: callId, status: CallStatus.ended, endedAt: new Date(), participants: [] });
    prisma.conversation.findUnique.mockResolvedValue({ type: 'direct' });
    const getData = captureTerminalWrite();

    await service.leaveCall({ callId, userId, participantId, endReasonHint: CallEndReason.connectionLost });

    expect(getData().endReason).toBe(CallEndReason.connectionLost);
  });
});
