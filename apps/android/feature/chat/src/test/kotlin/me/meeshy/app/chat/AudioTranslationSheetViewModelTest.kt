package me.meeshy.app.chat

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.attachment.AudioTranslationRequestTracker
import me.meeshy.sdk.model.translation.AudioTranslationRequestState
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioTranslationSheetViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private val states = mapOf(
        "es" to MutableStateFlow<AudioTranslationRequestState>(AudioTranslationRequestState.Idle),
        "de" to MutableStateFlow<AudioTranslationRequestState>(AudioTranslationRequestState.Idle),
    )

    private fun tracker(): AudioTranslationRequestTracker {
        val tracker = mockk<AudioTranslationRequestTracker>(relaxed = true)
        every { tracker.observe(any(), any(), any(), any()) } answers {
            states.getValue(thirdArg<String>())
        }
        return tracker
    }

    private fun input(
        refused: Boolean = false,
        ready: Set<String> = emptySet(),
        voices: List<AudioTranslationTarget> = listOf(AudioTranslationTarget("a1", "en")),
    ) = AudioTranslationSheetInput("m1", voices, listOf("es", "de"), refused, ready)

    @Test
    fun `une ligne par langue proposee, au repos tant que rien n'est demande`() = runTest(dispatcher) {
        val vm = AudioTranslationSheetViewModel(tracker())
        vm.bind(input())

        vm.uiState.test {
            skipItems(1)
            assertThat(awaitItem().rows.map { it.language to it.state }).containsExactly(
                "es" to AudioTranslationRequestState.Idle,
                "de" to AudioTranslationRequestState.Idle,
            ).inOrder()
        }
    }

    @Test
    fun `toucher une langue demande la traduction de la piece par son id`() = runTest(dispatcher) {
        val tracker = tracker()
        val vm = AudioTranslationSheetViewModel(tracker)
        vm.bind(input())

        vm.uiState.test {
            skipItems(1)
            awaitItem()
            vm.onEvent(AudioTranslationSheetEvent.Tap("ES"))
            advanceUntilIdle()
            cancelAndIgnoreRemainingEvents()
        }

        coVerify(exactly = 1) { tracker.request("m1", "a1", "es", "en") }
    }

    @Test
    fun `la progression suit le suivi en direct jusqu'a la piste prete`() = runTest(dispatcher) {
        val vm = AudioTranslationSheetViewModel(tracker())
        vm.bind(input())

        vm.uiState.test {
            skipItems(1)
            awaitItem()
            states.getValue("es").value = AudioTranslationRequestState.InFlight(10L)
            assertThat(awaitItem().rows.first { it.language == "es" }.state).isEqualTo(AudioTranslationRequestState.InFlight(10L))
            states.getValue("es").value = AudioTranslationRequestState.Ready
            assertThat(awaitItem().rows.first { it.language == "es" }.state).isEqualTo(AudioTranslationRequestState.Ready)
        }
    }

    @Test
    fun `une langue en cours n'est pas redemandee`() = runTest(dispatcher) {
        val tracker = tracker()
        val vm = AudioTranslationSheetViewModel(tracker)
        vm.bind(input())

        vm.uiState.test {
            skipItems(1)
            awaitItem()
            states.getValue("es").value = AudioTranslationRequestState.InFlight(10L)
            awaitItem()
            vm.onEvent(AudioTranslationSheetEvent.Tap("es"))
            advanceUntilIdle()
            cancelAndIgnoreRemainingEvents()
        }

        coVerify(exactly = 0) { tracker.request(any(), any(), any(), any()) }
    }

    @Test
    fun `un echec se retente au toucher suivant`() = runTest(dispatcher) {
        val tracker = tracker()
        val vm = AudioTranslationSheetViewModel(tracker)
        vm.bind(input())

        vm.uiState.test {
            skipItems(1)
            awaitItem()
            states.getValue("de").value = AudioTranslationRequestState.Failed
            assertThat(awaitItem().rows.first { it.language == "de" }.state).isEqualTo(AudioTranslationRequestState.Failed)
            vm.onEvent(AudioTranslationSheetEvent.Tap("de"))
            advanceUntilIdle()
            cancelAndIgnoreRemainingEvents()
        }

        coVerify(exactly = 1) { tracker.request("m1", "a1", "de", "en") }
    }

    @Test
    fun `un consentement manquant remonte la notice de clonage vocal`() = runTest(dispatcher) {
        val vm = AudioTranslationSheetViewModel(tracker())
        vm.bind(input())

        vm.uiState.test {
            skipItems(1)
            awaitItem()
            states.getValue("es").value = AudioTranslationRequestState.ConsentRequired("Consent", listOf("voiceCloning"))
            assertThat(awaitItem().consent?.requiredConsents).containsExactly("voiceCloning")
        }
    }

    @Test
    fun `un message scelle de bout en bout ne lance aucune requete et le dit sur chaque ligne`() = runTest(dispatcher) {
        val tracker = tracker()
        val vm = AudioTranslationSheetViewModel(tracker)
        vm.bind(input(refused = true))

        vm.uiState.test {
            skipItems(1)
            assertThat(awaitItem().rows.map { it.state }.toSet()).containsExactly(AudioTranslationRequestState.Refused)
            vm.onEvent(AudioTranslationSheetEvent.Tap("es"))
            advanceUntilIdle()
            cancelAndIgnoreRemainingEvents()
        }

        coVerify(exactly = 0) { tracker.request(any(), any(), any(), any()) }
    }

    @Test
    fun `toucher une langue prete la joue, sans nouvelle requete`() = runTest(dispatcher) {
        val tracker = tracker()
        val vm = AudioTranslationSheetViewModel(tracker)
        vm.bind(input(ready = setOf("a1|es")))
        states.getValue("es").value = AudioTranslationRequestState.Ready

        vm.uiState.test {
            skipItems(1)
            awaitItem()
            vm.onEvent(AudioTranslationSheetEvent.Tap("es"))
            advanceUntilIdle()
            cancelAndIgnoreRemainingEvents()
        }
        vm.effect.test {
            assertThat(awaitItem()).isEqualTo(AudioTranslationSheetEffect.PlayTrack("m1", "es"))
        }

        coVerify(exactly = 0) { tracker.request(any(), any(), any(), any()) }
    }

    @Test
    fun `chaque vocal du message est demande, sauf ceux dont la piste est deja la`() = runTest(dispatcher) {
        val tracker = tracker()
        val vm = AudioTranslationSheetViewModel(tracker)
        vm.bind(input(voices = listOf(AudioTranslationTarget("a1", "en"), AudioTranslationTarget("a2", "pt")), ready = setOf("a1|de")))

        vm.uiState.test {
            skipItems(1)
            awaitItem()
            vm.onEvent(AudioTranslationSheetEvent.Tap("de"))
            advanceUntilIdle()
            cancelAndIgnoreRemainingEvents()
        }

        coVerify(exactly = 1) { tracker.request("m1", "a2", "de", "pt") }
        coVerify(exactly = 0) { tracker.request("m1", "a1", "de", any()) }
    }
}
