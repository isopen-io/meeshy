package me.meeshy.sdk.model.analytics.v2

/** Un cadre en pixels ou dp, dans le repère de la fenêtre. Pur : aucun type Android. */
data class MeasuredRect(val left: Double, val top: Double, val right: Double, val bottom: Double) {
    val width: Double get() = right - left
    val height: Double get() = bottom - top
}

/**
 * L'impression VISIBLE au sens IAB / MRC : au moins 50 % de la surface visible pendant 1 s
 * CONTINUE (2 s pour une vidéo en lecture). Le compteur d'impressions ne change pas : `viewable`
 * qualifie l'impression, il ne la conditionne jamais.
 *
 * Aucune horloge : les millisecondes sont fournies par l'appelant. Miroir de `ViewabilityMeter.swift`.
 */
class ViewabilityMeter(val isVideo: Boolean = false) {
    var maxVisibleFraction: Double = 0.0
        private set
    private var visibleSinceMs: Int? = null
    private var visibleAccumulatedMs = 0
    private var qualifyingSinceMs: Int? = null
    private var reachedViewable = false

    private val thresholdMs: Int get() = if (isVideo) VIDEO_THRESHOLD_MS else DISPLAY_THRESHOLD_MS

    /** La fraction visible a changé à [atMs] (0 = hors écran). */
    fun note(fraction: Double, atMs: Int) {
        val clamped = SocialEventV2Wire.fraction(fraction)
        maxVisibleFraction = maxOf(maxVisibleFraction, clamped)
        reachedViewable = settled(atMs)
        if (clamped > 0) {
            visibleSinceMs = visibleSinceMs ?: atMs
        } else {
            visibleSinceMs?.let { visibleAccumulatedMs += maxOf(0, atMs - it) }
            visibleSinceMs = null
        }
        qualifyingSinceMs = if (clamped >= MIN_FRACTION) qualifyingSinceMs ?: atMs else null
    }

    fun isViewable(atMs: Int): Boolean = settled(atMs)

    fun visibleMs(atMs: Int): Int = visibleAccumulatedMs + (visibleSinceMs?.let { maxOf(0, atMs - it) } ?: 0)

    fun measure(atMs: Int, impressionEventId: String? = null): SocialVisibility =
        SocialVisibility(
            maxVisibleFraction = maxVisibleFraction,
            visibleMs = visibleMs(atMs),
            viewable = isViewable(atMs),
            impressionEventId = impressionEventId,
        )

    private fun settled(atMs: Int): Boolean =
        reachedViewable || qualifyingSinceMs?.let { atMs - it >= thresholdMs } == true

    companion object {
        const val MIN_FRACTION = 0.5
        const val DISPLAY_THRESHOLD_MS = 1_000
        const val VIDEO_THRESHOLD_MS = 2_000

        /** Le pas de la part relayée par une cellule : 5 %. */
        const val FRACTION_STEP_PERCENT = 5

        /** La part d'un cadre dans la fenêtre visible, 0…1. */
        fun visibleFraction(frame: MeasuredRect, viewport: MeasuredRect): Double {
            val area = frame.width * frame.height
            if (area <= 0.0) return 0.0
            val overlapWidth = minOf(frame.right, viewport.right) - maxOf(frame.left, viewport.left)
            val overlapHeight = minOf(frame.bottom, viewport.bottom) - maxOf(frame.top, viewport.top)
            if (overlapWidth <= 0.0 || overlapHeight <= 0.0) return 0.0
            return overlapWidth * overlapHeight / area
        }

        /**
         * La même part ramenée au palier de 5 % : pendant un défilement, une cellule ne relaie que
         * ses changements de palier. Les seuils du MRC (0 et 50 %) tombent sur un palier.
         */
        fun steppedFraction(frame: MeasuredRect, viewport: MeasuredRect): Double {
            val percent = Math.floor(visibleFraction(frame, viewport) * 100 + 1e-9).toInt()
            return (percent / FRACTION_STEP_PERCENT * FRACTION_STEP_PERCENT) / 100.0
        }
    }
}
