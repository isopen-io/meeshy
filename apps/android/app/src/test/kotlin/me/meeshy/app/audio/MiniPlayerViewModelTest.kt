package me.meeshy.app.audio

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.playback.AudioEngineEvent
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Le mini-lecteur suit le VRAI coordinateur (sur un faux moteur) : ce qui se prouve ici est le câblage de la loi de
 * visibilité — masquée dans la conversation qui joue, maintenue pendant la grâce, fermée sur le champ par la croix —
 * et la valeur AFFICHÉE publiée pour la bande de la barre d'état.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MiniPlayerViewModelTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class FakeEngine : AudioPlaybackEngine {
        val mutable = MutableStateFlow(AudioPlaybackState())
        val mutableEvents = MutableSharedFlow<AudioEngineEvent>(extraBufferCapacity = 8)
        override val state: StateFlow<AudioPlaybackState> = mutable
        override val events: SharedFlow<AudioEngineEvent> = mutableEvents
        val played = mutableListOf<String>()
        var toggles = 0

        override fun play(attachmentId: String, url: String, origin: PlaybackCommandOrigin, isProtected: Boolean): Boolean {
            played += attachmentId
            mutable.value = AudioPlaybackState(attachmentId = attachmentId, isPlaying = true, durationMs = 20_000)
            return true
        }

        override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin) = play(attachmentId, fileUri, origin, false)
        override fun togglePlayPause(origin: PlaybackCommandOrigin) {
            toggles += 1
            mutable.value = mutable.value.copy(isPlaying = !mutable.value.isPlaying)
        }
        override fun pause() = Unit
        override fun resumeFromInterruption() = Unit
        override fun stop() {
            mutable.value = AudioPlaybackState()
        }
        override fun seek(fraction: Double) = Unit
        override fun seekToMs(positionMs: Long) = Unit
        override fun skip(seconds: Double) = Unit
        override fun setSpeed(speed: PlaybackSpeed) = Unit
        override fun cycleSpeed() = Unit
        override fun setLoop(loop: Boolean) = Unit
        override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) = Unit
        override fun setConsumedLanguageProvider(provider: (() -> String?)?) = Unit
    }

    private class Rig(scope: TestScope) {
        val engine = FakeEngine()
        val coordinator = ConversationAudioCoordinator(engine, StandardTestDispatcher(scope.testScheduler))
        val display = MiniPlayerDisplay()
        val viewModel = MiniPlayerViewModel(coordinator, display)
    }

    private fun item(id: String, conversationId: String = "c1") = QueuedAudio(
        attachmentId = id, messageId = "m-$id", conversationId = conversationId, fileUrl = "https://cdn.meeshy.me/$id.m4a",
        durationMs = 20_000, senderName = "Nour", senderAvatarUrl = "https://cdn.meeshy.me/nour.jpg",
        receivedAtEpochMs = 1_760_434_200_000L, isProtected = false,
    )

    private fun TestScope.rig(): Rig {
        val rig = Rig(this)
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { rig.viewModel.uiState.collect {} }
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { rig.viewModel.progress.collect {} }
        runCurrent()
        return rig
    }

    private fun Rig.play(vararg tail: String) {
        coordinator.play(item("a"), tail.map { item(it) }, "Famille", null)
    }

    @Test
    fun `un vocal qui joue s'affiche avec son expediteur, sa conversation et publie la barre affichee`() = runTest {
        val rig = rig()

        rig.play()
        runCurrent()

        val bar = rig.viewModel.uiState.value.bar
        assertThat(bar?.senderName).isEqualTo("Nour")
        assertThat(bar?.senderAvatarUrl).isEqualTo("https://cdn.meeshy.me/nour.jpg")
        assertThat(bar?.conversationName).isEqualTo("Famille")
        assertThat(rig.viewModel.uiState.value.isPlaying).isTrue()
        assertThat(rig.display.shown.value).isTrue()
    }

    @Test
    fun `sans vocal la barre n'existe pas`() = runTest {
        val rig = rig()

        assertThat(rig.viewModel.uiState.value.bar).isNull()
        assertThat(rig.display.shown.value).isFalse()
    }

    @Test
    fun `la barre se masque dans la conversation qui joue et revient en sortant`() = runTest {
        val rig = rig()
        rig.play()
        runCurrent()

        rig.viewModel.onEvent(MiniPlayerUiEvent.CurrentConversation("c1"))
        runCurrent()
        assertThat(rig.viewModel.uiState.value.bar).isNull()
        assertThat(rig.display.shown.value).isFalse()

        rig.viewModel.onEvent(MiniPlayerUiEvent.CurrentConversation(null))
        runCurrent()
        assertThat(rig.viewModel.uiState.value.bar?.senderName).isEqualTo("Nour")
        assertThat(rig.display.shown.value).isTrue()
    }

    @Test
    fun `l'ecran d'appel efface la barre et la bande, qui reviennent en le quittant`() = runTest {
        val rig = rig()
        rig.play()
        runCurrent()

        rig.viewModel.onEvent(MiniPlayerUiEvent.ScreenCovered(true))
        runCurrent()
        assertThat(rig.viewModel.uiState.value.bar).isNull()
        assertThat(rig.display.shown.value).isFalse()

        rig.viewModel.onEvent(MiniPlayerUiEvent.ScreenCovered(false))
        runCurrent()
        assertThat(rig.viewModel.uiState.value.bar?.senderName).isEqualTo("Nour")
        assertThat(rig.display.shown.value).isTrue()
    }

    @Test
    fun `la barre reste dans une autre conversation que celle qui joue`() = runTest {
        val rig = rig()
        rig.play()

        rig.viewModel.onEvent(MiniPlayerUiEvent.CurrentConversation("c2"))
        runCurrent()

        assertThat(rig.viewModel.uiState.value.bar).isNotNull()
    }

    @Test
    fun `la fin de file garde la barre pendant la grace puis la retire, sans jamais la faire clignoter`() = runTest {
        val rig = rig()
        rig.play()
        runCurrent()
        val seen = mutableListOf<Boolean>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { rig.display.shown.collect { seen += it } }

        rig.engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()
        assertThat(rig.viewModel.uiState.value.bar).isNotNull()
        assertThat(rig.display.shown.value).isTrue()

        testScheduler.advanceTimeBy(5_100L)
        runCurrent()
        assertThat(rig.viewModel.uiState.value.bar).isNull()
        assertThat(rig.display.shown.value).isFalse()
        assertThat(seen).containsExactly(true, false).inOrder()
    }

    @Test
    fun `la croix ferme sur le champ, meme pendant la grace`() = runTest {
        val rig = rig()
        rig.play()
        rig.engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()
        assertThat(rig.viewModel.uiState.value.bar).isNotNull()

        rig.viewModel.onEvent(MiniPlayerUiEvent.Close)
        runCurrent()

        assertThat(rig.viewModel.uiState.value.bar).isNull()
        assertThat(rig.display.shown.value).isFalse()
    }

    @Test
    fun `la fin de file dans la conversation qui joue n'arme aucune grace`() = runTest {
        val rig = rig()
        rig.viewModel.onEvent(MiniPlayerUiEvent.CurrentConversation("c1"))
        rig.play()
        runCurrent()

        rig.engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("a", completed = true))
        runCurrent()
        rig.viewModel.onEvent(MiniPlayerUiEvent.CurrentConversation(null))
        runCurrent()

        assertThat(rig.viewModel.uiState.value.bar).isNull()
    }

    @Test
    fun `lecture pause et suivant commandent le coordinateur`() = runTest {
        val rig = rig()
        rig.play("b")
        runCurrent()

        rig.viewModel.onEvent(MiniPlayerUiEvent.TogglePlay)
        runCurrent()
        assertThat(rig.engine.toggles).isEqualTo(1)
        assertThat(rig.viewModel.uiState.value.isPlaying).isFalse()

        rig.viewModel.onEvent(MiniPlayerUiEvent.Next)
        runCurrent()
        assertThat(rig.engine.played.last()).isEqualTo("b")
    }

    @Test
    fun `toucher la barre ouvre la conversation du vocal sur son message, meme en pause`() = runTest {
        val rig = rig()
        rig.play()
        runCurrent()
        rig.viewModel.onEvent(MiniPlayerUiEvent.TogglePlay)

        rig.viewModel.uiEffects.test {
            rig.viewModel.onEvent(MiniPlayerUiEvent.Open)
            assertThat(awaitItem()).isEqualTo(MiniPlayerUiEffect.OpenConversation("c1", "m-a"))
        }
    }

    @Test
    fun `toucher sans barre n'ouvre rien`() = runTest {
        val rig = rig()

        rig.viewModel.uiEffects.test {
            rig.viewModel.onEvent(MiniPlayerUiEvent.Open)
            expectNoEvents()
        }
    }

    @Test
    fun `la progression suit le vocal de la barre et reste au repos pour une autre piste`() = runTest {
        val rig = rig()
        rig.play()
        runCurrent()

        rig.engine.mutable.value = rig.engine.mutable.value.copy(currentTimeMs = 5_000L)
        runCurrent()
        assertThat(rig.viewModel.progress.value).isWithin(1e-6f).of(0.25f)

        rig.engine.mutable.value = AudioPlaybackState(attachmentId = "post-audio", isPlaying = true, currentTimeMs = 9_000L, durationMs = 10_000L)
        runCurrent()
        assertThat(rig.viewModel.progress.value).isEqualTo(0f)
        assertThat(rig.viewModel.uiState.value.isPlaying).isFalse()
    }

    @Test
    fun `la deconnexion retire la barre`() = runTest {
        val rig = rig()
        rig.play()
        runCurrent()

        rig.coordinator.clear()
        runCurrent()

        assertThat(rig.viewModel.uiState.value.bar).isNull()
        assertThat(rig.display.shown.value).isFalse()
    }
}
