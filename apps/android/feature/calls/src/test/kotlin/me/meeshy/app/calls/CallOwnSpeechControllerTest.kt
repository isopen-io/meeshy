package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallCaptionsGate
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallParticipantLeftPayload
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallTranscriptEntry
import me.meeshy.sdk.model.call.CallTranscriptionActive
import me.meeshy.sdk.model.call.CallTranslatedSegmentPayload
import me.meeshy.sdk.model.call.DataChannelCodec
import me.meeshy.sdk.model.call.DataChannelInbound
import me.meeshy.sdk.model.call.OwnSpeechReadiness
import me.meeshy.sdk.model.call.OwnSpeechSupport
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.speech.CallSpeechEvent
import org.junit.Test

/**
 * #13718 — my words captioned on Android during the call and sent to my peers like iOS
 * (`CallManager.toggleTranscription`, `TranscriptionCapturePolicy`, `emitPartialEntry`,
 * `emitFinalSegment`), never in an end-to-end conversation.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallOwnSpeechControllerTest {
    private val listening = MutableSharedFlow<CallTranscriptionActive>(extraBufferCapacity = 8)
    private val muted = MutableStateFlow(false)
    private val heard = MutableSharedFlow<CallSpeechEvent>(extraBufferCapacity = 16)
    private val requestedTags = mutableListOf<String>()
    private val askedLanguages = mutableListOf<String>()
    private val sentToPeer = mutableListOf<CallTranscriptEntry>()
    private val relayed = mutableListOf<Pair<String, Map<String, Any?>>>()
    private val announced = mutableListOf<Pair<String, Boolean>>()
    private var sealedNow = false
    private val session = mockk<SessionRepository> {
        every { currentUser } returns MutableStateFlow<MeeshyUser?>(
            MeeshyUser(id = "me", username = "me", displayName = "Moi", systemLanguage = "fr"),
        )
    }
    private val info = CallSessionInfo(callId = "call-1", config = CallConfig.EMPTY.copy(peerId = "peer", peerName = "Ada", conversationId = "conv-1"))

    private class Harness(val captions: CallCaptionsController, val own: CallOwnSpeechController)

    private fun runHarness(
        endToEnd: Boolean? = false,
        readiness: OwnSpeechReadiness = OwnSpeechReadiness(OwnSpeechSupport.Available, "fr-FR"),
        block: suspend TestScope.(Harness) -> Unit,
    ) = runTest {
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        val captions = CallCaptionsController(
            wires = CallCaptionsWires(
                relayed = MutableSharedFlow<CallTranslatedSegmentPayload>(),
                dataChannel = MutableSharedFlow(),
                listeningPeers = listening,
                participantsLeft = MutableSharedFlow<CallParticipantLeftPayload>(),
            ) { id, active -> announced += id to active },
            session = session,
            regime = CallConversationRegime { endToEnd },
            notice = CallCaptionsRefusalNotice { },
            clock = { 5_000L },
            scope = scope,
        )
        var minted = 0
        val own = CallOwnSpeechController(
            wires = CallOwnSpeechWires(
                muted = muted,
                readiness = { language -> askedLanguages += language; readiness },
                capture = { tag -> requestedTags += tag; heard },
                sendToPeer = { bytes -> (DataChannelCodec.decode(bytes) as? DataChannelInbound.TranscriptEntry)?.let { sentToPeer += it.entry }; true },
                relay = { callId, segment -> relayed += callId to segment },
                sealedNow = { sealedNow },
            ),
            captions = captions,
            session = session,
            clock = { 10_000L + 1_000L * minted },
            mint = { "u${++minted}" },
            scope = scope,
        )
        val harness = Harness(captions, own)
        block(harness)
        own.onCleared()
        captions.onCleared()
    }

    private fun Harness.connected() {
        captions.onTransition(CallState.Idle, CallState.Connected, info)
        own.onTransition(CallState.Idle, CallState.Connected, info)
    }

    private val isCapturing: Boolean get() = heard.subscriptionCount.value > 0

    @Test
    fun `opening my captions captures my spoken language and my words reach the peer, the gateway and my journal`() = runHarness { h ->
        h.connected()
        h.captions.advance()

        heard.tryEmit(CallSpeechEvent.Partial("Bon"))
        heard.tryEmit(CallSpeechEvent.Final("Bonjour à tous", 0.9))

        assertThat(askedLanguages).containsExactly("fr")
        assertThat(requestedTags).containsExactly("fr-FR")
        assertThat(sentToPeer.map { it.id to it.isFinal }).containsExactly("u1" to false, "u1" to true).inOrder()
        assertThat(sentToPeer.map { it.text }).containsExactly("Bon", "Bonjour à tous").inOrder()
        assertThat(sentToPeer.all { it.callId == "call-1" && it.speakerId == "me" && it.language == "fr" && it.speakerDisplayName == "Moi" }).isTrue()
        assertThat(relayed).hasSize(1)
        assertThat(relayed.single().first).isEqualTo("call-1")
        assertThat(relayed.single().second).containsAtLeast("id", "u1", "text", "Bonjour à tous", "isFinal", true, "language", "fr")
        val mine = h.captions.state.value.journal.segments.single()
        assertThat(mine.speakerId).isEqualTo("me")
        assertThat(mine.text).isEqualTo("Bonjour à tous")
        assertThat(mine.isFinal).isTrue()
    }

    @Test
    fun `a peer who reads captions starts my capture with my panel closed, and muting my microphone stops it`() = runHarness { h ->
        h.connected()

        listening.tryEmit(CallTranscriptionActive("call-1", "peer", active = true))
        assertThat(isCapturing).isTrue()

        muted.value = true
        assertThat(isCapturing).isFalse()

        muted.value = false
        listening.tryEmit(CallTranscriptionActive("call-1", "peer", active = false))
        assertThat(isCapturing).isFalse()
    }

    @Test
    fun `serving a peer with my panel closed, my final still enters my journal`() = runHarness { h ->
        h.connected()
        listening.tryEmit(CallTranscriptionActive("call-1", "peer", active = true))

        heard.tryEmit(CallSpeechEvent.Partial("Bon"))
        heard.tryEmit(CallSpeechEvent.Final("Bonjour", 0.9))

        assertThat(sentToPeer.map { it.text }).containsExactly("Bon", "Bonjour").inOrder()
        assertThat(h.captions.state.value.journal.segments.map { it.text }).containsExactly("Bonjour")
    }

    @Test
    fun `an end-to-end conversation never captures my words, even when a peer asks`() = runHarness(endToEnd = true) { h ->
        h.connected()
        listening.tryEmit(CallTranscriptionActive("call-1", "peer", active = true))
        h.captions.advance()

        assertThat(requestedTags).isEmpty()
        assertThat(askedLanguages).isEmpty()
        assertThat(sentToPeer).isEmpty()
        assertThat(relayed).isEmpty()
    }

    @Test
    fun `a regime not read yet never captures either`() = runHarness(endToEnd = null) { h ->
        h.connected()
        listening.tryEmit(CallTranscriptionActive("call-1", "peer", active = true))

        assertThat(requestedTags).isEmpty()
    }

    @Test
    fun `a conversation learned sealed during the call stops the capture before anything leaves`() = runHarness { h ->
        h.connected()
        h.captions.advance()
        heard.tryEmit(CallSpeechEvent.Partial("Bon"))

        sealedNow = true
        heard.tryEmit(CallSpeechEvent.Final("Bonjour", 0.9))

        assertThat(sentToPeer.map { it.text }).containsExactly("Bon")
        assertThat(relayed).isEmpty()
        assertThat(isCapturing).isFalse()
        assertThat(h.captions.state.value.gate).isEqualTo(CallCaptionsGate.EndToEnd)
        assertThat(h.captions.state.value.isPanelOpen).isFalse()
        assertThat(announced.last()).isEqualTo("call-1" to false)
    }

    @Test
    fun `a device that cannot caption never captures, and the button says my words are not captioned`() =
        runHarness(readiness = OwnSpeechReadiness(OwnSpeechSupport.DeviceUnsupported, null)) { h ->
            h.connected()
            h.captions.advance()

            assertThat(requestedTags).isEmpty()
            assertThat(h.captions.state.value.ownSpeech).isEqualTo(OwnSpeechSupport.DeviceUnsupported)
            val chip = CallCaptionsChip.of(h.captions.state.value)
            assertThat(CallCaptionsPresenter.captions(chip).hintRes).isEqualTo(R.string.call_captions_local_unsupported)
        }

    @Test
    fun `a recognizer that turns out unable mid-call stops the capture and says why`() = runHarness { h ->
        h.connected()
        h.captions.advance()

        heard.tryEmit(CallSpeechEvent.Unavailable(OwnSpeechSupport.LanguageMissing))

        assertThat(isCapturing).isFalse()
        assertThat(CallCaptionsPresenter.captions(CallCaptionsChip.of(h.captions.state.value)).hintRes)
            .isEqualTo(R.string.call_captions_local_language_missing)
    }

    @Test
    fun `the end of the call stops the capture`() = runHarness { h ->
        h.connected()
        h.captions.advance()

        val ended = CallState.Ended(CallEndReason.Local)
        h.captions.onTransition(CallState.Connected, ended, info)
        h.own.onTransition(CallState.Connected, ended, info)

        assertThat(isCapturing).isFalse()
    }
}
