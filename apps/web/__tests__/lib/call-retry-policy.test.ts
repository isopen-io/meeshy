/**
 * Pure decision: which call end reasons warrant offering a « Réessayer »
 * (retry) affordance. Only TRANSIENT establishment/drop failures — a retry
 * genuinely recovers those (prod 2026-07-12: ~16% of calls end in
 * failed/connectionLost, often transient ICE/TURN hiccups). Normal outcomes
 * (completed/missed/rejected) and server-side death (heartbeatTimeout/
 * garbageCollected) are NOT retried.
 */

import { isRetryableCallFailure } from '@/lib/calls/call-retry-policy';

describe('isRetryableCallFailure', () => {
  it('offers retry for transient connection failures', () => {
    expect(isRetryableCallFailure('failed')).toBe(true);
    expect(isRetryableCallFailure('connectionLost')).toBe(true);
  });

  it('does NOT offer retry for normal outcomes', () => {
    expect(isRetryableCallFailure('completed')).toBe(false);
    expect(isRetryableCallFailure('missed')).toBe(false);
    expect(isRetryableCallFailure('rejected')).toBe(false);
  });

  it('does NOT offer retry for server-side death', () => {
    expect(isRetryableCallFailure('heartbeatTimeout')).toBe(false);
    expect(isRetryableCallFailure('garbageCollected')).toBe(false);
  });

  it('does NOT offer retry for a null / unknown reason', () => {
    expect(isRetryableCallFailure(null)).toBe(false);
    expect(isRetryableCallFailure(undefined)).toBe(false);
  });
});
