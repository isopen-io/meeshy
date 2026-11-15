package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPreviewSignalTest {
    private fun envelope(callId: String, negotiationId: Int?) =
        CallSignalEnvelope(callId, CallSignalPayload(type = "offer", negotiationId = negotiationId))

    @Test
    fun `signal fields keep the base keys over caller fields`() {
        val fields = CallPreviewSignal("c", "answer", "me", "peer", 3, mapOf("sdp" to "v=0", "type" to "hijack")).signalFields()
        assertThat(fields["type"]).isEqualTo("answer")
        assertThat(fields["sdp"]).isEqualTo("v=0")
        assertThat(fields["negotiationId"]).isEqualTo(3)
    }

    @Test
    fun `a negotiation follows its call and is released at the end`() {
        val negotiating = CallPreviewLaw.onSignal(CallPreviewLaw.request("c"), envelope("c", 4))
        assertThat(negotiating).isEqualTo(CallPreviewState.Negotiating("c", 4))
        assertThat(CallPreviewLaw.onSignal(negotiating, envelope("other", 9))).isEqualTo(negotiating)
        assertThat(CallPreviewLaw.shouldRelease(negotiating, "c")).isTrue()
        assertThat(CallPreviewLaw.shouldRelease(negotiating, "other")).isFalse()
        assertThat(CallPreviewLaw.release(negotiating)).isEqualTo(CallPreviewState.Idle)
        assertThat(CallPreviewLaw.onSignal(CallPreviewState.Idle, envelope("c", 1))).isEqualTo(CallPreviewState.Idle)
    }
}
