package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.playback.MediaResumeMerge

/**
 * **La barre de reprise d'une vidéo** (iOS `MediaConsumptionProgressBar`) : la fraction déjà regardée, tirée du magasin
 * local ou, à défaut, de la consommation servie par la passerelle ; `null` — rien à dessiner — sous [THRESHOLD].
 */
public object VideoResumeBar {
    public const val THRESHOLD: Double = 0.01

    public fun fraction(localFraction: Double?, served: MeeshyMediaConsumption?, totalDurationSeconds: Double): Double? {
        val resting = MediaResumeMerge.restingFraction(
            localFraction = localFraction,
            served = served,
            medium = MediaResumeMerge.Medium.Video,
            totalMs = (totalDurationSeconds * 1000).toLong(),
        ).coerceIn(0.0, 1.0)
        return resting.takeIf { it > THRESHOLD }
    }
}
