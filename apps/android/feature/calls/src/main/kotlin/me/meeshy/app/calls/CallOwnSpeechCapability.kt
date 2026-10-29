package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.call.CallCaptionsState
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.DataChannelCodec
import me.meeshy.sdk.model.call.OwnSpeechCaptureAction
import me.meeshy.sdk.model.call.OwnSpeechCapturePolicy
import me.meeshy.sdk.model.call.OwnSpeechEmission
import me.meeshy.sdk.model.call.OwnSpeechLanguage
import me.meeshy.sdk.model.call.OwnSpeechReadiness
import me.meeshy.sdk.model.call.OwnSpeechStream
import me.meeshy.sdk.model.call.OwnSpeechSupport
import me.meeshy.sdk.model.call.OwnSpeechVoice
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.sdk.speech.CallSpeechCapture
import me.meeshy.sdk.speech.CallSpeechEvent
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Where my words come from and where they go: seams, so the controller is testable. */
class CallOwnSpeechWires(
    val muted: Flow<Boolean>,
    val readiness: suspend (language: String) -> OwnSpeechReadiness,
    val capture: (recognizerTag: String) -> Flow<CallSpeechEvent>,
    val sendToPeer: (ByteArray) -> Boolean,
    val relay: (callId: String, segment: Map<String, Any?>) -> Unit,
    val sealedNow: (conversationId: String) -> Boolean,
)

/**
 * My words captioned during the call (#13718) — iOS `CallManager.toggleTranscription` +
 * `CallTranscriptionService`, the capture half. A device transcribes only its OWN microphone, so it
 * captures as soon as someone listens: my panel, or a peer who announced `call:transcription-active`
 * ([OwnSpeechCapturePolicy]); never while muted. Each revision goes to the peer on the data channel
 * (`transcript-entry`), each final also to the gateway (`call:transcription-segment`, which
 * translates it per listener) and into my own journal.
 *
 * Fail-closed (#9224, #13720): an end-to-end conversation, or one whose regime is not read, never
 * captures; a conversation learned sealed during the call stops it before anything leaves. A device
 * that cannot caption (before Android 13, no on-device recognizer, no model for my language) says it
 * — the peer's captions keep working.
 */
@Singleton
class CallOwnSpeechController internal constructor(
    private val wires: CallOwnSpeechWires,
    private val captions: CallCaptionsController,
    private val session: SessionRepository,
    private val clock: () -> Long,
    private val mint: () -> String,
    private val scope: CoroutineScope,
) : CallFeatureController {

    @Inject
    constructor(
        holder: ActiveCallSnapshotHolder,
        capture: CallSpeechCapture,
        engine: WebRtcEngine,
        social: CallSocialSignalManager,
        ledger: EndToEndRegimeLedger,
        captions: CallCaptionsController,
        session: SessionRepository,
    ) : this(
        wires = CallOwnSpeechWires(
            muted = holder.snapshot.map { it?.isMuted == true },
            readiness = capture::readiness,
            capture = capture::capture,
            sendToPeer = engine::sendDataChannelMessage,
            relay = social::emitTranscriptionSegment,
            sealedNow = ledger::isSealed,
        ),
        captions = captions,
        session = session,
        clock = System::currentTimeMillis,
        mint = { UUID.randomUUID().toString().lowercase() },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    )

    private var callId = ""
    private var conversationId = ""
    private var language = ""
    private var recognizerTag: String? = null
    private var stream: OwnSpeechStream? = null
    private var watching: Job? = null
    private var resolving: Job? = null
    private var capturing: Job? = null

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when {
            next is CallState.Ended || next == CallState.Idle -> reset()
            next.carriesMedia -> {
                callId = session.callId.ifBlank { callId }
                conversationId = session.config.conversationId.ifBlank { conversationId }
                if (watching == null) {
                    watching = combine(captions.state, wires.muted) { state, muted -> state to muted }
                        .onEach { (state, muted) -> reconcile(state, muted) }
                        .launchIn(scope)
                }
            }
            else -> Unit
        }
    }

    override fun onCleared() = reset()

    private fun reconcile(state: CallCaptionsState, muted: Boolean) {
        if (state.gate.allowsCaptions && state.ownSpeech == OwnSpeechSupport.Unknown) resolveSupport()
        val action = OwnSpeechCapturePolicy.action(
            localPanelOpen = state.isPanelOpen,
            peerListening = state.listeners.isAnyPeerListening,
            isCapturing = capturing != null,
            isMicrophoneMuted = muted,
            gate = state.gate,
            support = state.ownSpeech,
        )
        when (action) {
            OwnSpeechCaptureAction.Start -> start()
            OwnSpeechCaptureAction.Stop -> stop()
            OwnSpeechCaptureAction.None -> Unit
        }
    }

    /** Once per call: my spoken language, then whether this device has its model. */
    private fun resolveSupport() {
        if (resolving != null) return
        language = OwnSpeechLanguage.spoken(session.currentUser.value, Locale.getDefault().language)
        val spoken = language
        resolving = scope.launch {
            val readiness = try {
                wires.readiness(spoken)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "own captions: recognition support unreadable")
                OwnSpeechReadiness(OwnSpeechSupport.DeviceUnsupported, null)
            }
            recognizerTag = readiness.tag
            captions.setOwnSpeech(readiness.support)
        }
    }

    private fun start() {
        val tag = recognizerTag ?: return
        val target = callId.ifBlank { return }
        val user = session.currentUser.value ?: return
        stream = OwnSpeechStream(OwnSpeechVoice(target, user.id, user.effectiveDisplayName, language))
        capturing = wires.capture(tag).onEach(::heard).launchIn(scope)
    }

    private fun stop() {
        capturing?.cancel()
        capturing = null
        stream = null
    }

    private fun heard(event: CallSpeechEvent) {
        val current = stream ?: return
        val (next, emission) = when (event) {
            is CallSpeechEvent.Partial -> current.partial(event.text, clock(), mint)
            is CallSpeechEvent.Final -> current.final(event.text, event.confidence, clock(), mint)
            is CallSpeechEvent.Unavailable -> return captions.setOwnSpeech(event.support)
        }
        stream = next
        emission?.let(::send)
    }

    private fun send(emission: OwnSpeechEmission) {
        if (!mayLeave()) return
        wires.sendToPeer(DataChannelCodec.encodeTranscriptEntry(emission.entry))
        emission.relay?.let { wires.relay(emission.entry.callId, it.fields()) }
        captions.receiveOwn(emission.journal)
    }

    /** The gate is read again before every revision: a conversation sealed meanwhile stops everything. */
    private fun mayLeave(): Boolean {
        if (!captions.state.value.gate.allowsCaptions || conversationId.isBlank()) {
            stop()
            return false
        }
        if (wires.sealedNow(conversationId)) {
            stop()
            captions.closeForEndToEnd()
            return false
        }
        return true
    }

    private fun reset() {
        stop()
        watching?.cancel()
        watching = null
        resolving?.cancel()
        resolving = null
        recognizerTag = null
        callId = ""
        conversationId = ""
        language = ""
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallOwnSpeechCapabilityModule {
    @Binds
    @IntoSet
    fun bindFeatureController(impl: CallOwnSpeechController): CallFeatureController
}
