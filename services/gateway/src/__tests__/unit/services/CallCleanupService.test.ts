/**
 * CallCleanupService Unit Tests
 *
 * Verifies the GC logic that runs every 60 s to force-end zombie calls:
 * - initiated/ringing  > 120 s → MISSED
 * - connecting         > 90 s (since answeredAt) → FAILED
 * - active/reconnecting > 2 h  → ENDED (garbageCollected)
 * - heartbeat timeout (when callService present + stale ≥ total) → ENDED (heartbeatTimeout)
 * - forceEndCall: transaction + Socket.IO broadcast variants
 * - start/stop lifecycle (double-start guard, no-op stop)
 * - manualCleanup delegates to runCleanup
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_EVENTS: { ENDED: 'call:ended' }
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  ROOMS: {
    call: (id: string) => `call:${id}`,
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`
  }
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import { CallCleanupService } from '../../../services/CallCleanupService';
import { CallStatus, CallEndReason } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockFn = jest.Mock<any>;

const createMockPrisma = () => ({
  callSession: {
    findMany: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    updateMany: jest.fn() as MockFn
  },
  callParticipant: {
    updateMany: jest.fn() as MockFn
  },
  // Active-call claim release (see CallService.releaseActiveCallClaim); GC's
  // forceEndCall clears it directly since it isn't a CallService method.
  conversation: {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }) as MockFn
  },
  // Member lookup for the call:ended user-room fanout (resolveCallEndedRooms).
  participant: {
    findMany: jest.fn().mockResolvedValue([]) as MockFn
  },
  $transaction: jest.fn() as MockFn
});

const createMockCallService = (hasData = true) => ({
  getStaleHeartbeats: jest.fn() as MockFn,
  clearHeartbeats: jest.fn() as MockFn,
  clearRingingTimeout: jest.fn() as MockFn,
  hasHeartbeatData: jest.fn().mockReturnValue(hasData) as MockFn
});

const createMockIo = () => {
  const to = jest.fn().mockReturnThis() as MockFn;
  const emit = jest.fn() as MockFn;
  const mock = { to, emit } as any;
  // Make `to(...)` return an object with `emit`
  to.mockReturnValue({ emit });
  return mock;
};

/** Returns a fake call object with the given status and a startedAt old enough to trigger GC. */
const makeStaleCall = (
  status: string,
  startedAtMsAgo: number,
  id = 'call-stale-1'
) => ({
  id,
  status,
  startedAt: new Date(Date.now() - startedAtMsAgo),
  conversationId: 'conv-1'
});

/**
 * Sets up the $transaction mock to execute its callback. `updateManyCount`
 * controls how many rows `tx.callSession.updateMany` reports as matched —
 * 0 simulates the call having already transitioned away from the expected
 * `fromStatuses` (the race guard), matching the real conditional update.
 */
const setupTransactionPassthrough = (
  prisma: ReturnType<typeof createMockPrisma>,
  updateManyCount = 1
) => {
  prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
    const tx = {
      callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      callSession: { updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }) }
    };
    return cb(tx);
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallCleanupService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let callService: ReturnType<typeof createMockCallService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    prisma = createMockPrisma();
    callService = createMockCallService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // attachSocketServer
  // -------------------------------------------------------------------------
  describe('attachSocketServer', () => {
    it('stores the io reference (used by forceEndCall broadcast)', () => {
      const service = new CallCleanupService(prisma as any);
      const io = createMockIo();
      // Verify it doesn't throw and that subsequent runCleanup can use it
      expect(() => service.attachSocketServer(io)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // start / stop lifecycle
  // -------------------------------------------------------------------------
  describe('start', () => {
    it('calls runCleanup immediately on start', async () => {
      const service = new CallCleanupService(prisma as any);

      // All findMany return empty so runCleanup is a no-op
      prisma.callSession.findMany.mockResolvedValue([]);

      service.start();
      // Let the immediate runCleanup promise resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(prisma.callSession.findMany).toHaveBeenCalled();
    });

    it('does not reset interval on double-start (warns and returns)', async () => {
      const { logger } = await import('../../../utils/logger');
      const service = new CallCleanupService(prisma as any);
      prisma.callSession.findMany.mockResolvedValue([]);

      service.start();
      // Second start should warn and return immediately without launching another runCleanup
      service.start();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup job already running')
      );

      service.stop();
    });

    it('sets up a 60s interval that fires runCleanup repeatedly', async () => {
      const service = new CallCleanupService(prisma as any);
      prisma.callSession.findMany.mockResolvedValue([]);

      service.start();
      await Promise.resolve();

      const initialCalls = (prisma.callSession.findMany as MockFn).mock.calls.length;

      // Advance 60 s → interval fires
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();

      expect((prisma.callSession.findMany as MockFn).mock.calls.length).toBeGreaterThan(initialCalls);

      service.stop();
    });

    it('logs error when initial runCleanup throws (start catch handler)', async () => {
      const { logger } = await import('../../../utils/logger');
      const service = new CallCleanupService(prisma as any);

      // Make all findMany throw so runCleanup rejects
      prisma.callSession.findMany.mockRejectedValue(new Error('initial cleanup DB error'));

      service.start();
      // Let the promise rejection propagate through the .catch handler
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Initial cleanup failed'),
        expect.objectContaining({ error: expect.any(Error) })
      );

      service.stop();
    });

    it('logs error when scheduled runCleanup throws (interval catch handler)', async () => {
      const { logger } = await import('../../../utils/logger');
      const service = new CallCleanupService(prisma as any);

      // Initial call succeeds, interval call fails
      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockRejectedValue(new Error('scheduled cleanup DB error'));

      service.start();
      // Let initial runCleanup complete
      await Promise.resolve();
      await Promise.resolve();

      // Trigger the interval
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled cleanup failed'),
        expect.objectContaining({ error: expect.any(Error) })
      );

      service.stop();
    });
  });

  describe('stop', () => {
    it('clears interval on stop so no more cleanup runs', () => {
      const service = new CallCleanupService(prisma as any);
      prisma.callSession.findMany.mockResolvedValue([]);

      service.start();
      service.stop();

      // After stop, the cleanupInterval should be null
      expect((service as any).cleanupInterval).toBeNull();
    });

    it('is a no-op when not started', () => {
      const service = new CallCleanupService(prisma as any);
      expect(() => service.stop()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // runCleanup — the core GC logic
  // -------------------------------------------------------------------------
  describe('runCleanup', () => {
    it('returns {cleaned:0, errors:0} when DB is empty', async () => {
      const service = new CallCleanupService(prisma as any);
      prisma.callSession.findMany.mockResolvedValue([]);

      const result = await service.runCleanup();

      expect(result).toEqual({ cleaned: 0, errors: 0 });
    });

    it('audit C5: heartbeat tier fetches participants matching leftAt null OR unset (Mongo missing-field docs)', async () => {
      const service = new CallCleanupService(prisma as any, callService as any);
      prisma.callSession.findMany.mockResolvedValue([]);

      await service.runCleanup();

      expect(prisma.callSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            participants: {
              where: { OR: [{ leftAt: null }, { leftAt: { isSet: false } }] }
            }
          }
        })
      );
    });

    it('audit C5: forceEndCall stamps leftAt on participants matching leftAt null OR unset', async () => {
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.initiated, 130_000);

      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });

      const txParticipantUpdateMany = jest.fn().mockResolvedValue({ count: 1 }) as MockFn;
      prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          callParticipant: { updateMany: txParticipantUpdateMany },
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
        };
        return cb(tx);
      });

      await service.runCleanup();

      expect(txParticipantUpdateMany).toHaveBeenCalledWith({
        where: {
          callSessionId: staleCall.id,
          OR: [{ leftAt: null }, { leftAt: { isSet: false } }]
        },
        data: { leftAt: expect.any(Date) }
      });
    });

    it('forceEndCall bumps CallSession.version on the terminal write (so a concurrent version-guarded writer no-ops)', async () => {
      // endCall()/leaveCall()/updateCallStatus() all guard their terminal
      // write with `where: { version: call.version }` and bump `version` on
      // success — the invariant that makes a losing writer's update a no-op
      // instead of clobbering the winner's endedAt/duration/endReason.
      // forceEndCall's own guard is status-scoped (it reaps rows the client
      // may have already resolved moments ago), but it must ALSO bump
      // version: otherwise a version-guarded writer that read the row just
      // before this GC write still matches its stale `version` and overwrites
      // the GC-assigned terminal state right after.
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.initiated, 130_000);

      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });

      const txCallSessionUpdateMany = jest.fn().mockResolvedValue({ count: 1 }) as MockFn;
      prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          callSession: { updateMany: txCallSessionUpdateMany }
        };
        return cb(tx);
      });

      await service.runCleanup();

      expect(txCallSessionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: { increment: 1 } })
        })
      );
    });

    it('force-MISSED a stale initiated call (>120s) → cleaned:1', async () => {
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.initiated, 90_000);

      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall]) // tier 1: initiated/ringing
        .mockResolvedValueOnce([])          // tier 2: connecting
        .mockResolvedValueOnce([]);          // tier 3: active/reconnecting

      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('force-FAILED a stale connecting call (>30s) → cleaned:1', async () => {
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.connecting, 45_000, 'call-connecting');

      prisma.callSession.findMany
        .mockResolvedValueOnce([])          // tier 1
        .mockResolvedValueOnce([staleCall]) // tier 2: connecting
        .mockResolvedValueOnce([]);          // tier 3

      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('tier 1 (initiated/ringing) cutoff is 120s from startedAt', async () => {
      const service = new CallCleanupService(prisma as any);

      prisma.callSession.findMany
        .mockResolvedValueOnce([]) // tier 1
        .mockResolvedValueOnce([]) // tier 2
        .mockResolvedValueOnce([]); // tier 3

      const before = Date.now();
      await service.runCleanup();
      const after = Date.now();

      const tier1Where = prisma.callSession.findMany.mock.calls[0][0].where;
      expect(tier1Where.status).toEqual({ in: expect.arrayContaining(['initiated', 'ringing']) });
      expect(tier1Where.startedAt).toBeDefined();

      // Cutoff must be ~120s in the past (VoIP push + user-answer latency budget).
      const cutoff = tier1Where.startedAt.lt.getTime();
      expect(before - cutoff).toBeGreaterThanOrEqual(120_000);
      expect(after - cutoff).toBeLessThanOrEqual(120_000 + 1_000);
    });

    it('tier 2 (connecting) is anchored on answeredAt with a 90s budget, not startedAt', async () => {
      const service = new CallCleanupService(prisma as any);

      prisma.callSession.findMany
        .mockResolvedValueOnce([]) // tier 1
        .mockResolvedValueOnce([]) // tier 2: connecting
        .mockResolvedValueOnce([]); // tier 3

      const before = Date.now();
      await service.runCleanup();
      const after = Date.now();

      // The connecting tier is the 2nd findMany call.
      const tier2Where = prisma.callSession.findMany.mock.calls[1][0].where;
      expect(tier2Where.status).toBe(CallStatus.connecting);
      // Must filter on answeredAt (entry into connecting), never startedAt —
      // otherwise a late-answered call gets force-FAILED mid-handshake.
      expect(tier2Where.answeredAt).toBeDefined();
      expect(tier2Where.startedAt).toBeUndefined();

      // Cutoff must be ~90s in the past (the cellular/TURN-tolerant budget).
      const cutoff = tier2Where.answeredAt.lt.getTime();
      expect(before - cutoff).toBeGreaterThanOrEqual(90_000);
      expect(after - cutoff).toBeLessThanOrEqual(90_000 + 1_000);
    });

    it('force-GC-ENDED a stale active call (>2h) → cleaned:1', async () => {
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.active, 3 * 60 * 60 * 1000, 'call-active');

      prisma.callSession.findMany
        .mockResolvedValueOnce([])          // tier 1
        .mockResolvedValueOnce([])          // tier 2
        .mockResolvedValueOnce([staleCall]); // tier 3: active/reconnecting

      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
    });

    // Tier-3 liveness guard — a multi-hour call whose participants still beat
    // must NEVER be reaped by the wall-clock cap. The 2h cap only applies to
    // rows with no fresh liveness (orphans, dead clients, or no CallService).
    describe('tier 3 liveness guard (multi-hour calls)', () => {
      const threeHoursMs = 3 * 60 * 60 * 1000;
      const makeLongCall = (participants: unknown[], id = 'call-long') => ({
        ...makeStaleCall(CallStatus.active, threeHoursMs, id),
        participants
      });

      it('spares an active call >2h whose in-memory heartbeats are fresh', async () => {
        const service = new CallCleanupService(prisma as any, callService as any);
        const longCall = makeLongCall([{ id: 'p-1', leftAt: null }]);

        prisma.callSession.findMany
          .mockResolvedValueOnce([])          // tier 1
          .mockResolvedValueOnce([])          // tier 2
          .mockResolvedValueOnce([longCall])  // tier 3
          .mockResolvedValueOnce([]);         // heartbeat tier
        callService.hasHeartbeatData.mockReturnValue(true);
        callService.getStaleHeartbeats.mockReturnValue([]); // everyone fresh

        const result = await service.runCleanup();

        expect(result.cleaned).toBe(0);
        expect(result.errors).toBe(0);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('still GCs an active call >2h when ALL in-memory heartbeats are stale', async () => {
        const service = new CallCleanupService(prisma as any, callService as any);
        const longCall = makeLongCall([{ id: 'p-1', leftAt: null }], 'call-long-stale');

        prisma.callSession.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([longCall])
          .mockResolvedValueOnce([]);
        callService.hasHeartbeatData.mockReturnValue(true);
        callService.getStaleHeartbeats.mockReturnValue(['p-1']); // 1 stale >= 1 total

        prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
        setupTransactionPassthrough(prisma);

        const result = await service.runCleanup();

        expect(result.cleaned).toBe(1);
        expect(result.errors).toBe(0);
      });

      it('still GCs an orphaned active call >2h with zero live participants', async () => {
        const service = new CallCleanupService(prisma as any, callService as any);
        const orphan = makeLongCall([], 'call-long-orphan');

        prisma.callSession.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([orphan])
          .mockResolvedValueOnce([]);
        callService.hasHeartbeatData.mockReturnValue(false);

        prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
        setupTransactionPassthrough(prisma);

        const result = await service.runCleanup();

        expect(result.cleaned).toBe(1);
        expect(result.errors).toBe(0);
      });

      it('spares an active call >2h via the DB fallback when lastHeartbeatAt is fresh', async () => {
        // bootedAt is old so the boot-floor grace period cannot mask the check.
        const oldBoot = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const service = new CallCleanupService(prisma as any, callService as any, oldBoot);
        const longCall = makeLongCall(
          [{ id: 'p-1', leftAt: null, lastHeartbeatAt: new Date(), joinedAt: new Date(Date.now() - threeHoursMs) }],
          'call-long-db-fresh'
        );

        prisma.callSession.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([longCall])
          .mockResolvedValueOnce([]);
        callService.hasHeartbeatData.mockReturnValue(false); // post-restart

        const result = await service.runCleanup();

        expect(result.cleaned).toBe(0);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('still GCs >2h via the DB fallback when every lastHeartbeatAt is stale', async () => {
        const oldBoot = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const service = new CallCleanupService(prisma as any, callService as any, oldBoot);
        const stale = new Date(Date.now() - 10 * 60 * 1000);
        const longCall = makeLongCall(
          [{ id: 'p-1', leftAt: null, lastHeartbeatAt: stale, joinedAt: new Date(Date.now() - threeHoursMs) }],
          'call-long-db-stale'
        );

        prisma.callSession.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([longCall])
          .mockResolvedValueOnce([]);
        callService.hasHeartbeatData.mockReturnValue(false);

        prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
        setupTransactionPassthrough(prisma);

        const result = await service.runCleanup();

        expect(result.cleaned).toBe(1);
        expect(result.errors).toBe(0);
      });
    });

    it('counts errors when forceEndCall throws on tier 1 (initiated) → errors:1', async () => {
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.initiated, 90_000);

      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // findUnique succeeds but $transaction throws
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
      prisma.$transaction.mockRejectedValue(new Error('DB write failed'));

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(1);
    });

    it('counts errors when forceEndCall throws on tier 2 (connecting) → errors:1', async () => {
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.connecting, 45_000, 'call-conn-err');

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([]);

      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
      prisma.$transaction.mockRejectedValue(new Error('tier2 fail'));

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(1);
    });

    it('counts errors when forceEndCall throws on tier 3 (active GC) → errors:1', async () => {
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.active, 3 * 60 * 60 * 1000, 'call-gc-err');

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([staleCall]);

      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
      prisma.$transaction.mockRejectedValue(new Error('tier3 fail'));

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(1);
    });

    it('heartbeat timeout: force-ends when all participants stale and callService present', async () => {
      const service = new CallCleanupService(prisma as any, callService as any);
      const participant = { id: 'p-1', leftAt: null };
      const activeCall = {
        id: 'call-hb',
        startedAt: new Date(Date.now() - 10_000),
        conversationId: 'conv-hb',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([]) // tier 1
        .mockResolvedValueOnce([]) // tier 2
        .mockResolvedValueOnce([]) // tier 3
        .mockResolvedValueOnce([activeCall]); // heartbeat tier

      callService.getStaleHeartbeats.mockReturnValue(['p-1']); // 1 stale >= 1 total
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-hb' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      expect(callService.clearHeartbeats).toHaveBeenCalledWith('call-hb');
    });

    it('heartbeat timeout: does NOT force-end when stale < total participants', async () => {
      const service = new CallCleanupService(prisma as any, callService as any);
      const p1 = { id: 'p-1', leftAt: null };
      const p2 = { id: 'p-2', leftAt: null };
      const activeCall = {
        id: 'call-hb2',
        startedAt: new Date(Date.now() - 10_000),
        conversationId: 'conv-hb2',
        participants: [p1, p2]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([activeCall]);

      callService.getStaleHeartbeats.mockReturnValue(['p-1']); // 1 stale < 2 total

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('heartbeat timeout: setCallService() after construction activates the tier (RC-4 wiring)', async () => {
      // Mirrors production: server.ts constructs CallCleanupService before
      // MeeshySocketIOManager exists, then wires the shared CallService in
      // once the socket layer is up via setCallService().
      const service = new CallCleanupService(prisma as any);
      service.setCallService(callService as any);
      const participant = { id: 'p-1', leftAt: null };
      const activeCall = {
        id: 'call-hb-late',
        startedAt: new Date(Date.now() - 10_000),
        conversationId: 'conv-hb-late',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([]) // tier 1
        .mockResolvedValueOnce([]) // tier 2
        .mockResolvedValueOnce([]) // tier 3
        .mockResolvedValueOnce([activeCall]); // heartbeat tier

      callService.getStaleHeartbeats.mockReturnValue(['p-1']); // 1 stale >= 1 total
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-hb-late' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      expect(callService.clearHeartbeats).toHaveBeenCalledWith('call-hb-late');
    });

    it('skips heartbeat tier entirely when callService is not provided', async () => {
      // No callService — heartbeat check should be skipped
      const service = new CallCleanupService(prisma as any);

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      // findMany should have been called exactly 3 times (tiers 1-3), not 4
      expect(prisma.callSession.findMany).toHaveBeenCalledTimes(3);
    });

    it('heartbeat errors counted in errors when forceEndCall throws', async () => {
      const service = new CallCleanupService(prisma as any, callService as any);
      const participant = { id: 'p-1', leftAt: null };
      const activeCall = {
        id: 'call-hb-err',
        startedAt: new Date(),
        conversationId: 'conv-err',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([activeCall]);

      callService.getStaleHeartbeats.mockReturnValue(['p-1']);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-err' });
      prisma.$transaction.mockRejectedValue(new Error('heartbeat tx fail'));

      const result = await service.runCleanup();

      expect(result.errors).toBe(1);
    });

    // DB-fallback tests (post-restart recovery)
    it('DB fallback: force-ends when boot grace has elapsed and all participants have stale DB lastHeartbeatAt', async () => {
      const noMemoryCallService = createMockCallService(false);
      // Booted 10 min ago — well past the 120s boot grace window.
      const service = new CallCleanupService(
        prisma as any, noMemoryCallService as any, new Date(Date.now() - 600_000)
      );

      const staleTs = new Date(Date.now() - 130_000); // 130s ago — older than 120s timeout
      const participant = { id: 'p-1', participantId: 'part-1', leftAt: null, lastHeartbeatAt: staleTs };
      const activeCall = {
        id: 'call-db-stale',
        startedAt: new Date(Date.now() - 10_000),
        conversationId: 'conv-db',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([]) // tier 1
        .mockResolvedValueOnce([]) // tier 2
        .mockResolvedValueOnce([]) // tier 3
        .mockResolvedValueOnce([activeCall]); // heartbeat tier

      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-db' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      expect(noMemoryCallService.getStaleHeartbeats).not.toHaveBeenCalled();
    });

    it('DB fallback: does NOT force-end when no in-memory data but DB lastHeartbeatAt is fresh', async () => {
      const noMemoryCallService = createMockCallService(false);
      const service = new CallCleanupService(prisma as any, noMemoryCallService as any);

      const freshTs = new Date(Date.now() - 10_000); // 10s ago — within 120s timeout
      const participant = { id: 'p-1', participantId: 'part-1', leftAt: null, lastHeartbeatAt: freshTs };
      const activeCall = {
        id: 'call-db-fresh',
        startedAt: new Date(Date.now() - 10_000),
        conversationId: 'conv-db-fresh',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([activeCall]);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('DB fallback: force-ends when no in-memory data, lastHeartbeatAt is null, and the participant joined long ago (genuine zombie)', async () => {
      const noMemoryCallService = createMockCallService(false);
      // Booted 10 min ago — well past the 120s boot grace window.
      const service = new CallCleanupService(
        prisma as any, noMemoryCallService as any, new Date(Date.now() - 600_000)
      );

      // Joined 130s ago (older than the 120s timeout) and never got a heartbeat
      // persisted — a real zombie, not a just-restarted-gateway false positive.
      const participant = {
        id: 'p-1', participantId: 'part-1', leftAt: null,
        lastHeartbeatAt: null, joinedAt: new Date(Date.now() - 130_000)
      };
      const activeCall = {
        id: 'call-db-null',
        startedAt: new Date(Date.now() - 130_000),
        conversationId: 'conv-db-null',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([activeCall]);

      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-db-null' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
    });

    it('DB fallback: does NOT force-end when lastHeartbeatAt is null but the participant joined recently (gateway-restart false-positive guard)', async () => {
      const noMemoryCallService = createMockCallService(false);
      const service = new CallCleanupService(prisma as any, noMemoryCallService as any);

      // Call started 10s ago — well within the 120s timeout — and the gateway
      // just restarted so no in-memory heartbeat exists yet and the 30s debounce
      // hasn't flushed lastHeartbeatAt to the DB. This must NOT be GC'd.
      const participant = {
        id: 'p-1', participantId: 'part-1', leftAt: null,
        lastHeartbeatAt: null, joinedAt: new Date(Date.now() - 10_000)
      };
      const activeCall = {
        id: 'call-db-fresh-join',
        startedAt: new Date(Date.now() - 10_000),
        conversationId: 'conv-db-fresh-join',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([activeCall]);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('DB fallback: does NOT force-end right after boot even when every DB lastHeartbeatAt is stale (boot grace — heartbeats were impossible while the gateway was down)', async () => {
      const noMemoryCallService = createMockCallService(false);
      // Default construction — bootedAt = now, i.e. the gateway just restarted.
      const service = new CallCleanupService(prisma as any, noMemoryCallService as any);

      // Gateway was down for 10 minutes: every heartbeat timestamp is ancient,
      // but the clients are alive (P2P media survived) and will re-join within
      // seconds. This call must NOT be reaped on the first post-boot tick.
      const participant = {
        id: 'p-1', participantId: 'part-1', leftAt: null,
        lastHeartbeatAt: new Date(Date.now() - 600_000),
        joinedAt: new Date(Date.now() - 900_000)
      };
      const activeCall = {
        id: 'call-boot-grace',
        startedAt: new Date(Date.now() - 900_000),
        conversationId: 'conv-boot-grace',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([]) // tier 1
        .mockResolvedValueOnce([]) // tier 2
        .mockResolvedValueOnce([]) // tier 3
        .mockResolvedValueOnce([activeCall]); // heartbeat tier

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('DB fallback: reaps the call once the boot grace elapsed with still no heartbeat resumption', async () => {
      const noMemoryCallService = createMockCallService(false);
      // Booted 130s ago (> 120s grace) and nobody resumed heartbeats since.
      const service = new CallCleanupService(
        prisma as any, noMemoryCallService as any, new Date(Date.now() - 130_000)
      );

      const participant = {
        id: 'p-1', participantId: 'part-1', leftAt: null,
        lastHeartbeatAt: new Date(Date.now() - 600_000),
        joinedAt: new Date(Date.now() - 900_000)
      };
      const activeCall = {
        id: 'call-boot-grace-expired',
        startedAt: new Date(Date.now() - 900_000),
        conversationId: 'conv-boot-grace-expired',
        participants: [participant]
      };

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([activeCall]);

      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-boot-grace-expired' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
    });

    it('forceEndCall clears the ringing timer alongside heartbeats (item I)', async () => {
      const service = new CallCleanupService(prisma as any, callService as any);
      const staleCall = makeStaleCall(CallStatus.initiated, 130_000);
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall]) // tier 1 reaps it
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      expect(callService.clearHeartbeats).toHaveBeenCalledWith('call-stale-1');
      expect(callService.clearRingingTimeout).toHaveBeenCalledWith('call-stale-1');
    });
  });

  // -------------------------------------------------------------------------
  // forceEndCall — race guard (call already transitioned before the write)
  // -------------------------------------------------------------------------
  describe('forceEndCall — race guard', () => {
    it('does not count a call as cleaned when it already left the expected fromStatuses before the write', async () => {
      const service = new CallCleanupService(prisma as any);
      // Snapshot found it stale/initiated, but by write time a client-driven
      // `call:end` already moved it to `ended` — updateMany matches 0 rows.
      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-race');

      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-race' });
      setupTransactionPassthrough(prisma, 0); // 0 rows matched — already transitioned

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('does not touch callParticipant or broadcast call:ended when the race guard skips the write', async () => {
      const io = createMockIo();
      const service = new CallCleanupService(prisma as any);
      service.attachSocketServer(io);
      const staleCall = makeStaleCall(CallStatus.connecting, 100_000, 'call-race-2');

      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-race-2' });

      let capturedTx: any;
      prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        capturedTx = {
          callParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          callSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
        };
        return cb(capturedTx);
      });

      await service.runCleanup();

      expect(capturedTx.callParticipant.updateMany).not.toHaveBeenCalled();
      expect(io.emit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setPostSummaryCallback — P3: GC-ended calls must post the same
  // call-summary system message as every other terminal path.
  // -------------------------------------------------------------------------
  describe('setPostSummaryCallback', () => {
    it('invokes the callback with the callId when a call is force-ended', async () => {
      const service = new CallCleanupService(prisma as any);
      const postSummary = jest.fn().mockResolvedValue(undefined) as MockFn;
      service.setPostSummaryCallback(postSummary);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-summary-1');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-summary-1' });
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      expect(postSummary).toHaveBeenCalledWith('call-summary-1');
    });

    it('does not invoke the callback when the race guard skips the write (call already transitioned)', async () => {
      const service = new CallCleanupService(prisma as any);
      const postSummary = jest.fn().mockResolvedValue(undefined) as MockFn;
      service.setPostSummaryCallback(postSummary);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-summary-race');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-summary-race' });
      setupTransactionPassthrough(prisma, 0); // already transitioned — no write

      await service.runCleanup();

      expect(postSummary).not.toHaveBeenCalled();
    });

    it('does not throw when the callback rejects — GC must not break on a summary-posting failure', async () => {
      const service = new CallCleanupService(prisma as any);
      const postSummary = jest.fn().mockRejectedValue(new Error('broadcast down')) as MockFn;
      service.setPostSummaryCallback(postSummary);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-summary-fail');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-summary-fail' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('is a no-op (no crash) when no callback was registered', async () => {
      const service = new CallCleanupService(prisma as any);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-summary-none');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-summary-none' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // setMissedCallCancelPushCallback — phantom-ringing safety net: GC tier 1
  // (initiated/ringing > 120s → missed) must send the same `call_cancel`
  // background push as every other missed-call path, or a callee whose VoIP
  // push was delivered but whose socket never joined the call room keeps
  // ringing until its own client-side timeout.
  // -------------------------------------------------------------------------
  describe('setMissedCallCancelPushCallback', () => {
    it('invokes the callback with callId, conversationId and duration for a tier-1 missed force-end', async () => {
      const service = new CallCleanupService(prisma as any);
      const cancelPush = jest.fn().mockResolvedValue(undefined) as MockFn;
      service.setMissedCallCancelPushCallback(cancelPush);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-cancel-1');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-cancel-1' });
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      expect(cancelPush).toHaveBeenCalledWith('call-cancel-1', 'conv-cancel-1', expect.any(Number));
    });

    it('does not invoke the callback for a tier-2 (failed) force-end', async () => {
      const service = new CallCleanupService(prisma as any);
      const cancelPush = jest.fn().mockResolvedValue(undefined) as MockFn;
      service.setMissedCallCancelPushCallback(cancelPush);

      const staleConnecting = makeStaleCall(CallStatus.connecting, 100_000, 'call-cancel-2');
      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([staleConnecting])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-cancel-2' });
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      expect(cancelPush).not.toHaveBeenCalled();
    });

    it('does not invoke the callback for a tier-3 (garbageCollected) force-end', async () => {
      const service = new CallCleanupService(prisma as any);
      const cancelPush = jest.fn().mockResolvedValue(undefined) as MockFn;
      service.setMissedCallCancelPushCallback(cancelPush);

      const staleCall = makeStaleCall(CallStatus.active, 3 * 60 * 60 * 1000, 'call-cancel-3');
      prisma.callSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([staleCall]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-cancel-3' });
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      expect(cancelPush).not.toHaveBeenCalled();
    });

    it('does not invoke the callback when the race guard skips the write (call already transitioned)', async () => {
      const service = new CallCleanupService(prisma as any);
      const cancelPush = jest.fn().mockResolvedValue(undefined) as MockFn;
      service.setMissedCallCancelPushCallback(cancelPush);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-cancel-race');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-cancel-race' });
      setupTransactionPassthrough(prisma, 0); // already transitioned — no write

      await service.runCleanup();

      expect(cancelPush).not.toHaveBeenCalled();
    });

    it('does not throw and still counts the call as cleaned when the callback rejects', async () => {
      const service = new CallCleanupService(prisma as any);
      const cancelPush = jest.fn().mockRejectedValue(new Error('push failed')) as MockFn;
      service.setMissedCallCancelPushCallback(cancelPush);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-cancel-fail');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-cancel-fail' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('is a no-op (no crash) when no callback was registered', async () => {
      const service = new CallCleanupService(prisma as any);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-cancel-none');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-cancel-none' });
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // forceEndCall (tested indirectly via runCleanup)
  // -------------------------------------------------------------------------
  describe('forceEndCall — broadcast variants', () => {
    it('emits call:ended to call room and conversation room when io attached and conversationId exists', async () => {
      const io = createMockIo();
      const service = new CallCleanupService(prisma as any);
      service.attachSocketServer(io);

      const staleCall = makeStaleCall(CallStatus.initiated, 90_000, 'call-bc1');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-bc1' });
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      const rooms = (io.to as MockFn).mock.calls[0][0];
      expect(rooms).toEqual(expect.arrayContaining(['call:call-bc1', 'conversation:conv-bc1']));
      expect(io.emit).toHaveBeenCalledWith('call:ended', expect.objectContaining({ callId: 'call-bc1' }));
    });

    it('fans out call:ended to every conversation member user room (GC path must match the invitation audience — a ringing callee has joined neither the call nor conversation room)', async () => {
      const io = createMockIo();
      const service = new CallCleanupService(prisma as any);
      service.attachSocketServer(io);

      const staleCall = makeStaleCall(CallStatus.initiated, 130_000, 'call-fanout');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-fanout' });
      prisma.participant.findMany.mockResolvedValue([{ userId: 'caller-1' }, { userId: 'callee-1' }]);
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      expect(prisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ conversationId: 'conv-fanout' }) })
      );
      const rooms = (io.to as MockFn).mock.calls[0][0];
      expect(rooms).toEqual(
        expect.arrayContaining(['call:call-fanout', 'conversation:conv-fanout', 'user:caller-1', 'user:callee-1'])
      );
      // Single deduplicated multi-room emit, not one call per room.
      expect(io.to).toHaveBeenCalledTimes(1);
      expect(io.emit).toHaveBeenCalledTimes(1);
    });

    it('emits only to call room when conversationId is null', async () => {
      const io = createMockIo();
      const service = new CallCleanupService(prisma as any);
      service.attachSocketServer(io);

      const staleCall = makeStaleCall(CallStatus.initiated, 90_000, 'call-bc2');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: null });
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      const rooms = (io.to as MockFn).mock.calls[0][0];
      expect(rooms).toEqual(['call:call-bc2']);
    });

    it('emits only to call room when session.conversationId is undefined (findUnique returns null)', async () => {
      const io = createMockIo();
      const service = new CallCleanupService(prisma as any);
      service.attachSocketServer(io);

      const staleCall = makeStaleCall(CallStatus.initiated, 90_000, 'call-bc3');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      // findUnique returns null → session is null → session?.conversationId is undefined
      prisma.callSession.findUnique.mockResolvedValue(null);
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      const rooms = (io.to as MockFn).mock.calls[0][0];
      expect(rooms).toEqual(['call:call-bc3']);
    });

    it('falls back to call+conversation rooms (no crash) when the member fanout lookup throws', async () => {
      const io = createMockIo();
      const service = new CallCleanupService(prisma as any);
      service.attachSocketServer(io);

      const staleCall = makeStaleCall(CallStatus.initiated, 90_000, 'call-bc4');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-bc4' });
      prisma.participant.findMany.mockRejectedValue(new Error('member lookup DB error'));
      setupTransactionPassthrough(prisma);

      const result = await service.runCleanup();

      expect(result.cleaned).toBe(1);
      const rooms = (io.to as MockFn).mock.calls[0][0];
      expect(rooms).toEqual(['call:call-bc4', 'conversation:conv-bc4']);
    });

    it('logs warning instead of emitting when no io attached', async () => {
      const { logger } = await import('../../../utils/logger');
      const service = new CallCleanupService(prisma as any);
      // No attachSocketServer call

      const staleCall = makeStaleCall(CallStatus.initiated, 90_000, 'call-noio');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-noio' });
      setupTransactionPassthrough(prisma);

      await service.runCleanup();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No Socket.IO server'),
        expect.objectContaining({ callId: 'call-noio' })
      );
    });

    it('calls callService.clearHeartbeats after transaction when callService provided', async () => {
      const service = new CallCleanupService(prisma as any, callService as any);

      const staleCall = makeStaleCall(CallStatus.initiated, 90_000, 'call-hb-clear');
      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall]) // tier 1
        .mockResolvedValueOnce([])           // tier 2
        .mockResolvedValueOnce([])           // tier 3
        .mockResolvedValueOnce([]);          // tier 4 (heartbeat active calls)
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-hb-clear' });
      setupTransactionPassthrough(prisma);
      callService.getStaleHeartbeats.mockReturnValue([]);

      await service.runCleanup();

      // clearHeartbeats called from forceEndCall via tier 1 cleanup
      expect(callService.clearHeartbeats).toHaveBeenCalledWith('call-hb-clear');
    });
  });

  // -------------------------------------------------------------------------
  // manualCleanup
  // -------------------------------------------------------------------------
  describe('manualCleanup', () => {
    it('delegates to runCleanup and returns same result', async () => {
      const service = new CallCleanupService(prisma as any);
      prisma.callSession.findMany.mockResolvedValue([]);

      const result = await service.manualCleanup();

      expect(result).toEqual({ cleaned: 0, errors: 0 });
      expect(prisma.callSession.findMany).toHaveBeenCalled();
    });

    it('reports cleaned count from runCleanup via manualCleanup', async () => {
      const service = new CallCleanupService(prisma as any);
      const staleCall = makeStaleCall(CallStatus.initiated, 90_000);

      prisma.callSession.findMany
        .mockResolvedValueOnce([staleCall])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.callSession.findUnique.mockResolvedValue({ conversationId: 'conv-1' });
      setupTransactionPassthrough(prisma);

      const result = await service.manualCleanup();

      expect(result.cleaned).toBe(1);
    });
  });
});
