package me.meeshy.sdk.model.composer

import kotlin.math.max
import kotlin.math.min

/**
 * Trame (rectangle) de fin d'un clavier dans la fenêtre, en dp — miroir de la trame
 * `keyboardFrameEnd` d'iOS. Une trame sans largeur ou sans hauteur n'est pas une mesure.
 */
data class KeyboardFrame(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top
}

/**
 * Hauteur du panneau (+) / emoji du composeur — source unique, miroir d'iOS
 * `ComposerPanelHeightLaw` (#8869).
 *
 * Le panneau prend la place du clavier : il en reprend la dernière hauteur connue pour que la
 * ligne de saisie ne bouge pas au va-et-vient clavier / panneau. Une trame dégénérée ou un
 * clavier flottant n'est jamais gravé comme dernière hauteur, et rien ne laisse le panneau
 * monter jusqu'à pousser le composeur sous la barre d'état.
 */
object ComposerPanelHeightLaw {
    /** Le panneau ne dépasse jamais cette fraction de la fenêtre (clavier réel ~38 %, tablette ~34 %). */
    const val MAX_WINDOW_RATIO: Float = 0.55f

    /** Ce qui doit rester visible au-dessus du panneau : barre d'outils, ligne de saisie, bandeau. */
    const val COMPOSER_CHROME_RESERVE_DP: Float = 180f

    const val COMPACT_FLOOR_DP: Float = 324f
    const val LARGE_FLOOR_DP: Float = 460f

    /** Largeur de fenêtre à partir de laquelle la classe de taille est « large » (medium/expanded). */
    const val LARGE_WIDTH_DP: Float = 600f

    /** Hauteur du panneau emoji inline, fixe comme sur iOS. */
    const val EMOJI_PANEL_HEIGHT_DP: Float = 260f

    /** Le plancher suit la LARGEUR de la fenêtre, pas l'appareil (multi-fenêtre, pliables). */
    fun contentFloor(windowWidthDp: Float): Float =
        if (windowWidthDp >= LARGE_WIDTH_DP) LARGE_FLOOR_DP else COMPACT_FLOOR_DP

    /**
     * Hauteur libérée par un clavier, lue sur sa trame de fin. `null` quand la trame n'est pas
     * une mesure (dégénérée, ou clavier qui ne touche pas le bas de la fenêtre : flottant) ;
     * 0 quand le clavier est sous la fenêtre (masqué).
     */
    fun keyboardHeight(endFrame: KeyboardFrame, windowHeightDp: Float): Float? {
        if (endFrame.width <= 0f || endFrame.height <= 0f) return null
        if (endFrame.top >= windowHeightDp) return 0f
        if (endFrame.bottom < windowHeightDp - 1f) return null
        return min(endFrame.height, windowHeightDp - endFrame.top)
    }

    /** Plafond du panneau pour une fenêtre donnée. */
    fun ceiling(windowHeightDp: Float, safeTopDp: Float, safeBottomDp: Float): Float {
        val usable = windowHeightDp - safeTopDp - safeBottomDp - COMPOSER_CHROME_RESERVE_DP
        return max(0f, min(windowHeightDp * MAX_WINDOW_RATIO, usable))
    }

    /**
     * Hauteur au repos : la dernière hauteur de clavier mesurée (`null` au premier usage : le
     * plancher sert de défaut), jamais sous le plancher, jamais au-dessus du plafond — le plafond
     * l'emporte sur le plancher.
     */
    fun restingHeight(
        lastKeyboardHeightDp: Float?,
        windowWidthDp: Float,
        windowHeightDp: Float,
        safeTopDp: Float,
        safeBottomDp: Float,
    ): Float {
        val ceiling = ceiling(windowHeightDp, safeTopDp, safeBottomDp)
        val floor = contentFloor(windowWidthDp)
        return min(max(lastKeyboardHeightDp ?: 0f, floor), ceiling)
    }
}
