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
    conversation: (id: string) => `conversation:${id}`
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
  $transaction: jest.fn() as MockFn
});

const createMockCallService = (hasData = true) => ({
  getStaleHeartbeats: jest.fn() as MockFn,
  clearHeartbeats: jest.fn() as MockFn,
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
    it('DB fallback: force-ends when no in-memory data and all participants have stale DB lastHeartbeatAt', async () => {
      const noMemoryCallService = createMockCallService(false);
      const service = new CallCleanupService(prisma as any, noMemoryCallService as any);

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
      const service = new CallCleanupService(prisma as any, noMemoryCallService as any);

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

      expect(io.to).toHaveBeenCalledWith('call:call-bc1');
      expect(io.to).toHaveBeenCalledWith('conversation:conv-bc1');
      expect(io.emit).toHaveBeenCalledWith('call:ended', expect.objectContaining({ callId: 'call-bc1' }));
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

      // Called once (call room only), NOT twice
      const convRoomCalls = (io.to as MockFn).mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).startsWith('conversation:')
      );
      expect(convRoomCalls.length).toBe(0);
      expect(io.to).toHaveBeenCalledWith('call:call-bc2');
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

      // only call room, no conversation room
      const convRoomCalls = (io.to as MockFn).mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).startsWith('conversation:')
      );
      expect(convRoomCalls.length).toBe(0);
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
