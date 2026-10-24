package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.sdk.model.call.CallInviteOutcome
import me.meeshy.sdk.model.call.CallInviteSettled
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.CallLiveFrameSelected
import me.meeshy.sdk.model.call.CallLiveFrameTexts
import me.meeshy.sdk.model.call.CallMutedByModerator
import me.meeshy.sdk.model.call.CallParticipantInvited
import me.meeshy.sdk.model.call.CallPreviewRequested
import me.meeshy.sdk.model.call.CallPreviewSignal
import me.meeshy.sdk.model.call.CallQualityFeedback
import me.meeshy.sdk.model.call.CallReactionEmoji
import me.meeshy.sdk.model.call.CallReactionReceived
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.sdk.model.call.CallSignalEnvelope
import me.meeshy.sdk.model.call.CallSocialEventParser
import me.meeshy.sdk.model.call.CallTranscriptionActive
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les événements SOCIAUX d'un appel, entrants et sortants : invitations, modération,
 * réactions, enregistrement avec consentement, cadre en direct, aperçu avant décroché,
 * sous-titres, partage d'écran, retour de qualité. Tout vit ici pour que
 * [CallSignalManager] n'ait qu'une ligne de délégation.
 *
 * Les flux sont chauds, sans rejeu ; chaque charge porte son `callId`, que le
 * consommateur filtre. Une charge inconnue ou malformée est ignorée sans crash.
 * Toute émission est ignorable par une passerelle ancienne.
 */
@Singleton
class CallSocialSignalManager @Inject constructor(
    private val socketManager: SocketManager,
) {
    private val controls = CallControlsSocket(socketManager)
    private val recording = CallRecordingSocket(socketManager)
    private val liveFrame = CallLiveFrameSocket(controls)
    private val preview = CallPreviewSocket(socketManager)

    private fun <T> hot(buffer: Int = 16) = MutableSharedFlow<T>(replay = 0, extraBufferCapacity = buffer)

    private val _participantInvited = hot<CallParticipantInvited>()
    val participantInvited: SharedFlow<CallParticipantInvited> = _participantInvited.asSharedFlow()

    private val _inviteSettled = hot<CallInviteSettled>()

    /** Refus ou expiration d'une invitation ; [CallInviteSettled.outcome] les distingue. */
    val inviteSettled: SharedFlow<CallInviteSettled> = _inviteSettled.asSharedFlow()

    private val _mutedByModerator = hot<CallMutedByModerator>()
    val mutedByModerator: SharedFlow<CallMutedByModerator> = _mutedByModerator.asSharedFlow()

    private val _reactions = hot<CallReactionReceived>(64)
    val reactionReceived: SharedFlow<CallReactionReceived> = _reactions.asSharedFlow()

    private val _recordingEvents = hot<CallRecordingSocketEvent>()
    val recordingEvents: SharedFlow<CallRecordingSocketEvent> = _recordingEvents.asSharedFlow()

    private val _frameSelected = hot<CallLiveFrameSelected>()
    val frameSelected: SharedFlow<CallLiveFrameSelected> = _frameSelected.asSharedFlow()

    private val _previewRequested = hot<CallPreviewRequested>()
    val previewRequested: SharedFlow<CallPreviewRequested> = _previewRequested.asSharedFlow()

    private val _previewSignals = hot<CallSignalEnvelope>(128)
    val previewSignals: SharedFlow<CallSignalEnvelope> = _previewSignals.asSharedFlow()

    private val _transcriptionActive = hot<CallTranscriptionActive>()
    val transcriptionActive: SharedFlow<CallTranscriptionActive> = _transcriptionActive.asSharedFlow()

    fun attach() {
        route(SocketEventNames.CALL_PARTICIPANT_INVITED) { raw -> CallSocialEventParser.participantInvited(raw)?.let(_participantInvited::tryEmit) }
        route(SocketEventNames.CALL_INVITE_DECLINED) { raw ->
            CallSocialEventParser.inviteSettled(raw, CallInviteOutcome.DECLINED)?.let(_inviteSettled::tryEmit)
        }
        route(SocketEventNames.CALL_INVITE_EXPIRED) { raw ->
            CallSocialEventParser.inviteSettled(raw, CallInviteOutcome.EXPIRED)?.let(_inviteSettled::tryEmit)
        }
        route(SocketEventNames.CALL_MUTED_BY_MODERATOR) { raw -> CallSocialEventParser.mutedByModerator(raw)?.let(_mutedByModerator::tryEmit) }
        route(SocketEventNames.CALL_REACTION_RECEIVED) { raw -> CallSocialEventParser.reactionReceived(raw)?.let(_reactions::tryEmit) }
        route(SocketEventNames.CALL_RECORDING_REQUESTED) { raw ->
            CallSocialEventParser.recordingRequested(raw)?.let { _recordingEvents.tryEmit(CallRecordingSocketEvent.Requested(it)) }
        }
        route(SocketEventNames.CALL_RECORDING_STARTED) { raw ->
            CallSocialEventParser.recordingStarted(raw)?.let { _recordingEvents.tryEmit(CallRecordingSocketEvent.Started(it)) }
        }
        route(SocketEventNames.CALL_RECORDING_STOPPED) { raw ->
            CallSocialEventParser.recordingStopped(raw)?.let { _recordingEvents.tryEmit(CallRecordingSocketEvent.Stopped(it)) }
        }
        route(SocketEventNames.CALL_FRAME_SELECTED) { raw -> CallSocialEventParser.frameSelected(raw)?.let(_frameSelected::tryEmit) }
        route(SocketEventNames.CALL_PREVIEW_REQUESTED) { raw -> CallSocialEventParser.previewRequested(raw)?.let(_previewRequested::tryEmit) }
        route(SocketEventNames.CALL_PREVIEW_SIGNAL) { raw -> CallSocialEventParser.previewSignal(raw)?.let(_previewSignals::tryEmit) }
        route(SocketEventNames.CALL_TRANSCRIPTION_ACTIVE) { raw -> CallSocialEventParser.transcriptionActive(raw)?.let(_transcriptionActive::tryEmit) }
    }

    private fun route(event: String, handle: (String) -> Unit) {
        socketManager.on(event) { args ->
            val raw = (args.firstOrNull() as? JSONObject)?.toString() ?: return@on
            try {
                handle(raw)
            } catch (error: Exception) {
                Timber.w(error, "call social event dropped: %s", event)
            }
        }
    }

    // --- Contrôles à accusé : null d'erreur = accepté, sinon CallControlRefusal / CallRecordingRefusal ---

    suspend fun inviteCallParticipant(callId: String, userId: String): Result<Unit> = controls.invite(callId, userId)

    suspend fun muteCallParticipant(callId: String, targetUserId: String): Result<Unit> = controls.mute(callId, targetUserId)

    suspend fun sendCallReaction(callId: String, emoji: CallReactionEmoji): Result<Unit> = controls.react(callId, emoji)

    suspend fun requestCallRecording(callId: String, kind: CallRecordingKind = CallRecordingKind.AUDIO): Result<String> =
        recording.request(callId, kind)

    suspend fun answerCallRecording(callId: String, recordingId: String, accepted: Boolean): Result<Unit> =
        recording.answer(callId, recordingId, accepted)

    suspend fun stopCallRecording(callId: String, recordingId: String): Result<Unit> = recording.stop(callId, recordingId)

    suspend fun selectCallLiveFrame(
        callId: String,
        frameId: String?,
        texts: CallLiveFrameTexts? = null,
        reply: CallLiveFrameReply? = null,
    ): Result<Unit> = liveFrame.select(callId, frameId, texts, reply)

    // --- Aperçu avant décroché ---

    fun requestCallPreview(callId: String) = preview.request(callId)

    fun emitCallPreviewSignal(signal: CallPreviewSignal) = preview.signal(signal)

    fun emitCallPreviewSignal(
        callId: String,
        type: String,
        from: String,
        to: String,
        negotiationId: Int,
        fields: Map<String, Any?> = emptyMap(),
    ) = preview.signal(CallPreviewSignal(callId, type, from, to, negotiationId, fields))

    // --- Fire-and-forget ---

    /** Sous-titres : le segment est celui de `CallTranscriptionSegmentEvent.segment`. */
    fun emitTranscriptionSegment(callId: String, segment: Map<String, Any?>) {
        val inner = JSONObject()
        segment.forEach { (key, value) -> inner.put(key, value ?: JSONObject.NULL) }
        socketManager.emit(SocketEventNames.CALL_TRANSCRIPTION_SEGMENT, JSONObject().put("callId", callId).put("segment", inner))
    }

    fun emitTranscriptionActive(callId: String, active: Boolean) =
        socketManager.emit(SocketEventNames.CALL_TRANSCRIPTION_ACTIVE, JSONObject().put("callId", callId).put("active", active))

    /** Partage d'écran : accompagne la capture MediaProjection ; les autres le lisent sur `call:media-toggled` (`screen`). */
    fun emitToggleScreen(callId: String, enabled: Boolean) =
        socketManager.emit(SocketEventNames.CALL_TOGGLE_SCREEN, JSONObject().put("callId", callId).put("enabled", enabled))

    /** La note d'après-appel (cases + étoiles). */
    fun emitQualityFeedback(feedback: CallQualityFeedback) {
        val payload = JSONObject()
        feedback.socketFields().forEach { (key, value) ->
            payload.put(key, if (value is List<*>) org.json.JSONArray(value) else value)
        }
        socketManager.emit(SocketEventNames.CALL_QUALITY_FEEDBACK, payload)
    }
}
