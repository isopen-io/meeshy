package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRingGateTest {

    private fun plan(
        ringerMode: CallRingerMode = CallRingerMode.Normal,
        dnd: CallDndFilter = CallDndFilter.Off,
        callerIsException: Boolean = false,
        ringVolume: Int = 5,
        vibrationEnabled: Boolean = true,
    ) = CallRingGate.plan(ringerMode, dnd, callerIsException, ringVolume, vibrationEnabled)

    @Test
    fun `mode normal sonne et vibre`() {
        assertThat(plan()).isEqualTo(CallRingPlan(sound = true, vibrate = true))
    }

    @Test
    fun `mode vibreur vibre sans son`() {
        assertThat(plan(ringerMode = CallRingerMode.Vibrate)).isEqualTo(CallRingPlan(sound = false, vibrate = true))
    }

    @Test
    fun `mode silencieux n emet pas de son et la vibration suit le reglage`() {
        assertThat(plan(ringerMode = CallRingerMode.Silent).sound).isFalse()
        assertThat(plan(ringerMode = CallRingerMode.Silent).vibrate).isTrue()
        assertThat(plan(ringerMode = CallRingerMode.Silent, vibrationEnabled = false).isSilent).isTrue()
    }

    @Test
    fun `volume nul garde la vibration`() {
        assertThat(plan(ringVolume = 0)).isEqualTo(CallRingPlan(sound = false, vibrate = true))
    }

    @Test
    fun `ne pas deranger total ou alarmes seules ne laisse rien passer meme une exception`() {
        assertThat(plan(dnd = CallDndFilter.None, callerIsException = true).isSilent).isTrue()
        assertThat(plan(dnd = CallDndFilter.Alarms, callerIsException = true).isSilent).isTrue()
    }

    @Test
    fun `ne pas deranger prioritaire bloque un inconnu et laisse passer une exception`() {
        assertThat(plan(dnd = CallDndFilter.Priority).isSilent).isTrue()
        assertThat(plan(dnd = CallDndFilter.Priority, callerIsException = true).sound).isTrue()
    }
}
