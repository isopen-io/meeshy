package me.meeshy.sdk.model.call

/**
 * Où en est l'enregistrement de l'appel, vu de cet appareil (miroir de `CallRecordingPhase`
 * iOS et de `call-recording.ts`). La passerelle est l'autorité : on n'entre dans [Recording]
 * que par la diffusion `call:recording-started`.
 */
sealed interface CallRecordingPhase {
    data object Idle : CallRecordingPhase

    data class Asking(val callId: String) : CallRecordingPhase

    /** [mustAnswer] : ce lecteur est un consentant requis qui n'a pas encore répondu. */
    data class Pending(
        val callId: String,
        val recordingId: String,
        val requesterId: String,
        val mine: Boolean,
        val mustAnswer: Boolean,
    ) : CallRecordingPhase

    data class Recording(
        val callId: String,
        val recordingId: String,
        val recorderId: String,
        val mine: Boolean,
    ) : CallRecordingPhase

    val recordingId: String?
        get() = when (this) {
            is Pending -> recordingId
            is Recording -> recordingId
            Idle, is Asking -> null
        }

    val isActive: Boolean get() = this != Idle

    val isRecording: Boolean get() = this is Recording
}

/** Les pastilles d'avis qui suivent une fin ou un échec ; le texte est choisi par l'écran. */
sealed interface CallRecordingNotice {
    /** [reason] ∈ refused, timeout, participant-joined, stopped, requester-left, call-ended. */
    data class Stopped(val reason: String, val wasRecording: Boolean) : CallRecordingNotice

    data class Unavailable(val code: String) : CallRecordingNotice

    data object Saved : CallRecordingNotice

    data object SaveFailed : CallRecordingNotice

    /** Conversation chiffrée de bout en bout : la demande est refusée, jamais de repli en clair. */
    data object EndToEndRefused : CallRecordingNotice
}

/** Ce que la capture doit faire à la suite d'une réduction. */
sealed interface CallRecordingCapture {
    data object None : CallRecordingCapture

    data class Begin(val callId: String, val recordingId: String, val kind: CallRecordingKind) : CallRecordingCapture

    data object Finish : CallRecordingCapture
}

/** L'état du contrôleur : la phase, le type demandé, l'avis, et la capture réellement en cours. */
data class CallRecordingState(
    val phase: CallRecordingPhase = CallRecordingPhase.Idle,
    val kind: CallRecordingKind = CallRecordingKind.AUDIO,
    val notice: CallRecordingNotice? = null,
    val capturingRecordingId: String? = null,
)

enum class CallRecordingAdmission { Allowed, NotEstablished, EndToEnd }
