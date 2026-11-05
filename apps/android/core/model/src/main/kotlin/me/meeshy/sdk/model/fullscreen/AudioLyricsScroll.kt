package me.meeshy.sdk.model.fullscreen

import kotlin.math.roundToInt

/**
 * **Où défiler pour que le mot dit se pose à l'ancre de la bande** (iOS `proxy.scrollTo(id, anchor:)`, `MediaTranscriptionView`) :
 * le point du segment situé à la fraction [anchor] de sa hauteur vient à la fraction [anchor] de la bande visible.
 * `0` colle le haut du segment au haut de la bande, `0,5` le centre, `1` le bas.
 *
 * Pure : l'écran mesure ([itemTop] depuis le haut du contenu, [itemHeight], [viewport]) et applique le décalage rendu.
 * Les paroles du plein écran passent [AudioFullscreenLayout.lyricAnchor] — le premier tiers de la bande libre —, la carte
 * de la bulle `0,5`.
 */
public object AudioLyricsScroll {

    /** Le décalage de défilement (px), borné à `[0, maxScroll]` : on ne défile jamais au-delà du contenu. */
    public fun target(itemTop: Float, itemHeight: Float, viewport: Float, anchor: Float, maxScroll: Int): Int =
        (itemTop + anchor * (itemHeight - viewport)).roundToInt().coerceIn(0, maxScroll.coerceAtLeast(0))
}
