package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13725 — the captions gate is read again during the call: on a tap of « Sous-titres » while the regime could
 * not be read, and when the conversation's regime changes. A new read never opens what end to end closed, and a
 * read that fails never closes what a clear regime opened (fail-closed stays the rule only where nothing is known).
 */
class CallCaptionsGateReadingTest {

    @Test
    fun `an unresolved gate takes whatever the new read says`() {
        assertThat(CallCaptionsGate.Unresolved.reading("conv", isEndToEnd = false)).isEqualTo(CallCaptionsGate.Open)
        assertThat(CallCaptionsGate.Unresolved.reading("conv", isEndToEnd = true)).isEqualTo(CallCaptionsGate.EndToEnd)
        assertThat(CallCaptionsGate.Unresolved.reading("conv", isEndToEnd = null)).isEqualTo(CallCaptionsGate.Unresolved)
        assertThat(CallCaptionsGate.Unresolved.reading("", isEndToEnd = false)).isEqualTo(CallCaptionsGate.Unresolved)
    }

    @Test
    fun `end to end never reopens, whatever is read afterwards (#12949)`() {
        assertThat(CallCaptionsGate.EndToEnd.reading("conv", isEndToEnd = false)).isEqualTo(CallCaptionsGate.EndToEnd)
        assertThat(CallCaptionsGate.EndToEnd.reading("conv", isEndToEnd = null)).isEqualTo(CallCaptionsGate.EndToEnd)
    }

    @Test
    fun `an open gate closes when the conversation is read sealed, never on a failed read`() {
        assertThat(CallCaptionsGate.Open.reading("conv", isEndToEnd = true)).isEqualTo(CallCaptionsGate.EndToEnd)
        assertThat(CallCaptionsGate.Open.reading("conv", isEndToEnd = null)).isEqualTo(CallCaptionsGate.Open)
        assertThat(CallCaptionsGate.Open.reading("conv", isEndToEnd = false)).isEqualTo(CallCaptionsGate.Open)
    }

    @Test
    fun `only an unresolved gate is worth reading again on a tap`() {
        assertThat(CallCaptionsGate.Unresolved.readsAgainOnTap).isTrue()
        assertThat(CallCaptionsGate.EndToEnd.readsAgainOnTap).isFalse()
        assertThat(CallCaptionsGate.Open.readsAgainOnTap).isFalse()
    }
}
