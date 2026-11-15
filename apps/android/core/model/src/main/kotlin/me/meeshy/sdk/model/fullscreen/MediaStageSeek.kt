package me.meeshy.sdk.model.fullscreen

/** Le double tap latéral d'une vidéo : −10 s à gauche, +10 s à droite (tiers latéraux), rien au centre pour ne pas retarder le tap simple. */
public object MediaStageSeek {
    public const val STEP_SECONDS: Double = 10.0
    public const val LATERAL_FRACTION: Float = 1f / 3f

    public enum class Zone { Backward, Center, Forward }

    public data class Jump(val zone: Zone, val from: Double, val to: Double) {
        public val seconds: Double get() = to - from
    }

    public fun lateralWidth(width: Float): Float = if (width > 0f) width * LATERAL_FRACTION else 0f

    public fun zone(x: Float, width: Float): Zone {
        if (width <= 0f) return Zone.Center
        val lateral = lateralWidth(width)
        return when {
            x < lateral -> Zone.Backward
            x >= width - lateral -> Zone.Forward
            else -> Zone.Center
        }
    }

    /** `null` sans durée (le double tap reste alors au zoom d'une image) ou au centre ; sinon la cible bornée à `[0, duration]`. */
    public fun resolve(x: Float, width: Float, position: Double, duration: Double, step: Double = STEP_SECONDS): Jump? {
        if (duration <= 0.0 || !duration.isFinite()) return null
        val zone = zone(x, width)
        if (zone == Zone.Center) return null
        val from = (if (position.isFinite()) position else 0.0).coerceIn(0.0, duration)
        val target = if (zone == Zone.Backward) from - step else from + step
        return Jump(zone, from, target.coerceIn(0.0, duration))
    }
}
