package me.meeshy.sdk.model.call

/** Le résultat d'une réduction : le nouvel état, l'ordre donné à la capture, l'arrêt à signaler à la passerelle. */
data class CallRecordingReduction(
    val state: CallRecordingState,
    val capture: CallRecordingCapture = CallRecordingCapture.None,
    /** `(callId, recordingId)` à passer à `call:recording-stop`, ou `null`. */
    val emitStopFor: Pair<String, String>? = null,
)

/**
 * Les règles du consentement à l'enregistrement, miroir de `call-recording.ts` (web) et de
 * `CallRecordingController` (iOS). Rien ne démarre sur décision locale : seule la diffusion qui
 * nomme CET utilisateur enregistreur allume la capture ; toute diffusion d'arrêt l'éteint ;
 * une diffusion d'un autre appel est ignorée.
 */
object CallRecordingRules {
    const val CONSENT_TIMEOUT_MILLIS: Long = 30_000L

    fun isEndToEnd(encryptionMode: String?): Boolean = encryptionMode?.trim()?.lowercase() == "e2ee"

    fun admission(connected: Boolean, callId: String?, endToEnd: Boolean): CallRecordingAdmission = when {
        !connected || callId.isNullOrBlank() -> CallRecordingAdmission.NotEstablished
        endToEnd -> CallRecordingAdmission.EndToEnd
        else -> CallRecordingAdmission.Allowed
    }

    fun onSocketEvent(
        state: CallRecordingState,
        event: CallRecordingSocketEvent,
        activeCallId: String?,
        viewerId: String?,
    ): CallRecordingReduction {
        if (activeCallId == null || event.callId != activeCallId) return CallRecordingReduction(state)
        return when (event) {
            is CallRecordingSocketEvent.Requested -> CallRecordingReduction(requested(state, event.event, viewerId))
            is CallRecordingSocketEvent.Started -> started(state, event.event, viewerId)
            is CallRecordingSocketEvent.Stopped -> stopped(state, event.event)
        }
    }

    private fun requested(state: CallRecordingState, event: CallRecordingRequested, viewerId: String?): CallRecordingState {
        val mine = viewerId != null && event.requesterId == viewerId
        return state.copy(
            kind = event.kind,
            phase = CallRecordingPhase.Pending(
                callId = event.callId,
                recordingId = event.recordingId,
                requesterId = event.requesterId,
                mine = mine,
                mustAnswer = !mine && viewerId != null && viewerId in event.requiredUserIds,
            ),
        )
    }

    private fun started(state: CallRecordingState, event: CallRecordingStarted, viewerId: String?): CallRecordingReduction {
        val mine = viewerId != null && event.recorderId == viewerId
        val begins = mine && state.capturingRecordingId == null
        return CallRecordingReduction(
            state = state.copy(
                kind = event.kind,
                phase = CallRecordingPhase.Recording(event.callId, event.recordingId, event.recorderId, mine),
                capturingRecordingId = if (begins) event.recordingId else state.capturingRecordingId,
            ),
            capture = if (begins) CallRecordingCapture.Begin(event.callId, event.recordingId, event.kind) else CallRecordingCapture.None,
        )
    }

    private fun stopped(state: CallRecordingState, event: CallRecordingStopped): CallRecordingReduction {
        val known = state.phase.recordingId == event.recordingId || state.capturingRecordingId == event.recordingId
        if (!known) return CallRecordingReduction(state)
        return CallRecordingReduction(
            state = state.copy(
                phase = CallRecordingPhase.Idle,
                notice = CallRecordingNotice.Stopped(event.reason, event.wasRecording),
                capturingRecordingId = null,
            ),
            capture = finishIfCapturing(state),
        )
    }

    /** Ouvre la demande ; `null` si une autre est déjà en cours ou s'il n'y a pas d'appel. */
    fun ask(state: CallRecordingState, callId: String?, kind: CallRecordingKind): CallRecordingState? =
        if (state.phase != CallRecordingPhase.Idle || callId.isNullOrBlank()) {
            null
        } else {
            state.copy(phase = CallRecordingPhase.Asking(callId), kind = kind, notice = null)
        }

    fun askAccepted(state: CallRecordingState, callId: String, recordingId: String, viewerId: String): CallRecordingState =
        if (state.phase == CallRecordingPhase.Asking(callId)) {
            state.copy(phase = CallRecordingPhase.Pending(callId, recordingId, viewerId, mine = true, mustAnswer = false))
        } else {
            state
        }

    fun askRefused(state: CallRecordingState, callId: String, code: String): CallRecordingState =
        if (state.phase == CallRecordingPhase.Asking(callId)) {
            state.copy(phase = CallRecordingPhase.Idle, notice = CallRecordingNotice.Unavailable(code))
        } else {
            state
        }

    fun refusedEndToEnd(state: CallRecordingState): CallRecordingState =
        state.copy(notice = CallRecordingNotice.EndToEndRefused)

    fun mayAnswer(state: CallRecordingState): Boolean = (state.phase as? CallRecordingPhase.Pending)?.mustAnswer == true

    fun answered(state: CallRecordingState): CallRecordingState {
        val phase = state.phase as? CallRecordingPhase.Pending ?: return state
        return state.copy(phase = phase.copy(mustAnswer = false))
    }

    fun stop(state: CallRecordingState): CallRecordingReduction {
        val phase = state.phase
        return when (phase) {
            CallRecordingPhase.Idle -> CallRecordingReduction(state)
            is CallRecordingPhase.Asking ->
                CallRecordingReduction(state.copy(phase = CallRecordingPhase.Idle))
            is CallRecordingPhase.Pending -> stopTarget(state, phase.callId, phase.recordingId)
            is CallRecordingPhase.Recording -> stopTarget(state, phase.callId, phase.recordingId)
        }
    }

    private fun stopTarget(state: CallRecordingState, callId: String, recordingId: String) = CallRecordingReduction(
        state = state.copy(
            phase = CallRecordingPhase.Idle,
            notice = CallRecordingNotice.Stopped("stopped", state.phase.isRecording),
            capturingRecordingId = null,
        ),
        capture = finishIfCapturing(state),
        emitStopFor = callId to recordingId,
    )

    fun callEnded(state: CallRecordingState): CallRecordingReduction = CallRecordingReduction(
        state = state.copy(phase = CallRecordingPhase.Idle, capturingRecordingId = null),
        capture = finishIfCapturing(state),
    )

    /** La capture n'a pas pu démarrer : on abandonne et on le dit à la passerelle. */
    fun captureFailed(state: CallRecordingState): CallRecordingReduction {
        val phase = state.phase as? CallRecordingPhase.Recording ?: return CallRecordingReduction(state)
        return CallRecordingReduction(
            state = state.copy(phase = CallRecordingPhase.Idle, notice = CallRecordingNotice.SaveFailed, capturingRecordingId = null),
            emitStopFor = phase.callId to phase.recordingId,
        )
    }

    fun withNotice(state: CallRecordingState, notice: CallRecordingNotice?): CallRecordingState = state.copy(notice = notice)

    private fun finishIfCapturing(state: CallRecordingState): CallRecordingCapture =
        if (state.capturingRecordingId != null) CallRecordingCapture.Finish else CallRecordingCapture.None
}
