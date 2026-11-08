package me.meeshy.app.audio

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackQueueControls
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
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

    private val playing = VoicePlaybackTransportState(positionMs = 0, isPlaying = true)
    private val paused = VoicePlaybackTransportState(positionMs = 4_000, isPlaying = false)
    private val controls = VoicePlaybackQueueControls(hasNext = true, hasPrevious = false)

    @Test
    fun `the shared engine card carries the queue controls, the screen card none`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })

        bridge.publish(card, playing)
        assertThat(bridge.snapshot.value?.controls).isNull()

        bridge.retire()
        bridge.publishShared(card, playing, controls)
        assertThat(bridge.snapshot.value?.controls).isEqualTo(controls)
    }

    @Test
    fun `a shared engine that starts takes the card and silences the screen player`() = runTest {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        bridge.publish(card, playing)

        bridge.commands.test {
            bridge.publishShared(card.copy(attachmentId = "a2"), playing, controls)

            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Stop)
        }
        assertThat(bridge.snapshot.value?.card?.attachmentId).isEqualTo("a2")
    }

    @Test
    fun `a screen player that starts takes the card and silences the shared engine`() = runTest {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        bridge.publishShared(card, playing, controls)

        bridge.sharedCommands.test {
            bridge.publish(card.copy(attachmentId = "a2"), playing)

            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Stop)
        }
        assertThat(bridge.snapshot.value?.card?.attachmentId).isEqualTo("a2")
        assertThat(bridge.snapshot.value?.controls).isNull()
    }

    @Test
    fun `a paused screen player never steals the card from the shared engine`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        bridge.publishShared(card, playing, controls)

        bridge.publish(card.copy(attachmentId = "a2"), paused)

        assertThat(bridge.snapshot.value?.card?.attachmentId).isEqualTo("a1")
    }

    @Test
    fun `a retirement from a non owner leaves the other card alone`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        bridge.publishShared(card, playing, controls)

        bridge.retire()
        assertThat(bridge.snapshot.value?.card?.attachmentId).isEqualTo("a1")

        bridge.retireShared()
        assertThat(bridge.snapshot.value).isNull()
    }

    @Test
    fun `system orders reach only the owner of the card`() = runTest(UnconfinedTestDispatcher()) {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val screen = mutableListOf<VoicePlaybackCommand>()
        val shared = mutableListOf<VoicePlaybackCommand>()
        backgroundScope.launch { bridge.commands.collect { screen += it } }
        backgroundScope.launch { bridge.sharedCommands.collect { shared += it } }

        bridge.dispatch(VoicePlaybackCommand.Pause)
        bridge.publishShared(card, playing, controls)
        bridge.dispatch(VoicePlaybackCommand.Next)

        assertThat(screen).containsExactly(VoicePlaybackCommand.Pause)
        assertThat(shared).containsExactly(VoicePlaybackCommand.Next)
    }
}
