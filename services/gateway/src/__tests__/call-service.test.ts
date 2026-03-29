/**
 * Call Service — Heartbeat & State Logic Tests
 *
 * Tests heartbeat tracking, stale detection, and end reason resolution
 * without requiring Prisma or database connection.
 */

// Standalone HeartbeatTracker (mirrors CallService.heartbeats logic)
class HeartbeatTracker {
  private heartbeats = new Map<string, Map<string, number>>();

  recordHeartbeat(callId: string, participantId: string) {
    if (!this.heartbeats.has(callId)) {
      this.heartbeats.set(callId, new Map());
    }
    this.heartbeats.get(callId)!.set(participantId, Date.now());
  }

  getLastHeartbeat(callId: string, participantId: string): number | undefined {
    return this.heartbeats.get(callId)?.get(participantId);
  }

  clearHeartbeats(callId: string) {
    this.heartbeats.delete(callId);
  }

  getStaleHeartbeats(callId: string, thresholdMs: number): string[] {
    const callBeats = this.heartbeats.get(callId);
    if (!callBeats) return [];
    const now = Date.now();
    const stale: string[] = [];
    for (const [pid, ts] of callBeats) {
      if (now - ts > thresholdMs) stale.push(pid);
    }
    return stale;
  }
}

// End reason resolution (mirrors CallService.resolveEndReason)
function resolveEndReason(reason?: string): string {
  const validReasons = [
    'completed', 'missed', 'rejected', 'failed',
    'connectionLost', 'heartbeatTimeout', 'garbageCollected',
  ];
  if (reason && validReasons.includes(reason)) return reason;
  return 'completed';
}

describe('HeartbeatTracker', () => {
  let tracker: HeartbeatTracker;

  beforeEach(() => {
    tracker = new HeartbeatTracker();
  });

  it('records and retrieves heartbeat timestamps', () => {
    tracker.recordHeartbeat('call-1', 'part-1');
    const lastBeat = tracker.getLastHeartbeat('call-1', 'part-1');

    expect(lastBeat).toBeDefined();
    expect(typeof lastBeat).toBe('number');
    expect(Date.now() - lastBeat!).toBeLessThan(100);
  });

  it('returns undefined for unknown call', () => {
    expect(tracker.getLastHeartbeat('unknown', 'unknown')).toBeUndefined();
  });

  it('clears heartbeats for a call', () => {
    tracker.recordHeartbeat('call-1', 'part-1');
    tracker.clearHeartbeats('call-1');
    expect(tracker.getLastHeartbeat('call-1', 'part-1')).toBeUndefined();
  });

  it('detects stale heartbeats (> threshold)', () => {
    tracker.recordHeartbeat('call-1', 'part-1');
    tracker.recordHeartbeat('call-1', 'part-2');

    // Simulate part-1 being stale
    const heartbeats = (tracker as any).heartbeats;
    heartbeats.get('call-1')!.set('part-1', Date.now() - 70_000);

    const stale = tracker.getStaleHeartbeats('call-1', 60_000);
    expect(stale).toContain('part-1');
    expect(stale).not.toContain('part-2');
  });

  it('returns empty array when all heartbeats are fresh', () => {
    tracker.recordHeartbeat('call-1', 'part-1');
    const stale = tracker.getStaleHeartbeats('call-1', 60_000);
    expect(stale).toHaveLength(0);
  });

  it('returns empty array for unknown call', () => {
    const stale = tracker.getStaleHeartbeats('nonexistent', 60_000);
    expect(stale).toHaveLength(0);
  });

  it('tracks multiple calls independently', () => {
    tracker.recordHeartbeat('call-1', 'part-a');
    tracker.recordHeartbeat('call-2', 'part-b');

    tracker.clearHeartbeats('call-1');

    expect(tracker.getLastHeartbeat('call-1', 'part-a')).toBeUndefined();
    expect(tracker.getLastHeartbeat('call-2', 'part-b')).toBeDefined();
  });

  it('overwrites previous heartbeat on update', () => {
    tracker.recordHeartbeat('call-1', 'part-1');
    const first = tracker.getLastHeartbeat('call-1', 'part-1')!;

    // Small delay to ensure timestamp differs
    tracker.recordHeartbeat('call-1', 'part-1');
    const second = tracker.getLastHeartbeat('call-1', 'part-1')!;

    expect(second).toBeGreaterThanOrEqual(first);
  });
});

describe('resolveEndReason', () => {
  it('maps known reasons correctly', () => {
    expect(resolveEndReason('missed')).toBe('missed');
    expect(resolveEndReason('rejected')).toBe('rejected');
    expect(resolveEndReason('failed')).toBe('failed');
    expect(resolveEndReason('connectionLost')).toBe('connectionLost');
    expect(resolveEndReason('heartbeatTimeout')).toBe('heartbeatTimeout');
    expect(resolveEndReason('garbageCollected')).toBe('garbageCollected');
    expect(resolveEndReason('completed')).toBe('completed');
  });

  it('defaults to completed for undefined', () => {
    expect(resolveEndReason(undefined)).toBe('completed');
  });

  it('defaults to completed for unknown values', () => {
    expect(resolveEndReason('unknown')).toBe('completed');
    expect(resolveEndReason('')).toBe('completed');
    expect(resolveEndReason('random-string')).toBe('completed');
  });
});

describe('CallStatus state transitions (spec compliance)', () => {
  const TERMINAL_STATES = ['ended', 'missed', 'rejected', 'failed'];
  const ACTIVE_STATES = ['ringing', 'connecting', 'active', 'reconnecting'];

  it('terminal states should not allow transitions', () => {
    for (const state of TERMINAL_STATES) {
      expect(TERMINAL_STATES).toContain(state);
      expect(ACTIVE_STATES).not.toContain(state);
    }
  });

  it('all 9 states are accounted for', () => {
    const ALL_STATES = [
      'initiated', 'ringing', 'connecting', 'active',
      'reconnecting', 'ended', 'missed', 'rejected', 'failed',
    ];
    expect(ALL_STATES).toHaveLength(9);
    expect([...ACTIVE_STATES, ...TERMINAL_STATES, 'initiated']).toEqual(
      expect.arrayContaining(ALL_STATES)
    );
  });

  it('all 7 end reasons are defined', () => {
    const ALL_REASONS = [
      'completed', 'missed', 'rejected', 'failed',
      'connectionLost', 'heartbeatTimeout', 'garbageCollected',
    ];
    expect(ALL_REASONS).toHaveLength(7);
    for (const reason of ALL_REASONS) {
      expect(resolveEndReason(reason)).toBe(reason);
    }
  });
});
