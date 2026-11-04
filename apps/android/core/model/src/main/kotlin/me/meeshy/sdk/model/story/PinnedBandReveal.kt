package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics

/**
 * La révélation de la bande d'anneaux compacte qui prend la place du titre (iOS `PinnedStoryTrailBand`).
 * La courbe est celle de l'en-tête repliable ([CollapsibleHeaderMetrics.inlineAccessoryReveal]) : le titre
 * s'efface et la bande apparaît sur EXACTEMENT les mêmes dp, jamais deux jeux de constantes.
 */
data class PinnedBandReveal(val fraction: Float) {

    /** Garde de PERFORMANCE : au repos, aucun anneau n'est matérialisé. */
    val isMaterialized: Boolean get() = fraction > MATERIALIZE_ABOVE

    /** La hauteur suit la révélation : la fente du titre n'est pas assez haute au début de la bascule. */
    val heightDp: Float get() = if (isMaterialized) BAND_HEIGHT_DP * fraction else 0f

    val acceptsTouches: Boolean get() = fraction > TOUCH_ABOVE

    companion object {
        const val BAND_HEIGHT_DP: Float = CollapsibleHeaderMetrics.INLINE_ACCESSORY_HEIGHT
        const val RING_DP: Float = 36f
        const val MATERIALIZE_ABOVE: Float = 0.001f
        const val TOUCH_ABOVE: Float = 0.6f

        /** Six cellules au plus (iOS : la bande tient dans la fente du titre) : l'utilisateur, puis cinq anneaux. */
        const val MAX_ENTRIES: Int = 6
        const val MAX_OTHER_ENTRIES: Int = MAX_ENTRIES - 1

        fun <T> visibleOthers(others: List<T>): List<T> = others.take(MAX_OTHER_ENTRIES)

        fun of(scrollOffsetDp: Float): PinnedBandReveal =
            PinnedBandReveal(CollapsibleHeaderMetrics.inlineAccessoryReveal(scrollOffsetDp))

        /**
         * Décalage négatif de la convention iOS (0 au repos) depuis l'état d'une liste : passé le premier
         * élément, le plateau est entièrement sous l'en-tête, la bande est donc entièrement révélée.
         */
        fun scrollOffsetDp(firstVisibleItemIndex: Int, firstVisibleItemOffsetDp: Float): Float =
            if (firstVisibleItemIndex > 0) -CollapsibleHeaderMetrics.INLINE_ACCESSORY_REVEAL_END
            else 0f - firstVisibleItemOffsetDp
    }
}
