package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import org.junit.Test

/** Ce que la conversation retire ferme la lecture : le branchement remet les trames au coordinateur. */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationAudioLifecycleBindingTest {

    private class QuietEngine : AudioPlaybackEngine {
        val mutable = MutableStateFlow(AudioPlaybackState())
        override val state: StateFlow<AudioPlaybackState> = mutable
        override val events: SharedFlow<AudioEngineEvent> = MutableSharedFlow()
        var stops = 0
        override fun play(attachmentId: String, url: String, origin: PlaybackCommandOrigin, isProtected: Boolean): Boolean {
            mutable.value = AudioPlaybackState(attachmentId = attachmentId, isPlaying = true)
            return true
        }
        override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin): Boolean = true
        override fun togglePlayPause(origin: PlaybackCommandOrigin) = Unit
        override fun pause() = Unit
        override fun resumeFromInterruption() = Unit
        override fun stop() { stops += 1; mutable.value = AudioPlaybackState() }
        override fun seek(fraction: Double) = Unit
        override fun seekToMs(positionMs: Long) = Unit
        override fun skip(seconds: Double) = Unit
        override fun setSpeed(speed: PlaybackSpeed) = Unit
        override fun cycleSpeed() = Unit
        override fun setLoop(loop: Boolean) = Unit
        override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) = Unit
        override fun setConsumedLanguageProvider(provider: (() -> String?)?) = Unit
    }

    private fun item(id: String, message: String, conversation: String = "c") = QueuedAudio(
        attachmentId = id, messageId = message, conversationId = conversation, fileUrl = "u/$id", durationMs = 5_000L,
        senderName = "N", senderAvatarUrl = null, receivedAtEpochMs = 0L, isProtected = false,
    )

    private class Rig(
        val engine: QuietEngine,
        val coordinator: ConversationAudioCoordinator,
        val messages: MutableSharedFlow<String>,
        val conversations: MutableSharedFlow<String>,
        val binding: ConversationAudioLifecycleBinding,
    )

    private fun TestScope.rig(): Rig {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val engine = QuietEngine()
        val coordinator = ConversationAudioCoordinator(engine, dispatcher)
        val messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
        val conversations = MutableSharedFlow<String>(extraBufferCapacity = 8)
        val binding = ConversationAudioLifecycleBinding(messages, conversations, coordinator, dispatcher)
        coordinator.play(item("a", "ma"), listOf(item("b", "mb"), item("c", "mc")), "Famille", null)
        binding.attach()
        runCurrent()
        return Rig(engine, coordinator, messages, conversations, binding)
    }

    @Test fun `le message supprime qui joue ferme la lecture`() = runTest {
        val rig = rig()

        rig.messages.tryEmit("ma")
        runCurrent()

        assertThat(rig.engine.stops).isEqualTo(1)
        assertThat(rig.coordinator.snapshot.value.context).isNull()
    }

    @Test fun `le message en file supprime ou brule quitte la file sans couper la lecture`() = runTest {
        val rig = rig()

        rig.messages.tryEmit("mb")
        runCurrent()

        assertThat(rig.engine.stops).isEqualTo(0)
        assertThat(rig.coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("c")
    }

    @Test fun `la conversation supprimee qui joue ferme la lecture`() = runTest {
        val rig = rig()

        rig.conversations.tryEmit("c")
        runCurrent()

        assertThat(rig.engine.stops).isEqualTo(1)
    }

    @Test fun `apres le detachement plus rien n'est ecoute`() = runTest {
        val rig = rig()

        rig.binding.detach()
        rig.messages.tryEmit("ma")
        rig.conversations.tryEmit("c")
        runCurrent()

        assertThat(rig.engine.stops).isEqualTo(0)
        assertThat(rig.coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("a")
    }

    @Test fun `un rattachement ne double pas l'ecoute`() = runTest {
        val rig = rig()
        rig.binding.attach()
        runCurrent()

        rig.messages.tryEmit("mb")
        runCurrent()

        assertThat(rig.coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("c")
    }
}
