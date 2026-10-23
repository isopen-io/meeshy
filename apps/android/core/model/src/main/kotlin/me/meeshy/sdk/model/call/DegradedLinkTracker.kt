package me.meeshy.sdk.model.call

/**
 * Garde de dégradation soutenue de la pastille « connexion instable ». Un tick de 5 s n'est pas un
 * mauvais appel : l'alerte n'apparaît qu'au deuxième tick dégradé consécutif (environ 10 s), un seul
 * tick sain l'efface aussitôt, et un niveau [VideoQualityLevel.FAIR] n'alerte jamais. Port de iOS
 * `DegradedLinkTracker`. Valeur immuable : [record] rend le suivi suivant.
 */
data class DegradedLinkTracker(
    private val degradedStreak: Int = 0,
    val isDegraded: Boolean = false,
) {
    fun record(level: VideoQualityLevel): DegradedLinkTracker = when (level) {
        VideoQualityLevel.POOR, VideoQualityLevel.CRITICAL -> {
            val streak = degradedStreak + 1
            DegradedLinkTracker(streak, isDegraded = isDegraded || streak >= CONSECUTIVE_TICKS_TO_ALERT)
        }
        VideoQualityLevel.EXCELLENT, VideoQualityLevel.GOOD, VideoQualityLevel.FAIR -> DegradedLinkTracker()
    }

    companion object {
        const val CONSECUTIVE_TICKS_TO_ALERT: Int = 2
    }
}
