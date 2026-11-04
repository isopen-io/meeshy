package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
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
            flushedLanguages += languageProvider?.invoke()
            played += attachmentId
            protections += isProtected
            mutable.value = AudioPlaybackState(attachmentId = attachmentId, isPlaying = true, speed = mutable.value.speed)
            return true
        }

        val locals = mutableListOf<String>()
        override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin): Boolean {
            if (!allow) return false
            locals += fileUri
            played += attachmentId
            mutable.value = AudioPlaybackState(attachmentId = attachmentId, isPlaying = true, speed = mutable.value.speed)
            return true
        }

        override fun togglePlayPause(origin: PlaybackCommandOrigin) = Unit
        override fun pause() = Unit
        override fun resumeFromInterruption() = Unit
        override fun stop() { stops += 1; mutable.value = AudioPlaybackState(speed = mutable.value.speed) }
        val fractions = mutableListOf<Double>()
        override fun seek(fraction: Double) { fractions += fraction }
        override fun seekToMs(positionMs: Long) { seeks += positionMs }
        val skips = mutableListOf<Double>()
        override fun skip(seconds: Double) { skips += seconds }
        override fun setSpeed(speed: PlaybackSpeed) { mutable.value = mutable.value.copy(speed = speed) }
        override fun cycleSpeed() = setSpeed(mutable.value.speed.next())
        override fun setLoop(loop: Boolean) = Unit
        override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) = Unit
        var languageProvider: (() -> String?)? = null
        val flushedLanguages = mutableListOf<String?>()
        override fun setConsumedLanguageProvider(provider: (() -> String?)?) { languageProvider = provider }
        val follows = mutableListOf<List<Any>>()
        override fun follow(fromAttachmentId: String, toAttachmentId: String, servedUrl: String, isProtected: Boolean) {
            follows += listOf(fromAttachmentId, toAttachmentId, servedUrl, isProtected)
            if (mutable.value.attachmentId == fromAttachmentId) mutable.value = mutable.value.copy(attachmentId = toAttachmentId)
        }
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

    // INVERSÉ par #16035 : « supprimer le message joué passe au suivant » devient « le ferme » (iOS
    // `ConversationAudioCoordinator.wireSocketLifecycleHooks` : `activeContext.messageId == messageId` ⇒ `close()`).
    @Test fun `supprimer le message joue ferme la lecture, meme avec une file derriere`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.onMessageDeleted("ma")

        assertThat(engine.stops).isEqualTo(1)
        assertThat(engine.played).containsExactly("a")
        assertThat(coordinator.snapshot.value.queue.current).isNull()
        assertThat(coordinator.snapshot.value.context).isNull()
    }

    @Test fun `supprimer un message en file retire ses pieces sans toucher la lecture`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b", "c")

        coordinator.onMessageDeleted("mb")

        assertThat(engine.stops).isEqualTo(0)
        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("a")
        assertThat(coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("c")
    }

    @Test fun `supprimer la conversation qui joue ferme la lecture`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.onConversationDeleted("c")

        assertThat(engine.stops).isEqualTo(1)
        assertThat(coordinator.snapshot.value.context).isNull()
    }

    @Test fun `supprimer une autre conversation ne touche pas la lecture`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.onConversationDeleted("elsewhere")

        assertThat(engine.stops).isEqualTo(0)
        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("a")
    }

    @Test fun `la langue entendue est celle de la piste jouee, relachee au changement de piste`() = runTest {
        val engine = FakeEngine()
        val coordinator = coordinator(this, engine)
        runCurrent()

        coordinator.play(item("a").copy(trackLanguage = "en"), listOf(item("b").copy(trackLanguage = "fr")), "Famille", null)
        assertThat(engine.languageProvider?.invoke()).isEqualTo("en")

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        assertThat(engine.flushedLanguages.last()).isEqualTo("en")
        assertThat(engine.mutable.value.attachmentId).isEqualTo("b")
        assertThat(engine.languageProvider?.invoke()).isEqualTo("fr")
    }

    @Test fun `un vocal du moteur qui n'est pas celui de la file ne porte aucune langue`() = runTest {
        val engine = FakeEngine()
        val coordinator = coordinator(this, engine)
        coordinator.play(item("a").copy(trackLanguage = "en"), emptyList(), "Famille", null)

        engine.mutable.value = AudioPlaybackState(attachmentId = "recorder-preview", isPlaying = true)

        assertThat(engine.languageProvider?.invoke()).isNull()
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

    @Test fun `suivant sur le dernier vocal garde la grace comme la fin de file`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)

        coordinator.next()

        assertThat(engine.stops).isEqualTo(1)
        assertThat(coordinator.snapshot.value.context).isNull()
        assertThat(coordinator.graceContext.value?.conversationName).isEqualTo("Famille")

        testScheduler.advanceTimeBy(5_100L)
        runCurrent()
        assertThat(coordinator.graceContext.value).isNull()
    }

    @Test fun `la croix pendant la grace du dernier suivant ferme sur le champ`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)
        coordinator.next()

        coordinator.stop()

        assertThat(coordinator.graceContext.value).isNull()
    }

    /** Un observateur qui lit les deux flux voit chaque pas : jamais « ni actif ni grace » entre deux etats qui se tiennent. */
    private fun TestScope.observeBothStates(coordinator: ConversationAudioCoordinator): MutableList<Pair<Boolean, Boolean>> {
        val seen = mutableListOf<Pair<Boolean, Boolean>>()
        var active = false
        var grace = false
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            coordinator.graceContext.collect { grace = it != null; seen += active to grace }
        }
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            coordinator.snapshot.collect { active = it.context != null; seen += active to grace }
        }
        return seen
    }

    @Test fun `la fin de file ne passe jamais par un etat sans contexte ni grace`() = runTest {
        val engine = FakeEngine()
        val coordinator = coordinator(this, engine)
        runCurrent()
        val seen = observeBothStates(coordinator)
        coordinator.play(item("a"), emptyList(), "Famille", null)

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        assertThat(seen.dropWhile { it != (true to false) }).doesNotContain(false to false)
    }

    @Test fun `rejouer pendant la grace ne passe jamais par un etat sans contexte ni grace`() = runTest {
        val engine = FakeEngine()
        val coordinator = coordinator(this, engine)
        runCurrent()
        coordinator.play(item("a"), emptyList(), "Famille", null)
        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()
        val seen = observeBothStates(coordinator)

        coordinator.play(item("z"), emptyList(), "Autre", null)

        assertThat(seen).doesNotContain(false to false)
    }

    @Test fun `suivant pendant la grace ne ferme pas la barre qui la porte`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)
        coordinator.next()

        coordinator.next()

        assertThat(coordinator.graceContext.value?.conversationName).isEqualTo("Famille")
    }

    @Test fun `un vocal pas encore envoye se joue depuis son fichier local`() = runTest {
        val engine = FakeEngine()
        val coordinator = coordinator(this, engine)
        runCurrent()

        coordinator.play(item("a").copy(fileUrl = "file:///data/voice/a.m4a"), emptyList(), "Famille", null)

        assertThat(engine.locals).containsExactly("file:///data/voice/a.m4a")
        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("a")
    }

    @Test fun `l'enchainement vers un vocal local passe aussi par le fichier`() = runTest {
        val engine = FakeEngine()
        val coordinator = coordinator(this, engine)
        runCurrent()
        coordinator.play(item("a"), listOf(item("b").copy(fileUrl = "file:///data/voice/b.m4a")), "Famille", null)

        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()

        assertThat(engine.locals).containsExactly("file:///data/voice/b.m4a")
        assertThat(engine.played).containsExactly("a", "b").inOrder()
    }

    @Test fun `glisser sur l'onde place le vocal en cours a la fraction choisie`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)

        coordinator.seek(0.4)

        assertThat(engine.fractions).containsExactly(0.4)
    }

    @Test fun `le vocal accuse prend son id serveur dans la file et le moteur, et sa fin le marque ecoute sous ce nom`() = runTest {
        val engine = FakeEngine()
        val coordinator = coordinator(this, engine)
        runCurrent()
        coordinator.play(item("cmid").copy(fileUrl = "file:///pending/cmid.m4a", isProtected = true), listOf(item("b")), "Famille", null)
        val finished = mutableListOf<AttachmentFinishedEvent>()
        backgroundScope.launchCollect(coordinator.attachmentFinished, finished)
        runCurrent()

        coordinator.follow("cmid", "att_server", "https://gate/voice.m4a")
        engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("att_server", completed = true))
        runCurrent()

        assertThat(engine.follows.single()).containsExactly("cmid", "att_server", "https://gate/voice.m4a", true).inOrder()
        assertThat(finished.map { it.attachmentId }).containsExactly("att_server")
        assertThat(engine.played.last()).isEqualTo("b")
    }

    @Test fun `suivre une piece que le moteur ne tient pas ne change rien`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.follow("b", "att_b", "https://gate/b.m4a")

        assertThat(engine.follows).isEmpty()
        assertThat(coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("b")
        assertThat(coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("a")
    }

    @Test fun `changer de langue de piste recharge le vocal courant sous le meme id et garde la suite`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.switchVariant(item("a").copy(fileUrl = "u/a-es", trackLanguage = "es", isTranslatedTrack = true))

        assertThat(engine.played).containsExactly("a", "a").inOrder()
        assertThat(coordinator.snapshot.value.queue.current?.fileUrl).isEqualTo("u/a-es")
        assertThat(coordinator.snapshot.value.context?.audio?.trackLanguage).isEqualTo("es")
        assertThat(coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("b")
    }

    @Test fun `la meme piste ou un autre vocal que le courant ne recharge rien`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine, "b")

        coordinator.switchVariant(item("a"))
        coordinator.switchVariant(item("b").copy(fileUrl = "u/b-es"))

        assertThat(engine.played).containsExactly("a")
    }

    @Test fun `une garde d'appel qui refuse laisse la file sur la piste d'avant`() = runTest {
        val engine = FakeEngine()
        val coordinator = started(engine)
        engine.allow = false

        coordinator.switchVariant(item("a").copy(fileUrl = "u/a-es"))

        assertThat(coordinator.snapshot.value.queue.current?.fileUrl).isEqualTo("u/a")
    }
}
