package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallRingPlaybackLaw.Effect
import org.junit.Test

class CallRingPlaybackLawTest {

    private val idle = CallState.Idle
    private val ringingIn = CallState.Ringing(isOutgoing = false)
    private val ringingOut = CallState.Ringing(isOutgoing = true)
    private val connecting = CallState.Connecting
    private val connected = CallState.Connected
    private val ended = CallState.Ended(CallEndReason.Local)

    private fun effect(old: CallState, new: CallState) = CallRingPlaybackLaw.effect(old, new)

    @Test
    fun `un appel entrant qui sonne baisse`() {
        assertThat(effect(idle, ringingIn)).isEqualTo(Effect.Duck)
    }

    @Test
    fun `decrocher arrete puis rend le volume`() {
        assertThat(effect(ringingIn, connecting)).isEqualTo(Effect.InterruptAndRestore)
        assertThat(effect(ringingIn, connected)).isEqualTo(Effect.InterruptAndRestore)
    }

    @Test
    fun `refuser manquer ou annuler rend le volume sans interrompre`() {
        assertThat(effect(ringingIn, ended)).isEqualTo(Effect.Restore)
        assertThat(effect(ringingIn, idle)).isEqualTo(Effect.Restore)
    }

    @Test
    fun `un appel sortant arrete tout de suite`() {
        assertThat(effect(idle, ringingOut)).isEqualTo(Effect.Interrupt)
    }

    @Test
    fun `les transitions sans effet sur la lecture`() {
        assertThat(effect(ringingIn, ringingIn)).isEqualTo(Effect.None)
        assertThat(effect(ringingOut, connecting)).isEqualTo(Effect.None)
        assertThat(effect(connected, CallState.Reconnecting(1))).isEqualTo(Effect.None)
        assertThat(effect(connected, ended)).isEqualTo(Effect.None)
        assertThat(effect(ended, idle)).isEqualTo(Effect.None)
        assertThat(effect(idle, idle)).isEqualTo(Effect.None)
    }

    @Test
    fun `l'interruption survit au panneau de fin et se leve au repos`() {
        assertThat(CallRingPlaybackLaw.interruption(ringingIn)).isTrue()
        assertThat(CallRingPlaybackLaw.interruption(connected)).isTrue()
        assertThat(CallRingPlaybackLaw.interruption(ended)).isNull()
        assertThat(CallRingPlaybackLaw.interruption(idle)).isFalse()
    }
}
