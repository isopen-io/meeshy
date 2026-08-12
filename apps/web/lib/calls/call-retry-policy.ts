/**
 * Pure decision: which call end reasons warrant a « Réessayer » (retry)
 * affordance. Only TRANSIENT establishment/drop failures — a retry genuinely
 * recovers those (prod 2026-07-12: ~16% of calls end in failed/connectionLost,
 * commonly transient ICE-gathering / TURN-allocation hiccups). Normal outcomes
 * (completed/missed/rejected) and server-side death (heartbeatTimeout/
 * garbageCollected) are never retried — a retry there would be surprising
 * (declined) or futile (the peer's side is gone).
 */

import type { CallEndReason } from '@meeshy/shared/types/video-call';

const RETRYABLE: ReadonlySet<CallEndReason> = new Set<CallEndReason>([
  'failed',
  'connectionLost',
]);

export function isRetryableCallFailure(reason: CallEndReason | null | undefined): boolean {
  return reason != null && RETRYABLE.has(reason);
}
