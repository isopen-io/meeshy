package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [CallRetryPolicy] — the pure decision of which call end
 * reasons warrant a « Réessayer » (retry) affordance. Parité web
 * `isRetryableCallFailure` / same failure set as the reliability aggregate:
 * only TRANSIENT establishment/drop failures (a retry often recovers those,
 * prod 2026-07-12 ~16% of calls), never normal outcomes (local/remote hangup,
 * missed, rejected).
 */
class CallRetryPolicyTest {

    @Test
    fun `offers retry for transient connection failures`() {
        assertThat(CallRetryPolicy.isRetryable(CallEndReason.Failed("Couldn't establish the call connection"))).isTrue()
        assertThat(CallRetryPolicy.isRetryable(CallEndReason.ConnectionLost)).isTrue()
    }

    @Test
    fun `does not offer retry for normal outcomes`() {
        assertThat(CallRetryPolicy.isRetryable(CallEndReason.Local)).isFalse()
        assertThat(CallRetryPolicy.isRetryable(CallEndReason.Remote)).isFalse()
        assertThat(CallRetryPolicy.isRetryable(CallEndReason.Missed)).isFalse()
        assertThat(CallRetryPolicy.isRetryable(CallEndReason.Rejected)).isFalse()
    }

    @Test
    fun `a null reason is not retryable`() {
        assertThat(CallRetryPolicy.isRetryable(null)).isFalse()
    }
}
