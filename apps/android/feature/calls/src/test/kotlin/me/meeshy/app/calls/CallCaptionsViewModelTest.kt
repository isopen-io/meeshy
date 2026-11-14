package me.meeshy.app.calls

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallCaptionLabels
import me.meeshy.sdk.model.call.CallJournalFollow
import me.meeshy.sdk.model.call.CallParticipantLeftPayload
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallTranscriptEntry
import me.meeshy.sdk.model.call.CallTranscriptionActive
import me.meeshy.sdk.model.call.CallTranslatedSegmentPayload
import me.meeshy.sdk.model.call.CallTranslatedSegmentRef
import me.meeshy.sdk.model.call.CaptionsMode
import me.meeshy.sdk.model.call.DataChannelCodec
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallCaptionsViewModelTest {
    private val relayed = MutableSharedFlow<CallTranslatedSegmentPayload>(extraBufferCapacity = 8)
    private val dataChannel = MutableSharedFlow<ByteArray>(extraBufferCapacity = 8)
    private val session = mockk<SessionRepository> {
        every { currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
    }
    private val info = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY.copy(peerId = "peer", peerName = "Ada", conversationId = "conv-1"))
    private val labels = CallCaptionLabels(me = "Moi", unknown = "Inconnu")

    private fun runViewModel(block: suspend TestScope.(CallCaptionsViewModel) -> Unit) = runTest {
        val controller = CallCaptionsController(
            wires = CallCaptionsWires(relayed, dataChannel, MutableSharedFlow<CallTranscriptionActive>(), MutableSharedFlow<CallParticipantLeftPayload>()) { _, _ -> },
            session = session,
            regime = CallConversationRegime { false },
            notice = CallCaptionsRefusalNotice { },
            clock = { 5_000L },
            scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
        )
        controller.onTransition(CallState.Idle, CallState.Connected, info)
        block(CallCaptionsViewModel(controller))
        controller.onCleared()
    }

    private fun relay(id: String, text: String, translated: String, capturedAtMs: Long = 1_000) = CallTranslatedSegmentPayload(
        callId = "call-1",
        segment = CallTranslatedSegmentRef(
            id = id, text = text, translatedText = translated, speakerId = "peer", isFinal = true,
            sourceLanguage = "en", targetLanguage = "fr", capturedAtMs = capturedAtMs,
        ),
    )

    @Test
    fun `the button cycles Off, Translated, Original, Off`() = runViewModel { viewModel ->
        viewModel.state.map { it.mode }.test {
            assertThat(awaitItem()).isEqualTo(CaptionsMode.Off)
            viewModel.advance()
            assertThat(awaitItem()).isEqualTo(CaptionsMode.Translated)
            viewModel.advance()
            assertThat(awaitItem()).isEqualTo(CaptionsMode.Original)
            viewModel.advance()
            assertThat(awaitItem()).isEqualTo(CaptionsMode.Off)
        }
    }

    @Test
    fun `a peer's sentence reads in the reader's language with its tag, and a touch unfolds the original below`() = runViewModel { viewModel ->
        viewModel.advance()
        relayed.tryEmit(relay("w1", "How are you?", "Comment vas-tu ?"))

        val translated = viewModel.journalLines(viewModel.state.value, viewModel.journalView.value, labels).single()
        assertThat(translated.text).isEqualTo("Comment vas-tu ?")
        assertThat(translated.languageTag).isEqualTo("EN → FR")
        assertThat(translated.originalBelow).isNull()

        viewModel.toggleJournalReveal(translated.key)
        val unfolded = viewModel.journalLines(viewModel.state.value, viewModel.journalView.value, labels).single()
        assertThat(unfolded.text).isEqualTo("Comment vas-tu ?")
        assertThat(unfolded.languageTag).isEqualTo("EN → FR")
        assertThat(unfolded.originalBelow).isEqualTo("How are you?")

        viewModel.toggleJournalReveal(translated.key)
        assertThat(viewModel.journalLines(viewModel.state.value, viewModel.journalView.value, labels).single().originalBelow).isNull()
    }

    @Test
    fun `Original chosen in the journal leaves the band translated (P13_5, law 7)`() = runViewModel { viewModel ->
        viewModel.advance()
        relayed.tryEmit(relay("w1", "How are you?", "Comment vas-tu ?"))

        viewModel.setJournalShowsOriginal(true)

        val state = viewModel.state.value
        assertThat(viewModel.journalLines(state, viewModel.journalView.value, labels).single().text).isEqualTo("How are you?")
        assertThat(viewModel.bandLines(state, labels).single().text).isEqualTo("Comment vas-tu ?")
        assertThat(state.mode).isEqualTo(CaptionsMode.Translated)
    }

    @Test
    fun `the Sous-titres button's Original does not turn the journal's switch`() = runViewModel { viewModel ->
        viewModel.advance()
        viewModel.advance()
        relayed.tryEmit(relay("w1", "How are you?", "Comment vas-tu ?"))

        val state = viewModel.state.value
        assertThat(viewModel.bandLines(state, labels).single().text).isEqualTo("How are you?")
        assertThat(viewModel.journalLines(state, viewModel.journalView.value, labels).single().text).isEqualTo("Comment vas-tu ?")
    }

    @Test
    fun `a sentence touched in the band unfolds there only, and one touched in the journal unfolds there only`() = runViewModel { viewModel ->
        viewModel.advance()
        relayed.tryEmit(relay("w1", "How are you?", "Comment vas-tu ?"))
        val key = viewModel.bandLines(viewModel.state.value, labels).single().key

        viewModel.toggleReveal(key)
        assertThat(viewModel.bandLines(viewModel.state.value, labels).single().originalBelow).isEqualTo("How are you?")
        assertThat(viewModel.journalLines(viewModel.state.value, viewModel.journalView.value, labels).single().originalBelow).isNull()

        viewModel.toggleReveal(key)
        viewModel.toggleJournalReveal(key)
        assertThat(viewModel.bandLines(viewModel.state.value, labels).single().originalBelow).isNull()
        assertThat(viewModel.journalLines(viewModel.state.value, viewModel.journalView.value, labels).single().originalBelow).isEqualTo("How are you?")
    }

    @Test
    fun `each sentence of the journal reads the hour IN the call, since the media first flowed, never a wall clock (P6_4)`() = runViewModel { viewModel ->
        relayed.tryEmit(relay("w1", "Hello", "Bonjour", capturedAtMs = 5_000L + 75_000L))
        relayed.tryEmit(relay("w2", "Bye", "Salut", capturedAtMs = 5_000L + 3_725_000L))

        assertThat(viewModel.journalLines(viewModel.state.value, viewModel.journalView.value, labels).map { it.timeLabel }).containsExactly("01:15", "1:02:05").inOrder()
    }

    @Test
    fun `a partial then its final merge into one line, and the band keeps the last two`() = runViewModel { viewModel ->
        viewModel.advance()
        dataChannel.tryEmit(DataChannelCodec.encodeTranscriptEntry(CallTranscriptEntry("w1", "call-1", "peer", "", "How are", "en", 900, isFinal = false)))
        relayed.tryEmit(relay("w1", "How are you?", "Comment vas-tu ?"))
        relayed.tryEmit(relay("w2", "Fine", "Bien"))
        relayed.tryEmit(relay("w3", "Thanks", "Merci"))

        val state = viewModel.state.value
        assertThat(viewModel.journalLines(state, viewModel.journalView.value, labels)).hasSize(3)
        assertThat(viewModel.bandLines(state, labels).map { it.text }).containsExactly("Bien", "Merci").inOrder()
    }

    @Test
    fun `the journal follows the live edge until the reader scrolls up, then flags new sentences`() {
        val live = CallJournalFollow.LIVE
        assertThat(live.isFollowing).isTrue()

        val detached = live.scrolled(atLiveEdge = false, movedUp = true)
        assertThat(detached.isFollowing).isFalse()

        val unseen = detached.lineArrived()
        assertThat(unseen.showsReturnToLive).isTrue()
        assertThat(unseen.hasUnseen).isTrue()
    }
}
