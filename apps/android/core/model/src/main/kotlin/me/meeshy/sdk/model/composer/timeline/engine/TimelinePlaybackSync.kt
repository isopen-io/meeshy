package me.meeshy.sdk.model.composer.timeline.engine

/** Statut de l'item vidéo de l'aperçu, tel que le lecteur le rapporte. */
enum class VideoItemStatus { UNKNOWN, READY, FAILED }

/** Le départ de la vidéo selon l'état de son item (miroir de `TimelinePlaybackSync.VideoStart`, #9884). */
enum class VideoStart { ANCHORED, AWAITING_READINESS, UNANCHORED }

/**
 * Loi d'horloge de l'aperçu du composer (miroir de `TimelinePlaybackSync`, #9702) : UNE ancre en temps hôte, partagée par
 * la vidéo, l'audio et l'horloge interne des slides sans vidéo. Le temps hôte est le temps monotone en NANOSECONDES
 * (`SystemClock.elapsedRealtimeNanos`) ; toute somme sature à `Long.MAX_VALUE` au lieu de déborder.
 */
object TimelinePlaybackSync {

    /** Marge entre la décision de jouer et l'instant commun : le premier tampon audio et la première image. */
    const val DEFAULT_LEAD_SECONDS: Double = 0.05

    private const val NANOS_PER_SECOND = 1_000_000_000.0

    fun anchorNanos(nowNanos: Long, leadSeconds: Double = DEFAULT_LEAD_SECONDS): Long =
        saturatingAdd(nowNanos, nanos(leadSeconds))

    /**
     * Instant où un clip qui commence à [clipStartSeconds] doit partir quand la lecture reprend à [playheadSeconds] à
     * l'[anchorNanos]. Un clip déjà commencé part À l'ancre.
     */
    fun clipStartNanos(anchorNanos: Long, clipStartSeconds: Double, playheadSeconds: Double): Long =
        saturatingAdd(anchorNanos, nanos(clipStartSeconds - playheadSeconds))

    /** Tête de l'horloge interne : DÉRIVÉE du temps écoulé depuis l'ancre, jamais accumulée tick après tick. */
    fun internalClockPlayhead(origin: Float, anchorSeconds: Double, nowSeconds: Double, duration: Float): Float {
        val elapsed = maxOf(0.0, nowSeconds - anchorSeconds)
        return minOf(duration, origin + elapsed.toFloat())
    }

    fun videoStart(status: VideoItemStatus?): VideoStart = when (status) {
        VideoItemStatus.READY -> VideoStart.ANCHORED
        VideoItemStatus.FAILED -> VideoStart.UNANCHORED
        VideoItemStatus.UNKNOWN, null -> VideoStart.AWAITING_READINESS
    }

    /** Délai en nanosecondes ; 0 pour un délai négatif, nul ou non fini, [Long.MAX_VALUE] au-delà de la plage. */
    fun nanos(delaySeconds: Double): Long {
        if (!delaySeconds.isFinite() || delaySeconds <= 0.0) return 0L
        val value = delaySeconds * NANOS_PER_SECOND
        return if (value >= Long.MAX_VALUE.toDouble()) Long.MAX_VALUE else value.toLong()
    }

    private fun saturatingAdd(lhs: Long, rhs: Long): Long =
        if (rhs > Long.MAX_VALUE - lhs) Long.MAX_VALUE else lhs + rhs
}
