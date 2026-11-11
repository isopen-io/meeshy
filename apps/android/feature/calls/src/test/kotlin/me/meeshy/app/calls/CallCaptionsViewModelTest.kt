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

    private fun relay(id: String, text: String, translated: String) = CallTranslatedSegmentPayload(
        callId = "call-1",
        segment = CallTranslatedSegmentRef(
            id = id, text = text, translatedText = translated, speakerId = "peer", isFinal = true,
            sourceLanguage = "en", targetLanguage = "fr", capturedAtMs = 1_000,
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

        val translated = viewModel.journalLines(viewModel.state.value, labels).single()
        assertThat(translated.text).isEqualTo("Comment vas-tu ?")
        assertThat(translated.languageTag).isEqualTo("EN → FR")
        assertThat(translated.originalBelow).isNull()

        viewModel.toggleReveal(translated.key)
        val unfolded = viewModel.journalLines(viewModel.state.value, labels).single()
        assertThat(unfolded.text).isEqualTo("Comment vas-tu ?")
        assertThat(unfolded.languageTag).isEqualTo("EN → FR")
        assertThat(unfolded.originalBelow).isEqualTo("How are you?")

        viewModel.toggleReveal(translated.key)
        assertThat(viewModel.journalLines(viewModel.state.value, labels).single().originalBelow).isNull()
    }

    @Test
    fun `a partial then its final merge into one line, and the band keeps the last two`() = runViewModel { viewModel ->
        viewModel.advance()
        dataChannel.tryEmit(DataChannelCodec.encodeTranscriptEntry(CallTranscriptEntry("w1", "call-1", "peer", "", "How are", "en", 900, isFinal = false)))
        relayed.tryEmit(relay("w1", "How are you?", "Comment vas-tu ?"))
        relayed.tryEmit(relay("w2", "Fine", "Bien"))
        relayed.tryEmit(relay("w3", "Thanks", "Merci"))

        val state = viewModel.state.value
        assertThat(viewModel.journalLines(state, labels)).hasSize(3)
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
