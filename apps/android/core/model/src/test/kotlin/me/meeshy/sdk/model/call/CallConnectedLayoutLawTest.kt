package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallConnectedLayoutLawTest {

    @Test
    fun `a connected call shows the connected layout`() {
        assertThat(CallConnectedLayoutLaw.showsConnectedLayout(CallState.Connected, hasEstablishedMedia = true)).isTrue()
    }

    @Test
    fun `a reconnection after established media keeps the connected layout`() {
        assertThat(CallConnectedLayoutLaw.showsConnectedLayout(CallState.Reconnecting(1), hasEstablishedMedia = true)).isTrue()
    }

    @Test
    fun `a reconnection before any media falls back to the connection screen`() {
        assertThat(CallConnectedLayoutLaw.showsConnectedLayout(CallState.Reconnecting(1), hasEstablishedMedia = false)).isFalse()
    }

    @Test
    fun `ringing connecting and ended never show the connected layout`() {
        listOf(
            CallState.Idle, CallState.Ringing(true), CallState.Ringing(false), CallState.Offering,
            CallState.Connecting, CallState.Ended(CallEndReason.Local),
        ).forEach { assertThat(CallConnectedLayoutLaw.showsConnectedLayout(it, hasEstablishedMedia = true)).isFalse() }
    }
}
