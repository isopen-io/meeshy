package me.meeshy.app.calls

import android.content.Intent
import com.google.common.truth.Truth.assertThat
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallHangUpReceiverTest {
    private val original = CallHangUpReceiver.holderProvider

    @After
    fun restore() {
        CallHangUpReceiver.holderProvider = original
    }

    private class Recording : ActiveCallCommands {
        var hangUps = 0
        var mutes = 0
        override fun hangUp() { hangUps += 1 }
        override fun toggleMute() { mutes += 1 }
    }

    private fun receive(action: String, holder: ActiveCallSnapshotHolder) {
        CallHangUpReceiver.holderProvider = { holder }
        CallHangUpReceiver().onReceive(RuntimeEnvironment.getApplication(), Intent(action))
    }

    @Test
    fun `hang up ends the active call without opening the app`() {
        val holder = ActiveCallSnapshotHolder()
        val call = Recording().also(holder::attach)
        receive(CallHangUpReceiver.ACTION_HANG_UP, holder)
        assertThat(call.hangUps).isEqualTo(1)
        assertThat(call.mutes).isEqualTo(0)
    }

    @Test
    fun `the mute button toggles the microphone`() {
        val holder = ActiveCallSnapshotHolder()
        val call = Recording().also(holder::attach)
        receive(CallHangUpReceiver.ACTION_TOGGLE_MUTE, holder)
        assertThat(call.mutes).isEqualTo(1)
    }

    @Test
    fun `without an active call both buttons are no-ops`() {
        val holder = ActiveCallSnapshotHolder()
        receive(CallHangUpReceiver.ACTION_HANG_UP, holder)
        receive(CallHangUpReceiver.ACTION_TOGGLE_MUTE, holder)
        assertThat(holder.snapshot.value).isNull()
    }

    @Test
    fun `an unknown action is ignored`() {
        val holder = ActiveCallSnapshotHolder()
        val call = Recording().also(holder::attach)
        receive("other", holder)
        assertThat(call.hangUps + call.mutes).isEqualTo(0)
    }
}
