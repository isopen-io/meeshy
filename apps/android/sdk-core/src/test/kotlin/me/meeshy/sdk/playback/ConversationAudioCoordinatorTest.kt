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

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationAudioCoordinatorTest {

    private class FakeEngine : AudioPlaybackEngine {
        val mutable = MutableStateFlow(AudioPlaybackState())
        val mutableEvents = MutableSharedFlow<AudioEngineEvent>(extraBufferCapacity = 8)
        override val state: StateFlow<AudioPlaybackState> = mutable
        override val events: SharedFlow<AudioEngineEvent> = mutableEvents
        val played = mutableListOf<String>()
        val protections = mutableListOf<Boolean>()
        val seeks = mutableListOf<Long>()
        var stops = 0
        var allow = true

        override fun play(attachmentId: String, url: String, origin: PlaybackCommandOrigin, isProtected: Boolean): Boolean {
            if (!allow) return false
            played += attachmentId
            protections += isProtected
            mutable.value = AudioPlaybackState(attachmentId = attachmentId, isPlaying = true, speed = mutable.value.speed)
            return true
        }

        override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin) =
            play(attachmentId, fileUri, origin, false)

        override fun togglePlayPause(origin: PlaybackCommandOrigin) = Unit
        override fun pause() = Unit
        override fun resumeFromInterruption() = Unit
        override fun stop() { stops += 1; mutable.value = AudioPlaybackState(speed = mutable.value.speed) }
        override fun seek(fraction: Double) = Unit
        override fun seekToMs(positionMs: Long) { seeks += positionMs }
        val skips = mutableListOf<Double>()
        override fun skip(seconds: Double) { skips += seconds }
        override fun setSpeed(speed: PlaybackSpeed) { mutable.value = mutable.value.copy(speed = speed) }
        override fun cycleSpeed() = setSpeed(mutable.value.speed.next())
        override fun setLoop(loop: Boolean) = Unit
        override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) = Unit
        override fun setConsumedLanguageProvider(provider: (() -> String?)?) = Unit
    }

    private fun item(id: String, message: String = "m$id") = QueuedAudio(
        attachmentId = id, messageId = message, conversationId = "c", fileUrl = "u/$id", durationMs = 5_000L,
        senderName = "N", senderAvatarUrl = null, receivedAtEpochMs = 0L, isProtected = false,
    )

    private fun coordinator(scope: TestScope, engine: FakeEngine) =
        ConversationAudioCoordinator(engine, StandardTestDispatcher(scope.testScheduler))

    private fun TestScope.started(engine: FakeEngine, vararg tail: String): ConversationAudioCoordinator {
        val coordinator = coordinator(this, engine)
        runCurrent()
        coordinator.play(item("a"), tail.map { item(it) }, "Famille", null)
        return coordinator
    }

    @Test fun `jouer demarre le vocal et publie le contexte actif`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        assertThat(engine.played).containsExactly("a")
        assertThat(coordinator.snapshot.value.context?.conversationName).isEqualTo("Famille")
        assertThat(coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("b")
    }

    @Test fun `la fin d'un vocal enchaine le suivant et marque le premier ecoute`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")
        val finished = mutableListOf<AttachmentFinishedEvent>()
        backgroundScope.launchCollect(coordinator.attachmentFinished, finished)
        runCurrent()

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        assertThat(engine.played).containsExactly("a", "b").inOrder()
        assertThat(finished).containsExactly(AttachmentFinishedEvent("a", "c", completed = true))
        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("b")
    }

    @Test fun `un vocal casse est passe, la file ne reste pas bloquee`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = false))
        runCurrent()

        assertThat(engine.played).containsExactly("a", "b").inOrder()
        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("b")
    }

    @Test fun `la fin du dernier vocal vide la file`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        assertThat(coordinator.snapshot.value.context).isNull()
        assertThat(coordinator.snapshot.value.queue.current).isNull()
    }

    @Test fun `la fin d'un vocal etranger a la file est ignoree`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("zzz", completed = true))
        runCurrent()

        assertThat(engine.played).containsExactly("a")
        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("a")
    }

    @Test fun `suivant puis precedent, et precedent apres trois secondes recommence le vocal`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.next()
        assertThat(engine.played.last()).isEqualTo("b")

        engine.mutable.value = engine.mutable.value.copy(currentTimeMs = 4_000L)
        coordinator.previous()
        assertThat(engine.seeks).containsExactly(0L)

        engine.mutable.value = engine.mutable.value.copy(currentTimeMs = 500L)
        coordinator.previous()
        assertThat(engine.played.last()).isEqualTo("a")
    }

    @Test fun `suivant sans vocal derriere arrete la lecture`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)

        coordinator.next()

        assertThat(engine.stops).isEqualTo(1)
        assertThat(coordinator.snapshot.value.context).isNull()
    }

    @Test fun `un refus de la garde d'appel laisse la file en l'etat`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")
        engine.allow = false

        coordinator.next()
        coordinator.play(item("z"), emptyList(), "Autre", null)

        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("a")
        assertThat(coordinator.snapshot.value.context?.conversationName).isEqualTo("Famille")
    }

    @Test fun `un vocal arrive d'une autre conversation ne rejoint pas la file`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)

        coordinator.appendUpcoming(item("b").copy(conversationId = "other"))
        coordinator.appendUpcoming(item("c"))

        assertThat(coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("c")
    }

    @Test fun `le cycle de vitesse du coordinateur fait x1 x1,5 x2`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)

        coordinator.cycleSpeed()
        assertThat(engine.mutable.value.speed).isEqualTo(PlaybackSpeed.X1_5)
        coordinator.cycleSpeed()
        assertThat(engine.mutable.value.speed).isEqualTo(PlaybackSpeed.X2_0)
        coordinator.cycleSpeed()
        assertThat(engine.mutable.value.speed).isEqualTo(PlaybackSpeed.X1_0)
    }

    @Test fun `supprimer le message joue passe au suivant, sans suivant arrete`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.onMessageDeleted("ma")
        assertThat(engine.played.last()).isEqualTo("b")

        coordinator.onMessageDeleted("mb")
        assertThat(engine.stops).isEqualTo(1)
        assertThat(coordinator.snapshot.value.queue.current).isNull()
    }

    @Test fun `la deconnexion arrete tout`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.clear()

        assertThat(engine.stops).isEqualTo(1)
        assertThat(coordinator.snapshot.value.context).isNull()
    }

    @Test fun `une double notification de fin n'avance qu'une fois`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b", "c")

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        assertThat(engine.played).containsExactly("a", "b").inOrder()
        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("b")
    }

    @Test fun `la file epuisee garde le contexte cinq secondes puis le lache`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()
        assertThat(coordinator.snapshot.value.context).isNull()
        assertThat(coordinator.graceContext.value?.conversationName).isEqualTo("Famille")

        testScheduler.advanceTimeBy(4_900L)
        runCurrent()
        assertThat(coordinator.graceContext.value).isNotNull()

        testScheduler.advanceTimeBy(200L)
        runCurrent()
        assertThat(coordinator.graceContext.value).isNull()
    }

    @Test fun `la croix ferme le contexte de grace tout de suite`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)
        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        coordinator.dismissGrace()

        assertThat(coordinator.graceContext.value).isNull()
    }

    @Test fun `rejouer pendant la grace la ferme`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)
        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        coordinator.play(item("z"), emptyList(), "Autre", null)

        assertThat(coordinator.graceContext.value).isNull()
    }

    @Test fun `la protection d'un vocal voyage jusqu'au moteur, au demarrage comme a l'enchainement`() = runTest {
        val engine = FakeEngine()
        val coordinator = coordinator(this, engine)
        runCurrent()

        coordinator.play(item("a").copy(isProtected = true), listOf(item("b"), item("c").copy(isProtected = true)), "Famille", null)
        coordinator.next()
        coordinator.next()

        assertThat(engine.played).containsExactly("a", "b", "c").inOrder()
        assertThat(engine.protections).containsExactly(true, false, true).inOrder()
    }

    @Test fun `precedent a exactement trois secondes recule, juste au-dela il recommence`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")
        coordinator.next()

        engine.mutable.value = engine.mutable.value.copy(currentTimeMs = 3_000L)
        coordinator.previous()
        assertThat(engine.played.last()).isEqualTo("a")

        coordinator.next()
        engine.mutable.value = engine.mutable.value.copy(currentTimeMs = 3_001L)
        coordinator.previous()
        assertThat(engine.seeks).containsExactly(0L)
    }

    @Test fun `la barre et les quinze secondes de la carte systeme passent par le coordinateur`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)

        coordinator.seekToMs(9_000L)
        coordinator.skip(-15.0)

        assertThat(engine.seeks).containsExactly(9_000L)
        assertThat(engine.skips).containsExactly(-15.0)
    }
}
