package me.meeshy.app.audio

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.model.playback.VoicePlaybackCardRules
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackQueueControls
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState
import me.meeshy.sdk.playback.AudioEngineEvent
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import org.junit.Test

/**
 * Le moteur partagé parle au système : la carte suit le coordinateur (file, vocal courant, lecture), les ordres de la
 * carte, du casque et de l'écran verrouillé lui reviennent, la fin de file et un appel Meeshy la retirent. Le vrai
 * coordinateur tourne sur un faux moteur : ce qui se prouve ici est le câblage, pas le décodeur.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SharedAudioSessionPublisherTest {

    private class FakeEngine : AudioPlaybackEngine {
        val mutable = MutableStateFlow(AudioPlaybackState())
        val mutableEvents = MutableSharedFlow<AudioEngineEvent>(extraBufferCapacity = 8)
        override val state: StateFlow<AudioPlaybackState> = mutable
        override val events: SharedFlow<AudioEngineEvent> = mutableEvents
        val played = mutableListOf<String>()
        val toggles = mutableListOf<PlaybackCommandOrigin>()
        val seeks = mutableListOf<Long>()
        val skips = mutableListOf<Double>()
        var stops = 0

        override fun play(attachmentId: String, url: String, origin: PlaybackCommandOrigin, isProtected: Boolean): Boolean {
            played += attachmentId
            mutable.value = AudioPlaybackState(attachmentId = attachmentId, isPlaying = true, durationMs = 20_000)
            return true
        }

        override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin) = play(attachmentId, fileUri, origin, false)
        override fun togglePlayPause(origin: PlaybackCommandOrigin) {
            toggles += origin
            mutable.value = mutable.value.copy(isPlaying = !mutable.value.isPlaying)
        }
        override fun pause() = Unit
        override fun resumeFromInterruption() = Unit
        override fun stop() {
            stops += 1
            mutable.value = AudioPlaybackState()
        }
        override fun seek(fraction: Double) = Unit
        override fun seekToMs(positionMs: Long) {
            seeks += positionMs
            mutable.value = mutable.value.copy(currentTimeMs = positionMs)
        }
        override fun skip(seconds: Double) {
            skips += seconds
        }
        override fun setSpeed(speed: PlaybackSpeed) = Unit
        override fun cycleSpeed() = Unit
        override fun setLoop(loop: Boolean) = Unit
        override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) = Unit
        override fun setConsumedLanguageProvider(provider: (() -> String?)?) = Unit
    }

    private class Rig(scope: TestScope) {
        val engine = FakeEngine()
        val gate = CallActivityGate()
        var now = 0L
        val bridge = VoicePlaybackSessionBridge(clock = { now })
        val coordinator = ConversationAudioCoordinator(engine, StandardTestDispatcher(scope.testScheduler))
        val formatted = mutableListOf<Long>()
        val publisher = SharedAudioSessionPublisher(
            coordinator = coordinator,
            callGate = gate,
            bridge = bridge,
            scope = scope.backgroundScope,
            clock = { now },
            locale = { Locale.FRANCE },
            zone = { ZoneId.of("UTC") },
            formatSentAt = { epochMs, locale, zone ->
                formatted += epochMs
                VoicePlaybackCardRules.sentAtLabel(epochMs, locale, zone)
            },
        )
    }

    private fun item(id: String, protected: Boolean = false) = QueuedAudio(
        attachmentId = id, messageId = "m-$id", conversationId = "c1", fileUrl = "https://cdn.meeshy.me/$id.m4a",
        durationMs = 20_000, senderName = "Nour", senderAvatarUrl = "https://cdn.meeshy.me/nour.jpg",
        receivedAtEpochMs = 1_760_434_200_000L, isProtected = protected,
    )

    private fun TestScope.playing(vararg tail: String, first: QueuedAudio = item("a")): Rig {
        val rig = Rig(this)
        rig.publisher.start()
        runCurrent()
        rig.coordinator.play(first, tail.map { item(it) }, "Famille", "https://cdn.meeshy.me/famille.jpg")
        runCurrent()
        return rig
    }

    @Test
    fun `the card follows the coordinator, with the sender, the conversation and the queue controls`() = runTest {
        val rig = playing("b")

        val snapshot = rig.bridge.snapshot.value!!
        assertThat(snapshot.card.attachmentId).isEqualTo("a")
        assertThat(snapshot.card.sender).isEqualTo("Nour")
        assertThat(snapshot.card.conversation).isEqualTo("Famille")
        assertThat(snapshot.card.artworkUrl).isEqualTo("https://cdn.meeshy.me/nour.jpg")
        assertThat(snapshot.card.conversationId).isEqualTo("c1")
        assertThat(snapshot.card.messageId).isEqualTo("m-a")
        assertThat(snapshot.transport.isPlaying).isTrue()
        assertThat(snapshot.controls).isEqualTo(VoicePlaybackQueueControls(hasNext = true, hasPrevious = false))
    }

    @Test
    fun `next moves the card to the next voice of the queue, previous comes back to it`() = runTest {
        val rig = playing("b")

        rig.bridge.dispatch(VoicePlaybackCommand.Next)
        runCurrent()
        assertThat(rig.bridge.snapshot.value?.card?.attachmentId).isEqualTo("b")
        assertThat(rig.bridge.snapshot.value?.controls).isEqualTo(VoicePlaybackQueueControls(hasNext = false, hasPrevious = true))

        rig.bridge.dispatch(VoicePlaybackCommand.Previous)
        runCurrent()
        assertThat(rig.bridge.snapshot.value?.card?.attachmentId).isEqualTo("a")
        assertThat(rig.engine.played).containsExactly("a", "b", "a").inOrder()
    }

    @Test
    fun `previous after three seconds restarts the voice instead of leaving it`() = runTest {
        val rig = playing("b")
        rig.bridge.dispatch(VoicePlaybackCommand.Next)
        runCurrent()
        rig.engine.mutable.value = rig.engine.mutable.value.copy(currentTimeMs = 4_000)
        runCurrent()

        rig.bridge.dispatch(VoicePlaybackCommand.Previous)
        runCurrent()

        assertThat(rig.engine.seeks).containsExactly(0L)
        assertThat(rig.bridge.snapshot.value?.card?.attachmentId).isEqualTo("b")
    }

    @Test
    fun `play, pause, seek, skip and stop reach the coordinator as lock screen orders`() = runTest {
        val rig = playing("b")

        rig.bridge.dispatch(VoicePlaybackCommand.Pause)
        runCurrent()
        assertThat(rig.bridge.snapshot.value?.transport?.isPlaying).isFalse()
        assertThat(rig.bridge.snapshot.value).isNotNull()

        rig.bridge.dispatch(VoicePlaybackCommand.Play)
        rig.bridge.dispatch(VoicePlaybackCommand.SeekTo(9_000))
        rig.bridge.dispatch(VoicePlaybackCommand.Skip(-15_000))
        runCurrent()
        assertThat(rig.engine.toggles).containsExactly(PlaybackCommandOrigin.LockScreen, PlaybackCommandOrigin.LockScreen)
        assertThat(rig.engine.seeks).containsExactly(9_000L)
        assertThat(rig.engine.skips).containsExactly(-15.0)

        rig.bridge.dispatch(VoicePlaybackCommand.Stop)
        runCurrent()
        assertThat(rig.engine.stops).isEqualTo(1)
        assertThat(rig.bridge.snapshot.value).isNull()
    }

    @Test
    fun `a play order on a voice that already plays does not toggle it off`() = runTest {
        val rig = playing()

        rig.bridge.dispatch(VoicePlaybackCommand.Play)
        runCurrent()

        assertThat(rig.engine.toggles).isEmpty()
        assertThat(rig.engine.mutable.value.isPlaying).isTrue()
    }

    @Test
    fun `the end of the queue retires the card`() = runTest {
        val rig = playing()
        assertThat(rig.bridge.snapshot.value).isNotNull()

        rig.engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        assertThat(rig.bridge.snapshot.value).isNull()
    }

    @Test
    fun `an active call retires the card, and it comes back when the call ends`() = runTest {
        val rig = playing("b")

        rig.gate.setActive(true)
        runCurrent()
        assertThat(rig.bridge.snapshot.value).isNull()

        rig.gate.setActive(false)
        runCurrent()
        assertThat(rig.bridge.snapshot.value?.card?.attachmentId).isEqualTo("a")
    }

    @Test
    fun `a protected voice is published flagged protected so the card shows nothing about it`() = runTest {
        val rig = playing(first = item("a", protected = true))

        assertThat(rig.bridge.snapshot.value?.card?.isProtected).isTrue()
    }

    @Test
    fun `playback ticks do not republish the card, a seek does`() = runTest {
        val rig = playing()
        val anchor = rig.bridge.snapshot.value!!.anchorMillis

        rig.now = 1_000
        rig.engine.mutable.value = rig.engine.mutable.value.copy(currentTimeMs = 1_000)
        runCurrent()
        assertThat(rig.bridge.snapshot.value!!.anchorMillis).isEqualTo(anchor)

        rig.now = 2_000
        rig.engine.mutable.value = rig.engine.mutable.value.copy(currentTimeMs = 15_000)
        runCurrent()
        assertThat(rig.bridge.snapshot.value!!.anchorMillis).isEqualTo(2_000)
    }

    @Test
    fun `the send date is formatted once, not at every playback tick`() = runTest {
        val rig = playing("b")

        (1..20).forEach { tick ->
            rig.now = tick * 100L
            rig.engine.mutable.value = rig.engine.mutable.value.copy(currentTimeMs = tick * 100L)
            runCurrent()
        }
        assertThat(rig.formatted).hasSize(1)

        rig.bridge.dispatch(VoicePlaybackCommand.Next)
        runCurrent()
        assertThat(rig.formatted).hasSize(1)
        assertThat(rig.bridge.snapshot.value?.card?.sentAtLabel).isNotEmpty()
    }

    @Test
    fun `a screen player that starts silences the shared engine`() = runTest {
        val rig = playing("b")

        rig.bridge.publish(
            me.meeshy.sdk.model.playback.VoicePlaybackCard(attachmentId = "screen"),
            VoicePlaybackTransportState(positionMs = 0, isPlaying = true),
        )
        runCurrent()

        assertThat(rig.engine.stops).isEqualTo(1)
        assertThat(rig.bridge.snapshot.value?.card?.attachmentId).isEqualTo("screen")
    }
}
