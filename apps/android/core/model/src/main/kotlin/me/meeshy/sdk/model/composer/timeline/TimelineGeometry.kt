package me.meeshy.sdk.model.composer.timeline

/**
 * Le contrat pixels-par-seconde de toutes les vues de la timeline (miroir de
 * `TimelineGeometry.swift`). Pur et déterministe : jamais de métrique d'écran.
 */
data class TimelineGeometry(val zoomScale: Float) {

    val effectiveZoom: Float get() = maxOf(MIN_ZOOM, zoomScale)

    val pixelsPerSecond: Float get() = BASE_PIXELS_PER_SECOND * effectiveZoom

    fun x(time: Float): Float = time * pixelsPerSecond

    fun time(x: Float): Float = x / pixelsPerSecond

    fun width(duration: Float): Float = duration * pixelsPerSecond

    /** 6 points de doigt, recalculés au zoom courant. */
    val snapToleranceSeconds: Float get() = 6f / pixelsPerSecond

    /** Tolérance d'un glissement de clip : 8 points de doigt, plafonnés à [MAX_SNAP_TOLERANCE_SECONDS]. */
    val dragSnapToleranceSeconds: Float get() = minOf(8f / pixelsPerSecond, MAX_SNAP_TOLERANCE_SECONDS)

    companion object {
        const val BASE_PIXELS_PER_SECOND: Float = 50f
        const val MIN_ZOOM: Float = 0.05f

        /** Plafond absolu de l'aimantation, en secondes, à tout zoom. */
        const val MAX_SNAP_TOLERANCE_SECONDS: Float = 0.25f

        /**
         * Fenêtre d'affichage d'un clip : un élément permanent (durée absente ou
         * <= 0) est visible jusqu'à la fin de la slide.
         */
        fun effectiveClipDuration(startTime: Float, duration: Float?, slideDuration: Float): Float {
            if (duration != null && duration > 0f) return duration
            return maxOf(0f, slideDuration - maxOf(0f, startTime))
        }
    }
}
