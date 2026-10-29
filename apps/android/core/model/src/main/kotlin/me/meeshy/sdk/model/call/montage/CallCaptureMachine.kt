package me.meeshy.sdk.model.call.montage

/** L'issue d'une capture d'appel, miroir de `CallCaptureStatus` (iOS). */
public sealed interface CallCaptureStatus {
    public data object Idle : CallCaptureStatus
    public data object Working : CallCaptureStatus
    public data object Saved : CallCaptureStatus
    public data class FacesSaved(val count: Int) : CallCaptureStatus
    public data object VideoSaved : CallCaptureStatus
    public data object Denied : CallCaptureStatus
    public data object NoVideo : CallCaptureStatus
    public data object Failed : CallCaptureStatus

    /** `null` tant qu'il n'y a rien à dire ; sinon, si l'issue se dit comme une erreur. */
    public val isError: Boolean?
        get() = when (this) {
            Idle, Working -> null
            Saved, VideoSaved, is FacesSaved -> false
            Denied, NoVideo, Failed -> true
        }
}

/** Ce que l'écran lit de la capture : l'issue, le compteur de flashs, et l'instant où le film a démarré (`null` hors film). */
public data class CallCaptureState(
    val status: CallCaptureStatus = CallCaptureStatus.Idle,
    val flashCount: Int = 0,
    val recordingStartedAtMillis: Long? = null,
) {
    val isRecording: Boolean get() = recordingStartedAtMillis != null
    val isWorking: Boolean get() = status == CallCaptureStatus.Working
}

/**
 * **LES GARDES DE LA CAPTURE** — celles de `CallCaptureController` (iOS), en fonctions pures : une prise à
 * la fois, un flash par prise, aucune photo pendant le film, un seul film, et l'issue qui s'efface après
 * [STATUS_DISPLAY_MILLIS] sauf si une autre l'a remplacée. `null` : la transition est refusée.
 */
public object CallCaptureMachine {
    public const val STATUS_DISPLAY_MILLIS: Long = 2_500L

    public fun shoot(state: CallCaptureState): CallCaptureState? {
        if (state.isWorking || state.isRecording) return null
        return state.copy(status = CallCaptureStatus.Working, flashCount = state.flashCount + 1)
    }

    public fun recordingStarted(state: CallCaptureState, nowMillis: Long): CallCaptureState? {
        if (state.isRecording || state.isWorking) return null
        return state.copy(status = CallCaptureStatus.Idle, recordingStartedAtMillis = nowMillis)
    }

    public fun recordingStopped(state: CallCaptureState): CallCaptureState? {
        if (!state.isRecording) return null
        return state.copy(status = CallCaptureStatus.Working, recordingStartedAtMillis = null)
    }

    public fun finished(state: CallCaptureState, outcome: CallCaptureStatus): CallCaptureState = state.copy(status = outcome)

    public fun settled(state: CallCaptureState, shown: CallCaptureStatus): CallCaptureState =
        if (state.status == shown) state.copy(status = CallCaptureStatus.Idle) else state
}
