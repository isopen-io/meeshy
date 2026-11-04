package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.playback.CoordinatedPlayer
import me.meeshy.sdk.playback.CoordinatedPlayerKind
import me.meeshy.sdk.playback.PlaybackCoordinator
import me.meeshy.sdk.playback.PlaybackVolumeTarget
import org.junit.Test

class CallPlaybackControllerTest {

    private class Volume(override var volume: Float) : PlaybackVolumeTarget

    private class Player(val target: Volume) : CoordinatedPlayer {
        override val kind = CoordinatedPlayerKind.Audio
        override val isPlayingAudibly = true
        override val volumeTarget: PlaybackVolumeTarget = target
        override fun stop() {}
    }

    private class Interruptor : CallPlaybackInterruptor {
        val log = mutableListOf<String>()
        override fun begin() { log += "begin" }
        override fun end() { log += "end" }
    }

    private class Rig(val volume: Volume = Volume(1f)) {
        val playback = PlaybackCoordinator()
        val interruptor = Interruptor()
        val controller = CallPlaybackController(playback, interruptor)
        private val player = Player(volume).also(playback::register)

        fun go(from: CallState, to: CallState) =
            controller.onTransition(from, to, CallSessionInfo("c1", CallConfig.EMPTY))
    }

    private val ringingIn = CallState.Ringing(isOutgoing = false)

    @Test
    fun `la sonnerie baisse le volume`() {
        val rig = Rig()
        rig.go(CallState.Idle, ringingIn)
        assertThat(rig.volume.volume).isWithin(0.0001f).of(0.3f)
        assertThat(rig.interruptor.log).isEmpty()
    }

    @Test
    fun `decrocher interrompt et rend le volume`() {
        val rig = Rig()
        rig.go(CallState.Idle, ringingIn)
        rig.go(ringingIn, CallState.Connecting)
        assertThat(rig.interruptor.log).containsExactly("begin")
        assertThat(rig.volume.volume).isWithin(0.0001f).of(1f)
    }

    @Test
    fun `refuser rend le volume sans interrompre`() {
        val rig = Rig()
        rig.go(CallState.Idle, ringingIn)
        rig.go(ringingIn, CallState.Ended(CallEndReason.Rejected))
        assertThat(rig.volume.volume).isWithin(0.0001f).of(1f)
        assertThat(rig.interruptor.log).isEmpty()
    }

    @Test
    fun `un appel sortant interrompt tout de suite`() {
        val rig = Rig()
        rig.go(CallState.Idle, CallState.Ringing(isOutgoing = true))
        assertThat(rig.interruptor.log).containsExactly("begin")
    }

    @Test
    fun `le panneau de fin garde l'interruption et le repos la leve`() {
        val rig = Rig()
        rig.go(CallState.Connected, CallState.Ended(CallEndReason.Remote))
        assertThat(rig.interruptor.log).isEmpty()
        rig.go(CallState.Ended(CallEndReason.Remote), CallState.Idle)
        assertThat(rig.interruptor.log).containsExactly("end")
    }
}
