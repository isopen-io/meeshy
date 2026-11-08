package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFailureReasonTest {

    @Test
    fun `every reason round-trips through its token`() {
        CallFailureReason.entries.forEach { assertThat(CallFailureReason.classify(it.token)).isEqualTo(it) }
    }

    @Test
    fun `the historic machine messages keep their precise reason`() {
        assertThat(CallFailureReason.classify("call:initiate timed out")).isEqualTo(CallFailureReason.InitiateTimedOut)
        assertThat(CallFailureReason.classify("connect timed out")).isEqualTo(CallFailureReason.ConnectTimedOut)
    }

    @Test
    fun `an unknown or missing message degrades to the generic reason`() {
        assertThat(CallFailureReason.classify("Call error")).isEqualTo(CallFailureReason.Unknown)
        assertThat(CallFailureReason.classify(null)).isEqualTo(CallFailureReason.Unknown)
    }
}
