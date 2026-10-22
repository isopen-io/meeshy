package me.meeshy.sdk.model.call

/** Ce qu'on enregistre (#8437). Une valeur absente (passerelle antérieure) ou inconnue se lit [AUDIO]. */
enum class CallRecordingKind(val wire: String) {
    AUDIO("audio"),
    VIDEO("video"),
    ;

    companion object {
        fun fromWire(raw: String?): CallRecordingKind = if (raw == VIDEO.wire) VIDEO else AUDIO
    }
}

/** `call:recording-requested` — chaque participant de [requiredUserIds] doit répondre avant [expiresAtMillis]. */
data class CallRecordingRequested(
    val callId: String,
    val recordingId: String,
    val requesterId: String,
    val requiredUserIds: List<String>,
    val kind: CallRecordingKind,
    val expiresAtMillis: Long?,
)

/** `call:recording-started` — tous ont consenti ; seul [recorderId] capte. */
data class CallRecordingStarted(
    val callId: String,
    val recordingId: String,
    val recorderId: String,
    val kind: CallRecordingKind,
)

/** `call:recording-stopped` — [reason] ∈ refused, timeout, participant-joined, stopped, requester-left, call-ended. */
data class CallRecordingStopped(
    val callId: String,
    val recordingId: String,
    val reason: String,
    val byUserId: String?,
    val wasRecording: Boolean,
)

sealed interface CallRecordingSocketEvent {
    val callId: String

    data class Requested(val event: CallRecordingRequested) : CallRecordingSocketEvent {
        override val callId: String get() = event.callId
    }

    data class Started(val event: CallRecordingStarted) : CallRecordingSocketEvent {
        override val callId: String get() = event.callId
    }

    data class Stopped(val event: CallRecordingStopped) : CallRecordingSocketEvent {
        override val callId: String get() = event.callId
    }
}

/** Le refus d'un verbe d'enregistrement : un `CALL_RECORDING_ERROR_CODES`, ou NO_SOCKET / TIMEOUT / MALFORMED_ACK. */
class CallRecordingRefusal(val code: String) : Exception(code) {

    enum class Reason { NOT_ALLOWED, CALL_ENDED, NO_PEER, ALREADY_PENDING, EXPIRED, LIMIT, OFFLINE, OTHER }

    val reason: Reason
        get() = when (code) {
            "NOT_AUTHENTICATED", "NOT_A_PARTICIPANT", "NOT_A_CONSENTER" -> Reason.NOT_ALLOWED
            "CALL_NOT_ACTIVE" -> Reason.CALL_ENDED
            "NO_PEER_TO_CONSENT" -> Reason.NO_PEER
            "RECORDING_ALREADY_PENDING" -> Reason.ALREADY_PENDING
            "RECORDING_NOT_FOUND", "RECORDING_NOT_PENDING", "RECORDING_EXPIRED" -> Reason.EXPIRED
            "RATE_LIMITED" -> Reason.LIMIT
            "NO_SOCKET", "TIMEOUT" -> Reason.OFFLINE
            else -> Reason.OTHER
        }

    override fun equals(other: Any?): Boolean = other is CallRecordingRefusal && other.code == code

    override fun hashCode(): Int = code.hashCode()
}

/**
 * L'état du consentement d'un enregistrement, côté appareil. FAIL-CLOSED : la capture
 * n'est permise que dans [Recording], et on n'y entre que depuis une demande [Pending]
 * connue, dont aucun participant requis n'a refusé (un `started` orphelin est ignoré).
 */
sealed interface CallRecordingConsentState {
    data object Idle : CallRecordingConsentState

    data class Pending(
        val request: CallRecordingRequested,
        val answers: Map<String, Boolean> = emptyMap(),
    ) : CallRecordingConsentState {
        val awaiting: List<String> get() = request.requiredUserIds.filter { it !in answers }
        val refused: Boolean get() = answers.values.any { !it }
    }

    data class Recording(val started: CallRecordingStarted) : CallRecordingConsentState

    data class Ended(val stopped: CallRecordingStopped) : CallRecordingConsentState
}

object CallRecordingConsent {

    fun onRequested(state: CallRecordingConsentState, event: CallRecordingRequested): CallRecordingConsentState =
        when (state) {
            is CallRecordingConsentState.Pending, is CallRecordingConsentState.Recording -> state
            else -> CallRecordingConsentState.Pending(event)
        }

    /** La réponse d'un participant requis, lue localement (la mienne) ou relayée. */
    fun onAnswer(state: CallRecordingConsentState, userId: String, accepted: Boolean): CallRecordingConsentState =
        if (state is CallRecordingConsentState.Pending && userId in state.request.requiredUserIds) {
            state.copy(answers = state.answers + (userId to accepted))
        } else {
            state
        }

    fun onStarted(state: CallRecordingConsentState, event: CallRecordingStarted): CallRecordingConsentState =
        if (state is CallRecordingConsentState.Pending &&
            state.request.recordingId == event.recordingId &&
            !state.refused
        ) {
            CallRecordingConsentState.Recording(event)
        } else {
            state
        }

    fun onStopped(state: CallRecordingConsentState, event: CallRecordingStopped): CallRecordingConsentState =
        when (state) {
            is CallRecordingConsentState.Pending ->
                if (state.request.recordingId == event.recordingId) CallRecordingConsentState.Ended(event) else state
            is CallRecordingConsentState.Recording ->
                if (state.started.recordingId == event.recordingId) CallRecordingConsentState.Ended(event) else state
            else -> state
        }

    /** Le délai de consentement est écoulé sans `stopped` : la demande expire (jamais d'enregistrement par défaut). */
    fun onTick(state: CallRecordingConsentState, nowMillis: Long): CallRecordingConsentState {
        if (state !is CallRecordingConsentState.Pending) return state
        val deadline = state.request.expiresAtMillis ?: return state
        if (nowMillis < deadline) return state
        return CallRecordingConsentState.Ended(
            CallRecordingStopped(
                callId = state.request.callId,
                recordingId = state.request.recordingId,
                reason = "timeout",
                byUserId = null,
                wasRecording = false,
            ),
        )
    }

    fun reduce(state: CallRecordingConsentState, event: CallRecordingSocketEvent): CallRecordingConsentState =
        when (event) {
            is CallRecordingSocketEvent.Requested -> onRequested(state, event.event)
            is CallRecordingSocketEvent.Started -> onStarted(state, event.event)
            is CallRecordingSocketEvent.Stopped -> onStopped(state, event.event)
        }

    /** Seul l'appareil désigné `recorder` capte, et seulement une fois l'enregistrement démarré. */
    fun mayCapture(state: CallRecordingConsentState, localUserId: String): Boolean =
        state is CallRecordingConsentState.Recording && state.started.recorderId == localUserId

    /** Le bandeau « Enregistrement » se lit pour tous dès que `started`. */
    fun isRecording(state: CallRecordingConsentState): Boolean = state is CallRecordingConsentState.Recording
}
