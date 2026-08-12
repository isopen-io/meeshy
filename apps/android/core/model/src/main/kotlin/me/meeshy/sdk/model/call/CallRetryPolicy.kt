package me.meeshy.sdk.model.call

/**
 * Pure decision: which [CallEndReason]s warrant a « Réessayer » (retry)
 * affordance. Only TRANSIENT establishment/drop failures — a retry genuinely
 * recovers those (prod 2026-07-12: ~16% of calls end in Failed/ConnectionLost,
 * commonly transient ICE-gathering / TURN-allocation hiccups). Normal outcomes
 * (Local/Remote hangup, Missed, Rejected) are never retried.
 *
 * Parité web `isRetryableCallFailure` (apps/web/lib/calls/call-retry-policy.ts)
 * and the reliability aggregate's failure set — one rule, three platforms.
 */
object CallRetryPolicy {
    fun isRetryable(reason: CallEndReason?): Boolean = when (reason) {
        is CallEndReason.Failed, CallEndReason.ConnectionLost -> true
        else -> false
    }
}
