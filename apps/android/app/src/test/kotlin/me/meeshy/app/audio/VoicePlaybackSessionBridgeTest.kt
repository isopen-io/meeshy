package me.meeshy.app.audio

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState
import org.junit.Test

class VoicePlaybackSessionBridgeTest {

    private val card = VoicePlaybackCard(attachmentId = "a1", sender = "Nour")

    @Test
    fun `a published voice note is anchored on the monotonic clock`() {
        var now = 1_000L
        val bridge = VoicePlaybackSessionBridge(clock = { now })

        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true))
        now = 9_000L
        bridge.publish(card, VoicePlaybackTransportState(positionMs = 8_000, isPlaying = true))

        assertThat(bridge.snapshot.value?.anchorMillis).isEqualTo(9_000L)
        assertThat(bridge.snapshot.value?.transport?.positionMs).isEqualTo(8_000L)
    }

    @Test
    fun `retiring clears the card`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true))

        bridge.retire()

        assertThat(bridge.snapshot.value).isNull()
    }

    @Test
    fun `commands reach the player in order`() = runTest {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })

        bridge.commands.test {
            bridge.dispatch(VoicePlaybackCommand.Pause)
            bridge.dispatch(VoicePlaybackCommand.SeekTo(3_000))
            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Pause)
            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.SeekTo(3_000))
        }
    }
}
