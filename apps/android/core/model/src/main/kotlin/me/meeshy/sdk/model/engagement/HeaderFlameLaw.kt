package me.meeshy.sdk.model.engagement

import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

/**
 * Ce que l'en-tête du fil montre de la Flamme (miroir de `HeaderFlameVisibility` et de
 * `HeaderFlameOrbit`, iOS #9031/#9044) : fonctions pures, sans horloge ni vue.
 */
object HeaderFlameLaw {

    /**
     * La flamme pend sous l'avatar REPLIÉ tant qu'une série court. L'en-tête déplié la porte déjà ;
     * un toucher la masque jusqu'au prochain dépliement.
     */
    fun isShown(headerExpanded: Boolean, dismissed: Boolean, hasEngagement: Boolean): Boolean =
        !headerExpanded && !dismissed && hasEngagement

    /** Déplier l'en-tête RENDRE la flamme (le masquage ne dure que jusque-là) ; replié, il tient. */
    fun dismissedAfterHeaderExpanded(expanded: Boolean, wasDismissed: Boolean): Boolean =
        if (expanded) false else wasDismissed

    /** Au rejeu d'un envoi : durée de la lueur, secondes. */
    const val DURATION_SECONDS: Double = 2.0

    /** La part de la durée où la valeur affichée reste tenue (le nouveau compte se révèle ensuite). */
    const val VALUE_RELEASE: Float = 0.82f

    /** Plus grand grossissement de la flamme à l'allumage. */
    const val PEAK_SCALE: Float = 1.6f

    private const val ORBIT_SHARE = 0.45f
    private const val IGNITION_END = 0.8f
    private const val MAX_GLOW_LENGTH = 0.32f

    /** La tête de la lueur autour de l'avatar, en degrés (90 = en bas), un tour lissé. */
    fun glowHeadDegrees(progress: Float): Float {
        val turn = min(clamped(progress) / ORBIT_SHARE, 1f)
        val eased = turn * turn * (3 - 2 * turn)
        return 90f + eased * 360f
    }

    /** La longueur de l'arc de lueur, en tour (0…0,32) : naît, grandit, s'éteint avec l'orbite. */
    fun glowLength(progress: Float): Float {
        val phase = clamped(progress)
        if (phase >= ORBIT_SHARE) return 0f
        return MAX_GLOW_LENGTH * sin(phase / ORBIT_SHARE * PI.toFloat())
    }

    fun glowOpacity(progress: Float): Float {
        val phase = clamped(progress)
        if (phase >= ORBIT_SHARE) return 0f
        return min(1f, sin(phase / ORBIT_SHARE * PI.toFloat()) * 3f)
    }

    /** La flamme s'éteint pendant l'orbite (jusqu'à 35 %), puis reprend toute sa clarté. */
    fun flameOpacity(progress: Float): Float {
        val phase = clamped(progress)
        if (phase >= ORBIT_SHARE) return 1f
        val dim = min(phase / ORBIT_SHARE / 0.3f, 1f)
        return 1f - 0.65f * (dim * dim * (3 - 2 * dim))
    }

    /** Le grossissement à l'allumage : 1 hors de la fenêtre d'allumage. */
    fun flameScale(progress: Float): Float {
        val burning = ignition(progress) ?: return 1f
        return 1f + (PEAK_SCALE - 1f) * sin(burning * PI.toFloat())
    }

    private fun ignition(progress: Float): Float? {
        val phase = clamped(progress)
        if (phase <= ORBIT_SHARE || phase >= IGNITION_END) return null
        return (phase - ORBIT_SHARE) / (IGNITION_END - ORBIT_SHARE)
    }

    private fun clamped(value: Float): Float = value.coerceIn(0f, 1f)
}
