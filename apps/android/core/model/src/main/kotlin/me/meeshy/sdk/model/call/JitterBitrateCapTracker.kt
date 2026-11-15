package me.meeshy.sdk.model.call

/**
 * Hystérésis du plafond de débit audio piloté par la gigue : une rafale isolée sur un tick de 5 s ne
 * doit pas faire descendre l'encodeur Opus au plancher puis remonter au tick suivant (gazouillis
 * audible sur un lien sain). Deux ticks consécutifs au-dessus du seuil activent le plafond ; le
 * premier tick sous le seuil le lève. Port de iOS `JitterBitrateCapTracker`.
 */
data class JitterBitrateCapTracker(
    private val highJitterStreak: Int = 0,
    val isCapped: Boolean = false,
) {
    fun record(jitterMs: Double, thresholdMs: Double = CallQualityThresholds.HIGH_JITTER_MS): JitterBitrateCapTracker =
        if (jitterMs > thresholdMs) {
            val streak = highJitterStreak + 1
            JitterBitrateCapTracker(streak, isCapped = isCapped || streak >= CONSECUTIVE_TICKS_TO_ACTIVATE)
        } else {
            JitterBitrateCapTracker()
        }

    companion object {
        const val CONSECUTIVE_TICKS_TO_ACTIVATE: Int = 2
    }
}
