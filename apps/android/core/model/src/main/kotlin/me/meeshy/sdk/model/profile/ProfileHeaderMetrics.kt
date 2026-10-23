package me.meeshy.sdk.model.profile

/**
 * Métriques pures de l'en-tête repliable — miroir de `ProfileHeaderMetrics.swift`.
 * `offset` est signé : négatif quand le contenu défile vers le haut.
 */
object ProfileHeaderMetrics {
    const val EXPANDED_BANNER_DP: Float = 130f
    const val COLLAPSED_BAR_DP: Float = 52f
    const val COLLAPSE_DISTANCE_DP: Float = 120f

    /** 0 = déplié, 1 = replié ; borné et monotone. */
    fun progress(offset: Float): Float =
        minOf(1f, maxOf(0f, -offset) / COLLAPSE_DISTANCE_DP)
}
