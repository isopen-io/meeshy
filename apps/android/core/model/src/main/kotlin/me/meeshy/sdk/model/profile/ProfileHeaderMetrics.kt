package me.meeshy.sdk.model.profile

/**
 * Métriques pures de l'en-tête repliable — miroir de `ProfileHeaderMetrics.swift` et des
 * interpolations de `UserProfileSheet+Header.swift` (`bigCollapsibleHeader`, `pinnedTabBar`,
 * `compactPinnedBar`). `offset` est signé : négatif quand le contenu défile vers le haut.
 */
object ProfileHeaderMetrics {
    const val EXPANDED_BANNER_DP: Float = 130f
    const val COLLAPSED_BAR_DP: Float = 52f
    const val COLLAPSE_DISTANCE_DP: Float = 120f

    /** Part d'opacité que la bannière perd une fois repliée (`1 - progress * 0.6`). */
    const val BANNER_FADE: Float = 0.6f

    /** Part de taille que l'identité perd une fois repliée (`1 - 0.12 * progress`). */
    const val IDENTITY_SHRINK: Float = 0.12f

    /** Au-delà de ce seuil, la barre compacte prend le relais de l'identité étendue. */
    const val COMPACT_HANDOFF: Float = 0.5f

    /** 0 = déplié, 1 = replié ; borné et monotone. */
    fun progress(offset: Float): Float =
        minOf(1f, maxOf(0f, -offset) / COLLAPSE_DISTANCE_DP)

    /**
     * Le défilement (positif, en dp) d'une liste dont l'en-tête est le premier élément : dès que
     * l'en-tête a quitté l'écran, le repli est complet.
     */
    fun scrolledDp(firstVisibleIndex: Int, firstVisibleOffsetDp: Float): Float =
        if (firstVisibleIndex > 0) COLLAPSE_DISTANCE_DP else maxOf(0f, firstVisibleOffsetDp)

    /** La hauteur de la bannière : de [EXPANDED_BANNER_DP] à [COLLAPSED_BAR_DP]. */
    fun bannerHeightDp(progress: Float): Float =
        EXPANDED_BANNER_DP - (EXPANDED_BANNER_DP - COLLAPSED_BAR_DP) * clamp(progress)

    fun bannerAlpha(progress: Float): Float = 1f - BANNER_FADE * clamp(progress)

    fun identityScale(progress: Float): Float = 1f - IDENTITY_SHRINK * clamp(progress)

    fun identityAlpha(progress: Float): Float = 1f - clamp(progress)

    /** Le retrait haut des onglets épinglés : ils glissent sous la barre compacte. */
    fun tabBarTopInsetDp(progress: Float): Float = COLLAPSED_BAR_DP * clamp(progress)

    /** Vrai quand la barre compacte est l'identité principale (touchable, lue par TalkBack). */
    fun compactBarOwnsIdentity(progress: Float): Boolean = clamp(progress) > COMPACT_HANDOFF

    private fun clamp(progress: Float): Float = progress.coerceIn(0f, 1f)
}
