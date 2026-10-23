package me.meeshy.ui.component.chrome

import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics

/**
 * Convertit la position de defilement d'une page en decalage NEGATIF en dp (convention iOS : 0 au
 * repos, plus negatif quand le contenu monte) consomme par [CollapsibleHeader].
 */
object CollapsibleHeaderPageProgress {

    fun scrollOffsetDp(scrollValuePx: Int, density: Float): Float {
        if (density <= 0f) return 0f
        return -(scrollValuePx.coerceAtLeast(0) / density)
    }

    /**
     * Pour une liste paresseuse dont le premier element est l'espace reserve sous l'en-tete : tant que
     * l'indice premier est > 0, l'en-tete est replie pour de bon (jamais reouvert par un element ulterieur).
     */
    fun lazyOffsetDp(firstVisibleItemIndex: Int, firstVisibleItemScrollOffsetPx: Int, density: Float): Float {
        if (firstVisibleItemIndex > 0) return -CollapsibleHeaderMetrics.EXPANDED_HEIGHT
        return scrollOffsetDp(firstVisibleItemScrollOffsetPx, density)
    }
}
