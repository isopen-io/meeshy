package me.meeshy.app.calls

import android.content.Context
import androidx.annotation.StringRes
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import dagger.multibindings.IntoSet
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.WebRtcEngine
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallCaptionReader
import me.meeshy.sdk.model.call.CallCaptionsGate
import me.meeshy.sdk.model.call.CallCaptionsState
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallJournalSegment
import me.meeshy.sdk.model.call.CallParticipantLeftPayload
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallTranscriptionActive
import me.meeshy.sdk.model.call.CallTranslatedSegmentPayload
import me.meeshy.sdk.model.call.CaptionsMode
import me.meeshy.sdk.model.call.DataChannelCodec
import me.meeshy.sdk.model.call.DataChannelInbound
import me.meeshy.sdk.model.call.OwnSpeechSupport
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.icons.MeeshyIcons
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** The regime of the call's conversation: `true` sealed end to end, `false` clear, `null` not known (yet). */
fun interface CallConversationRegime {
    suspend fun isEndToEnd(conversationId: String): Boolean?

    /** Ticks when what [isEndToEnd] would say may have changed — the call reads it again (#13725). */
    fun changes(conversationId: String): Flow<Unit> = emptyFlow()
}

/**
 * The ledger first (a sealed conversation is never forgotten), then what the gateway served. The cached
 * conversation changing its regime — or landing in the cache at all — is a change worth reading again.
 */
@Singleton
class LedgerCallConversationRegime @Inject constructor(
    private val ledger: EndToEndRegimeLedger,
    private val conversations: ConversationRepository,
) : CallConversationRegime {
    override suspend fun isEndToEnd(conversationId: String): Boolean? {
        if (conversationId.isBlank()) return null
        if (ledger.isSealed(conversationId)) return true
        val known = conversations.cachedById(conversationId)
            ?: (conversations.getById(conversationId) as? NetworkResult.Success)?.data
            ?: return null
        return EndToEndRegime.isEndToEnd(known.encryptionMode)
    }

    override fun changes(conversationId: String): Flow<Unit> =
        if (conversationId.isBlank()) {
            emptyFlow()
        } else {
            conversations.conversationStream(conversationId)
                .map { it?.let { known -> known.encryptionMode.orEmpty() } }
                .distinctUntilChanged()
                .drop(1)
                .map { }
        }
}

/** Tells the user why the captions do not open (a local-action feedback). */
fun interface CallCaptionsRefusalNotice {
    fun refused(gate: CallCaptionsGate)
}

@Singleton
class ToastCallCaptionsRefusalNotice @Inject constructor(
    @ApplicationContext private val context: Context,
    private val toasts: CallToastBus,
) : CallCaptionsRefusalNotice {
    override fun refused(gate: CallCaptionsGate) {
        val res = if (gate == CallCaptionsGate.EndToEnd) R.string.call_captions_end_to_end else R.string.call_captions_unavailable
        toasts.info(context.getString(res))
    }
}

/** Where the captions come from and where the listening intent goes: seams, so the controller is testable. */
class CallCaptionsWires(
    val relayed: Flow<CallTranslatedSegmentPayload>,
    val dataChannel: Flow<ByteArray>,
    val listeningPeers: Flow<CallTranscriptionActive>,
    val participantsLeft: Flow<CallParticipantLeftPayload>,
    val announceListening: (callId: String, active: Boolean) -> Unit,
)

/**
 * The live captions of the call (iOS `CallTranscriptionService` + `CallManager+Transcription`, the
 * reception half). The reader opens the panel with « Sous-titres »: the peers are told
 * (`call:transcription-active`), so an iPhone starts transcribing ITS microphone for them; its words
 * arrive peer-to-peer on the data channel (`transcript-entry`, partials included) and translated
 * through the gateway (`call:translated-segment`), merged into ONE line per utterance.
 *
 * Fail-closed (#9224): an end-to-end conversation never opens the captions — announcing the
 * panel would make the peer send its words in clear to the gateway — and a regime not read yet
 * neither. A regime that could not be read is read again on a tap of « Sous-titres » (once per tap)
 * and when it changes during the call (#13725). The state lives for one call and dies with it.
 *
 * My own words are captured by [CallOwnSpeechController] (#13718), which reads this state and
 * hands my lines back through [receiveOwn].
 */
@Singleton
class CallCaptionsController internal constructor(
    private val wires: CallCaptionsWires,
    private val session: SessionRepository,
    private val regime: CallConversationRegime,
    private val notice: CallCaptionsRefusalNotice,
    private val clock: () -> Long,
    private val scope: CoroutineScope,
) : CallFeatureController {

    @Inject
    constructor(
        signals: CallSignalManager,
        social: CallSocialSignalManager,
        engine: WebRtcEngine,
        session: SessionRepository,
        regime: LedgerCallConversationRegime,
        notice: ToastCallCaptionsRefusalNotice,
    ) : this(
        wires = CallCaptionsWires(
            relayed = signals.translatedSegments,
            dataChannel = engine.dataChannelMessages,
            listeningPeers = social.transcriptionActive,
            participantsLeft = signals.participantLeft,
            announceListening = social::emitTranscriptionActive,
        ),
        session = session,
        regime = regime,
        notice = notice,
        clock = System::currentTimeMillis,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    )

    private val _state = MutableStateFlow(CallCaptionsState())
    val state: StateFlow<CallCaptionsState> = _state.asStateFlow()

    private val _journalRequests = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** The band's « Journal » button: the screen opens the journal panel. */
    val journalRequests: SharedFlow<Unit> = _journalRequests.asSharedFlow()

    @Volatile private var callId: String = ""
    private var peerName: String = ""
    @Volatile private var peerId: String = ""
    private var conversationId: String = ""
    private var publishedListening = false
    private var listening: List<Job> = emptyList()
    private var resolving: Job? = null
    private var regimeChanges: Job? = null

    /** A tap asked for the captions while the regime was being read again: open them if it reads clear. */
    private var opensOnRead = false

    /** Who reads, for the projection of the lines. */
    val reader: CallCaptionReader
        get() {
            val user = session.currentUser.value
            return CallCaptionReader(
                userId = user?.id,
                name = user?.effectiveDisplayName,
                prism = if (user == null) listOfNotNull(Locale.getDefault().language.ifBlank { null }) else ReaderPrism.resolve(user, Locale.getDefault()),
            )
        }

    /** The other side of a duo, the name a peer's line carries first. */
    val peerDisplayName: String get() = peerName

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when (next) {
            is CallState.Ended, CallState.Idle -> reset()
            else -> {
                callId = session.callId.ifBlank { callId }
                peerName = session.config.peerName
                peerId = session.config.peerId.ifBlank { peerId }
                if (listening.isEmpty()) listening = listen()
                resolveGate(session.config.conversationId)
            }
        }
    }

    /** The gateway does not replay `transcription-active` to a newcomer: say it again. */
    override fun onRemoteEvent(event: CallEvent, session: CallSessionInfo) {
        if (event !is CallEvent.ParticipantJoined) return
        peerId = peerId.ifBlank { event.peerId.orEmpty() }
        val target = callId.ifBlank { return }
        if (publishedListening) wires.announceListening(target, true)
    }

    override fun onCleared() = reset()

    /**
     * One tap on « Sous-titres ». A regime that could not be read is read again first (#13725); a closed gate
     * says why instead of opening.
     */
    fun advance() {
        val before = _state.value
        if (before.mode == CaptionsMode.Off && !before.gate.allowsCaptions) {
            if (!before.gate.readsAgainOnTap) return notice.refused(before.gate)
            opensOnRead = true
            if (resolving?.isActive != true) readRegime()
            return
        }
        _state.update { it.advanced() }
        publishListening()
    }

    fun toggleReveal(key: String) = _state.update { it.togglingReveal(key) }

    fun setShowsOriginal(showsOriginal: Boolean) = _state.update { it.copy(showsOriginal = showsOriginal) }

    fun openJournal() {
        _journalRequests.tryEmit(Unit)
    }

    /** One of MY lines, captioned on this device: my finals enter my journal even while my panel is closed. */
    fun receiveOwn(segment: CallJournalSegment) = _state.update { it.receivingOwn(segment) }

    /** Whether this device can caption my words: the button and the journal say it when it cannot. */
    fun setOwnSpeech(support: OwnSpeechSupport) = _state.update { it.copy(ownSpeech = support) }

    /**
     * The device learned during the call that the conversation is sealed end to end: the panel
     * closes, the peers are told I stopped reading, and nothing more leaves (fail-closed, #13720).
     */
    fun closeForEndToEnd() {
        _state.update { it.gated(CallCaptionsGate.EndToEnd) }
        publishListening()
    }

    private fun listen(): List<Job> =
        listOf(
            wires.relayed.onEach { payload ->
                if (payload.callId != callId) return@onEach
                CallJournalSegment.fromRelay(payload.segment, clock())?.let(::receive)
            },
            wires.dataChannel.onEach { bytes ->
                val entry = (DataChannelCodec.decode(bytes) as? DataChannelInbound.TranscriptEntry)?.entry ?: return@onEach
                if (entry.callId != callId) return@onEach
                CallJournalSegment.fromPeerEntry(entry, peerId, session.currentUser.value?.id)?.let(::receive)
            },
            wires.listeningPeers.onEach { event ->
                if (event.callId != callId) return@onEach
                val self = session.currentUser.value?.id
                _state.update { it.copy(listeners = it.listeners.applying(event.speakerId, event.active, self)) }
            },
            wires.participantsLeft.onEach { left ->
                if (left.callId != callId) return@onEach
                val who = left.userId ?: left.participantId ?: return@onEach
                _state.update { it.copy(listeners = it.listeners.leaving(who)) }
            },
        ).map { it.launchIn(scope) }

    private fun receive(segment: CallJournalSegment) = _state.update { it.receiving(segment) }

    private fun resolveGate(conversationId: String) {
        if (conversationId == this.conversationId && (_state.value.gate != CallCaptionsGate.Unresolved || resolving?.isActive == true)) return
        if (conversationId != this.conversationId) watchRegime(conversationId)
        this.conversationId = conversationId
        readRegime()
    }

    /** The conversation's regime changed (or landed) during the call: read it again, unless end to end closed it. */
    private fun watchRegime(conversationId: String) {
        regimeChanges?.cancel()
        regimeChanges = regime.changes(conversationId)
            .onEach { if (_state.value.gate != CallCaptionsGate.EndToEnd) readRegime() }
            .launchIn(scope)
    }

    private fun readRegime() {
        val conversation = conversationId
        resolving?.cancel()
        resolving = scope.launch {
            val sealed = try {
                regime.isEndToEnd(conversation)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "captions: conversation regime unreadable — closed")
                null
            }
            _state.update { it.gated(it.gate.reading(conversation, sealed)) }
            publishListening()
            settleTap()
        }
    }

    /** The read a tap asked for has landed: the captions open if the gate did, otherwise the tap is told why. */
    private fun settleTap() {
        if (!opensOnRead) return
        opensOnRead = false
        val gate = _state.value.gate
        if (!gate.allowsCaptions) return notice.refused(gate)
        if (_state.value.mode != CaptionsMode.Off) return
        _state.update { it.advanced() }
        publishListening()
    }

    /**
     * The peers learn that I READ captions — never that anything is captured. Only the panel's
     * edges are news, and a closed gate never announces.
     */
    private fun publishListening() {
        val target = callId.ifBlank { return }
        val reads = _state.value.isPanelOpen && _state.value.gate.allowsCaptions
        if (reads == publishedListening) return
        publishedListening = reads
        wires.announceListening(target, reads)
    }

    private fun reset() {
        listening.forEach(Job::cancel)
        listening = emptyList()
        resolving?.cancel()
        resolving = null
        regimeChanges?.cancel()
        regimeChanges = null
        opensOnRead = false
        callId = ""
        peerName = ""
        peerId = ""
        conversationId = ""
        publishedListening = false
        _state.value = CallCaptionsState()
    }
}

/** What the call screen needs from the captions to draw its controls — folded into [CallUiState]. */
data class CallCaptionsChip(
    val mode: CaptionsMode = CaptionsMode.Off,
    val invitesToOpen: Boolean = false,
    val gate: CallCaptionsGate = CallCaptionsGate.Unresolved,
    val ownSpeech: OwnSpeechSupport = OwnSpeechSupport.Unknown,
) {
    companion object {
        fun of(state: CallCaptionsState): CallCaptionsChip = CallCaptionsChip(state.mode, state.invitesToOpen, state.gate, state.ownSpeech)
    }
}

/** What the captions say when this device cannot caption my words, `null` when it can (or does not know yet). */
@StringRes
fun OwnSpeechSupport.notCaptionedRes(): Int? = when (this) {
    OwnSpeechSupport.DeviceUnsupported -> R.string.call_captions_local_unsupported
    OwnSpeechSupport.LanguageMissing -> R.string.call_captions_local_language_missing
    OwnSpeechSupport.Unknown, OwnSpeechSupport.Available -> null
}

/**
 * « Sous-titres » in the call's row: Désactivés → Traduction → Texte original. Lit while captions are
 * shown; a peer who reads captions while mine are off is told in the hint (iOS invitation). In an
 * end-to-end conversation it stays, and says why it does not open.
 */
@Singleton
class CallCaptionsActionHandler @Inject constructor(
    private val captions: CallCaptionsController,
) : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? =
        if (state.status == CallStatus.CONNECTED) CallCaptionsPresenter.captions(state.captions) else null

    override fun perform() = captions.advance()
}

/** « Journal » in the call's row: every sentence of the call, in a sheet the screen opens. */
@Singleton
class CallCaptionsJournalActionHandler @Inject constructor() : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? =
        if (state.status == CallStatus.CONNECTED) CallCaptionsPresenter.journal(state.captions) else null

    override fun perform() = Unit
}

/** The two buttons, pure. */
object CallCaptionsPresenter {
    fun captions(chip: CallCaptionsChip): CallActionPresentation = CallActionPresentation(
        icon = MeeshyIcons.Subtitles,
        labelRes = R.string.call_captions_title,
        isActive = chip.mode != CaptionsMode.Off,
        hintRes = when {
            chip.gate == CallCaptionsGate.EndToEnd -> R.string.call_captions_end_to_end
            chip.invitesToOpen -> R.string.call_captions_peer_active
            chip.ownSpeech.saysNotCaptioned -> chip.ownSpeech.notCaptionedRes()
            chip.mode == CaptionsMode.Translated -> R.string.call_captions_state_translated
            chip.mode == CaptionsMode.Original -> R.string.call_captions_state_original
            else -> R.string.call_captions_state_off
        },
    )

    /** Absent where captions cannot exist: an end-to-end call has no journal to open. */
    fun journal(chip: CallCaptionsChip): CallActionPresentation? =
        if (chip.gate.allowsCaptions) {
            CallActionPresentation(MeeshyIcons.ListChecklist, R.string.call_captions_journal_title, hintRes = R.string.call_captions_journal_hint)
        } else {
            null
        }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallCaptionsCapabilityModule {
    @Binds
    @IntoSet
    fun bindFeatureController(impl: CallCaptionsController): CallFeatureController

    @Binds
    @IntoSet
    fun bindOverlay(impl: CallCaptionsBandOverlay): CallOverlay

    @Binds
    @IntoMap
    @CallActionKey(CallAction.Captions)
    fun bindCaptionsHandler(impl: CallCaptionsActionHandler): CallActionHandler

    @Binds
    @IntoMap
    @CallActionKey(CallAction.Journal)
    fun bindJournalHandler(impl: CallCaptionsJournalActionHandler): CallActionHandler
}
