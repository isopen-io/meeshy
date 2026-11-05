package me.meeshy.app.chat

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.voice.VoiceConsentGateProviding
import me.meeshy.sdk.voice.VoiceConsentNotGrantedException
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Le consentement vocal lu par le fil (iOS `ConversationViewModel.voiceConsentMissing`) : au chargement, au retour, après octroi. */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatVoiceConsentViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private class FakeGate(
        var known: Boolean = false,
        var missing: Boolean = true,
        var grantFailure: Exception? = null,
    ) : VoiceConsentGateProviding {
        var fetches = 0
        var grants = 0
        var pendingGrant: CompletableDeferred<Unit>? = null

        override val isKnownGranted: Boolean get() = known

        override suspend fun fetchMissing(): Boolean {
            fetches++
            return missing
        }

        override suspend fun grant() {
            grants++
            pendingGrant?.await()
            grantFailure?.let { throw it }
        }
    }

    @Test
    fun `un consentement manquant se lit au chargement`() = runTest(dispatcher) {
        val viewModel = ChatVoiceConsentViewModel(FakeGate(missing = true))

        viewModel.refresh()
        advanceUntilIdle()

        assertThat(viewModel.missing.value).isTrue()
    }

    @Test
    fun `un consentement connu ne coute aucune requete`() = runTest(dispatcher) {
        val gate = FakeGate(known = true)
        val viewModel = ChatVoiceConsentViewModel(gate)

        viewModel.refresh()
        advanceUntilIdle()

        assertThat(viewModel.missing.value).isFalse()
        assertThat(gate.fetches).isEqualTo(0)
    }

    @Test
    fun `la note disparait au retour quand le consentement a ete donne dans les reglages`() = runTest(dispatcher) {
        val gate = FakeGate(missing = true)
        val viewModel = ChatVoiceConsentViewModel(gate)
        viewModel.refresh()
        advanceUntilIdle()
        assertThat(viewModel.missing.value).isTrue()

        gate.known = true
        viewModel.refresh()

        assertThat(viewModel.missing.value).isFalse()
    }

    @Test
    fun `le popup d'envoi ne se propose qu'une fois, pour un audio, quand le consentement manque`() = runTest(dispatcher) {
        val viewModel = ChatVoiceConsentViewModel(FakeGate(missing = true))
        viewModel.refresh()
        advanceUntilIdle()

        assertThat(viewModel.claimSendPrompt(hasAudio = false)).isFalse()
        assertThat(viewModel.claimSendPrompt(hasAudio = true)).isTrue()
        assertThat(viewModel.claimSendPrompt(hasAudio = true)).isFalse()
    }

    @Test
    fun `sans consentement manquant l'envoi d'un audio part sans popup`() = runTest(dispatcher) {
        val viewModel = ChatVoiceConsentViewModel(FakeGate(missing = false))
        viewModel.refresh()
        advanceUntilIdle()

        assertThat(viewModel.claimSendPrompt(hasAudio = true)).isFalse()
    }

    @Test
    fun `activer fait tomber la note avant la reponse de la passerelle`() = runTest(dispatcher) {
        val gate = FakeGate(missing = true).apply { pendingGrant = CompletableDeferred() }
        val viewModel = ChatVoiceConsentViewModel(gate)
        viewModel.refresh()
        advanceUntilIdle()

        viewModel.grant()

        assertThat(viewModel.missing.value).isFalse()
        advanceUntilIdle()
        assertThat(gate.grants).isEqualTo(1)
        gate.pendingGrant?.complete(Unit)
        advanceUntilIdle()
        assertThat(viewModel.missing.value).isFalse()
    }

    @Test
    fun `un octroi refuse restaure la note et le dit`() = runTest(dispatcher) {
        val gate = FakeGate(missing = true, grantFailure = VoiceConsentNotGrantedException("refused"))
        val viewModel = ChatVoiceConsentViewModel(gate)
        viewModel.refresh()
        advanceUntilIdle()

        viewModel.grantFailures.test {
            viewModel.grant()
            advanceUntilIdle()
            awaitItem()
        }

        assertThat(viewModel.missing.value).isTrue()
    }

    @Test
    fun `une relecture lancee avant l'octroi ne ramene pas la note`() = runTest(dispatcher) {
        val gate = FakeGate(missing = true)
        val viewModel = ChatVoiceConsentViewModel(gate)

        viewModel.refresh()
        viewModel.grant()
        advanceUntilIdle()

        assertThat(viewModel.missing.value).isFalse()
    }
}
