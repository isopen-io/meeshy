package me.meeshy.sdk.model.ongoing

/**
 * **Ce que l'activité d'un vocal en lecture montre** — miroir de iOS `VoicePlaybackSnapshot`
 * (`MeeshyWidgets/VoicePlaybackActivityAttributes.swift`). La progression ne voyage pas à chaque
 * tic : la position est DATÉE ([anchorEpochMs]) et la vue la projette au débit [rate].
 */
data class VoicePlaybackPresentation(
    val messageId: String,
    val conversationId: String,
    val title: String,
    val subtitle: String,
    val initials: String,
    val accentHex: String,
    val isPlaying: Boolean,
    val positionMs: Long,
    val durationMs: Long,
    val rate: Double,
    val anchorEpochMs: Long,
    /** Code de langue de la piste jouée en majuscules (« FR »), `null` quand elle est inconnue. */
    val trackLanguage: String?,
    val isTranslatedTrack: Boolean,
    /** Le compteur « à suivre ». */
    val upNextCount: Int,
) {
    val fraction: Double
        get() = if (durationMs <= 0L) 0.0 else (positionMs.toDouble() / durationMs).coerceIn(0.0, 1.0)

    /** Où la barre a commencé : [positionMs] avant l'ancre, au débit courant. */
    val intervalStartEpochMs: Long
        get() = anchorEpochMs - (positionMs / safeRate).toLong()

    /** Où la barre finit, au débit courant ; jamais avant son début. */
    val intervalEndEpochMs: Long
        get() = maxOf(intervalStartEpochMs, anchorEpochMs + ((durationMs - positionMs).coerceAtLeast(0L) / safeRate).toLong())

    private val safeRate: Double get() = if (rate > 0.0) rate else 1.0
}
