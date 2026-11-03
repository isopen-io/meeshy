package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSignalRetryPolicyTest {
    @Test
    fun `the backoff starts at half a second and doubles`() {
        assertThat(CallSignalRetryPolicy.delayBeforeMs(1)).isEqualTo(0L)
        assertThat(CallSignalRetryPolicy.delayBeforeMs(2)).isEqualTo(500L)
        assertThat(CallSignalRetryPolicy.delayBeforeMs(3)).isEqualTo(1_000L)
        assertThat(CallSignalRetryPolicy.delayBeforeMs(4)).isEqualTo(2_000L)
    }

    @Test
    fun `iOS attempt budgets`() {
        assertThat(CallSignalRetryPolicy.OFFER_MAX_ATTEMPTS).isEqualTo(3)
        assertThat(CallSignalRetryPolicy.ANSWER_TOTAL_ATTEMPTS).isEqualTo(4)
    }
}
