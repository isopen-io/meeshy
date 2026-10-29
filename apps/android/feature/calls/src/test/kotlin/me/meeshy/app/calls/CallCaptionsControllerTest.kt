package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallCaptionsGate
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEvent
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

/**
 * #13333 — the captions of the call, reception half (iOS `CallManager+Transcription`,
 * `CallSignalingRouter.observeTranscription`, `CallManager+DataChannel`).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallCaptionsControllerTest {
    private val relayed = MutableSharedFlow<CallTranslatedSegmentPayload>(extraBufferCapacity = 8)
    private val dataChannel = MutableSharedFlow<ByteArray>(extraBufferCapacity = 8)
    private val listening = MutableSharedFlow<CallTranscriptionActive>(extraBufferCapacity = 8)
    private val left = MutableSharedFlow<CallParticipantLeftPayload>(extraBufferCapacity = 8)
    private val announced = mutableListOf<Pair<String, Boolean>>()
    private val refusals = mutableListOf<CallCaptionsGate>()
    private val session = mockk<SessionRepository> {
        every { currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
    }
    private val info = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY.copy(peerId = "peer", peerName = "Ada", conversationId = "conv-1"))

    private fun runController(endToEnd: Boolean? = false, block: suspend TestScope.(CallCaptionsController) -> Unit) = runTest {
        val controller = CallCaptionsController(
            wires = CallCaptionsWires(relayed, dataChannel, listening, left) { id, active -> announced += id to active },
            session = session,
            regime = CallConversationRegime { endToEnd },
            notice = CallCaptionsRefusalNotice { refusals += it },
            clock = { 5_000L },
            scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
        )
        block(controller)
        controller.onCleared()
    }

    private fun CallCaptionsController.connected() = onTransition(CallState.Idle, CallState.Connected, info)

    private fun relay(text: String = "How are you?", translated: String? = "Comment vas-tu ?", callId: String = "call-1", id: String = "w1") =
        CallTranslatedSegmentPayload(
            callId = callId,
            segment = CallTranslatedSegmentRef(
                id = id, text = text, translatedText = translated, speakerId = "peer", isFinal = true,
                sourceLanguage = "en", targetLanguage = "fr", capturedAtMs = 1_000,
            ),
        )

    @Test
    fun `opening the captions tells the peers I read them, once, and closing tells them I stopped`() = runController { controller ->
        controller.connected()

        controller.advance()
        controller.advance()
        controller.advance()

        assertThat(announced).containsExactly("call-1" to true, "call-1" to false).inOrder()
    }

    @Test
    fun `the peer's words land translated by the Prisme, merged across the data channel and the relay`() = runController { controller ->
        controller.connected()
        controller.advance()

        dataChannel.tryEmit(DataChannelCodec.encodeTranscriptEntry(CallTranscriptEntry("w1", "call-1", "peer", "", "How are", "en", 900, isFinal = false)))
        relayed.tryEmit(relay())

        val journal = controller.state.value.journal.segments
        assertThat(journal).hasSize(1)
        assertThat(journal.single().text).isEqualTo("How are you?")
        assertThat(journal.single().translatedText).isEqualTo("Comment vas-tu ?")
        assertThat(journal.single().capturedAtMs).isEqualTo(900)
    }

    @Test
    fun `nothing is gathered while my captions are off, nor from another call`() = runController { controller ->
        controller.connected()
        relayed.tryEmit(relay())
        controller.advance()
        relayed.tryEmit(relay(callId = "call-2", id = "w2"))

        assertThat(controller.state.value.journal.isEmpty).isTrue()
    }

    @Test
    fun `an end-to-end conversation never opens the captions, says why, and never asks the peer for its words`() =
        runController(endToEnd = true) { controller ->
            controller.connected()

            controller.advance()
            relayed.tryEmit(relay())

            assertThat(controller.state.value.mode).isEqualTo(CaptionsMode.Off)
            assertThat(controller.state.value.gate).isEqualTo(CallCaptionsGate.EndToEnd)
            assertThat(refusals).containsExactly(CallCaptionsGate.EndToEnd)
            assertThat(announced).isEmpty()
            assertThat(controller.state.value.journal.isEmpty).isTrue()
        }

    @Test
    fun `a regime that cannot be read keeps the captions closed (fail-closed)`() = runController(endToEnd = null) { controller ->
        controller.connected()

        controller.advance()

        assertThat(controller.state.value.gate).isEqualTo(CallCaptionsGate.Unresolved)
        assertThat(announced).isEmpty()
        assertThat(refusals).containsExactly(CallCaptionsGate.Unresolved)
    }

    @Test
    fun `a peer who opens their captions invites me, until they close or leave`() = runController { controller ->
        controller.connected()

        listening.tryEmit(CallTranscriptionActive("call-1", "peer", active = true))
        assertThat(controller.state.value.invitesToOpen).isTrue()

        left.tryEmit(CallParticipantLeftPayload(callId = "call-1", userId = "peer"))
        assertThat(controller.state.value.invitesToOpen).isFalse()
    }

    @Test
    fun `a newcomer is told again that I read the captions`() = runController { controller ->
        controller.connected()
        controller.advance()

        controller.onRemoteEvent(CallEvent.ParticipantJoined("p2"), info)

        assertThat(announced).containsExactly("call-1" to true, "call-1" to true).inOrder()
    }

    @Test
    fun `the end of the call forgets the journal and the panel`() = runController { controller ->
        controller.connected()
        controller.advance()
        relayed.tryEmit(relay())

        controller.onTransition(CallState.Connected, CallState.Ended(CallEndReason.Local), info)

        assertThat(controller.state.value.journal.isEmpty).isTrue()
        assertThat(controller.state.value.mode).isEqualTo(CaptionsMode.Off)
    }

    @Test
    fun `the band's Journal button asks the screen to open the journal`() = runController { controller ->
        var asked = 0
        val job = CoroutineScope(UnconfinedTestDispatcher(testScheduler)).launch { controller.journalRequests.collect { asked++ } }
        controller.openJournal()
        job.cancel()

        assertThat(asked).isEqualTo(1)
    }

    @Test
    fun `the Captions button says its state, the invitation, or why it does not open`() {
        val off = CallCaptionsPresenter.captions(CallCaptionsChip(gate = CallCaptionsGate.Open))
        val on = CallCaptionsPresenter.captions(CallCaptionsChip(mode = CaptionsMode.Translated, gate = CallCaptionsGate.Open))
        val invited = CallCaptionsPresenter.captions(CallCaptionsChip(invitesToOpen = true, gate = CallCaptionsGate.Open))
        val sealed = CallCaptionsPresenter.captions(CallCaptionsChip(gate = CallCaptionsGate.EndToEnd))

        assertThat(off.isActive).isFalse()
        assertThat(on.isActive).isTrue()
        assertThat(on.hintRes).isEqualTo(R.string.call_captions_state_translated)
        assertThat(invited.hintRes).isEqualTo(R.string.call_captions_peer_active)
        assertThat(sealed.hintRes).isEqualTo(R.string.call_captions_end_to_end)
        assertThat(CallCaptionsPresenter.journal(CallCaptionsChip(gate = CallCaptionsGate.EndToEnd))).isNull()
        assertThat(CallCaptionsPresenter.journal(CallCaptionsChip(gate = CallCaptionsGate.Open))).isNotNull()
    }
}
