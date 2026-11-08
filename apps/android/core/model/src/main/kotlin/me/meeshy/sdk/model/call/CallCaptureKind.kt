package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable

/**
 * Ce que le journal d'un appel retient d'une capture (#16665) — miroir d'iOS
 * `CallTranscriptCaptureKind`. Une capture d'écran ou un enregistrement d'écran
 * nomme son auteur ; une borne de l'enregistrement de l'appel ne nomme personne.
 */
enum class CallCaptureKind(val wire: String) {
    SCREENSHOT("screenshot"),
    RECORDING("recording"),
    CALL_RECORDING_STARTED("call-recording-started"),
    CALL_RECORDING_STOPPED("call-recording-stopped"),
    ;

    val namesCapturer: Boolean get() = this == SCREENSHOT || this == RECORDING

    companion object {
        /** Une sorte inconnue (passerelle plus récente) ne se devine pas : `null`, la ligne n'est pas montrée. */
        fun fromWire(raw: String?): CallCaptureKind? = entries.firstOrNull { it.wire == raw }

        /** L'alerte d'une passerelle antérieure ne porte pas de sorte : elle parle d'un enregistrement d'écran. */
        fun ofAlert(raw: String?): CallCaptureKind = if (raw == SCREENSHOT.wire) SCREENSHOT else RECORDING
    }
}

/**
 * Une capture gardée par le journal persisté (`captures` de `GET /calls/{callId}/transcript`),
 * à côté des `segments`. [at] est l'instant ISO ; [offsetMs] le décalage depuis le début de l'appel.
 */
@Serializable
data class PersistedTranscriptCapture(
    val id: String,
    val participantId: String = "",
    val userId: String? = null,
    val displayName: String? = null,
    val kind: String,
    val offsetMs: Long = 0,
    val at: String? = null,
)
