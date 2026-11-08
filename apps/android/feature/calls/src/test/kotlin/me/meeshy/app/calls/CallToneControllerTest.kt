package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallRingPlan
import me.meeshy.sdk.model.call.CallSound
import org.junit.Test

class CallToneControllerTest {

    private class FakePlayer(val resId: Int, val looping: Boolean, val volume: Float, val onCompleted: () -> Unit) : CallTonePlayer {
        var started = false
        var released = false
        override fun start() { started = true }
        override fun release() { released = true }
    }

    private class Fixture(var refuse: Boolean = false, var plan: CallRingPlan = CallRingPlan(sound = true, vibrate = true)) {
        val created = mutableListOf<FakePlayer>()
        val ringtoneLog = mutableListOf<String>()
        val controller = AndroidCallToneController(
            players = object : CallTonePlayerFactory {
                override fun create(resId: Int, looping: Boolean, volume: Float, onCompleted: () -> Unit): CallTonePlayer? =
                    if (refuse) null else FakePlayer(resId, looping, volume, onCompleted).also { created += it }
            },
            ringtone = object : CallRingtoneOutput {
                override fun start(plan: CallRingPlan) { ringtoneLog += "start:${plan.sound}/${plan.vibrate}" }
                override fun stop() { ringtoneLog += "stop" }
            },
            environment = object : CallRingEnvironment { override fun plan() = this@Fixture.plan },
        )
    }

    @Test
    fun `le ringback boucle a 0,6 et s arrete a la transition suivante`() {
        val f = Fixture()
        f.controller.setLoop(CallSound.Ringback)
        val ringback = f.created.single()
        assertThat(ringback.resId).isEqualTo(R.raw.call_ringback)
        assertThat(ringback.looping).isTrue()
        assertThat(ringback.volume).isEqualTo(0.6f)
        assertThat(ringback.started).isTrue()

        f.controller.setLoop(CallSound.None)
        assertThat(ringback.released).isTrue()
    }

    @Test
    fun `la sonnerie suit le plan de la loi et ne charge aucun son embarque`() {
        val f = Fixture(plan = CallRingPlan(sound = false, vibrate = true))
        f.controller.setLoop(CallSound.Ringtone)
        assertThat(f.created).isEmpty()
        assertThat(f.ringtoneLog.last()).isEqualTo("start:false/true")

        f.controller.setLoop(CallSound.None)
        assertThat(f.ringtoneLog.last()).isEqualTo("stop")
    }

    @Test
    fun `un signal est un one shot qui se libere a la fin`() {
        val f = Fixture()
        f.controller.playCue(CallCue.Connected)
        val cue = f.created.single()
        assertThat(cue.resId).isEqualTo(R.raw.call_cue_connected)
        assertThat(cue.looping).isFalse()
        cue.onCompleted()
        assertThat(cue.released).isTrue()
    }

    @Test
    fun `un nouveau signal remplace le precedent sans fuite`() {
        val f = Fixture()
        f.controller.playCue(CallCue.Connected)
        f.controller.playCue(CallCue.Ended)
        assertThat(f.created[0].released).isTrue()
        assertThat(f.created[1].resId).isEqualTo(R.raw.call_cue_ended)
    }

    @Test
    fun `un appareil qui refuse la lecture degrade en silence`() {
        val f = Fixture(refuse = true)
        f.controller.setLoop(CallSound.Ringback)
        f.controller.playCue(CallCue.Ended)
        f.controller.release()
    }

    @Test
    fun `release libere la boucle et le signal`() {
        val f = Fixture()
        f.controller.setLoop(CallSound.Ringback)
        f.controller.playCue(CallCue.Connected)
        f.controller.release()
        assertThat(f.created.all { it.released }).isTrue()
    }
}
