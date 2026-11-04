package me.meeshy.sdk.model

/**
 * **La hauteur de la transcription attendue, réservée au premier rendu** — miroir de `AudioTranscriptionPending` (iOS
 * D-AUDIO-03, #4950). Un vocal reçu depuis moins de [NOMINAL_TIMEOUT_MS] sans transcription réserve la place de son bloc
 * (un squelette) : la bulle ne saute pas quand le texte arrive. Passé ce délai, l'échec est acquis — pas de squelette
 * éternel. Un brouillon local (`file://`) se transcrit sur l'appareil ; une date inconnue ne réserve rien.
 */
public object AudioTranscriptionPending {

    public const val NOMINAL_TIMEOUT_MS: Long = 90_000L

    public fun shouldReserveHeight(
        hasTranscription: Boolean,
        receivedAtEpochMs: Long?,
        nowEpochMs: Long,
        isLocalDraft: Boolean,
    ): Boolean {
        if (hasTranscription || isLocalDraft || receivedAtEpochMs == null) return false
        return nowEpochMs - receivedAtEpochMs < NOMINAL_TIMEOUT_MS
    }
}
