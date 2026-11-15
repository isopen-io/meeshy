package me.meeshy.sdk.model

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * **La scène du détail d'un post se voit entière, avec sa rangée d'actions, au-dessus du composer** (#6696, miroir de
 * `PostDetailSceneFraming` iOS).
 *
 * 1. Le rapport est TOUJOURS celui que la page rend (9:16 pour une scène, [SceneShape.ASPECT]) : jamais un littéral sans borne.
 * 2. À l'ouverture, la scène ET sa rangée d'actions tiennent entre le haut de la scène et le bas de la zone de défilement.
 * 3. …sauf si elle devait pour cela passer sous la moitié de la largeur disponible : son contenu se projette sur sa largeur
 *    et deviendrait illisible. Elle reprend alors sa taille de LECTURE.
 *
 * Pure, en dp : ce que la page mesure entre, une taille sort.
 */
object PostDetailSceneFraming {
    const val MAX_WIDTH: Float = 460f
    const val HORIZONTAL_INSET: Float = 16f
    const val ACTIONS_ROW_RESERVE: Float = 44f
    const val MINIMUM_WIDTH_FRACTION: Float = 0.5f
    const val REST_TOLERANCE: Float = 1f

    data class Size(val width: Float, val height: Float)

    /** Ce que le détail mesure de sa propre page : la zone de défilement, et le haut de la scène relevé AU REPOS. */
    data class Measures(
        val viewportWidth: Float = 0f,
        val viewportHeight: Float = 0f,
        val sceneTop: Float? = null,
    ) {
        /** Le haut de la scène ne se relève qu'au repos : pendant le défilement son cadre suit le contenu. */
        fun recordingSceneTop(minY: Float, scrollOffset: Float): Measures =
            if (abs(scrollOffset) < REST_TOLERANCE) copy(sceneTop = Math.round(minY).toFloat()) else this

        /**
         * Le clavier ne rétrécit pas la scène (#8647) : tant que le composer a le focus, la hauteur ne descend plus ; ce qui
         * grandit, ce qui change de largeur et la toute première mesure se relèvent toujours.
         */
        fun recordingViewport(width: Float, height: Float, composerIsFocused: Boolean): Measures {
            val keyboard = composerIsFocused &&
                viewportHeight > 0f &&
                abs(width - viewportWidth) < REST_TOLERANCE &&
                height < viewportHeight
            return if (keyboard) this else copy(viewportWidth = width, viewportHeight = height)
        }
    }

    /**
     * La taille du canvas, ou `null` tant que la page n'est pas mesurée (l'appelant garde alors son ajustement en largeur).
     * [accessoryHeight] : ce que l'hôte pose sous la scène elle-même (pastilles d'un carrousel).
     */
    fun sceneSize(
        ratio: Float,
        measures: Measures,
        headerHeight: Float = 0f,
        horizontalInset: Float = HORIZONTAL_INSET,
        accessoryHeight: Float = 0f,
    ): Size? {
        val width = min(measures.viewportWidth - 2 * horizontalInset, MAX_WIDTH)
        val visible = measures.viewportHeight - headerHeight - ACTIONS_ROW_RESERVE - accessoryHeight
        if (!(ratio > 0f) || !ratio.isFinite() || width <= 0f || visible <= 0f) return null
        val reading = aspectFit(width, visible, ratio)
        val top = max(headerHeight, measures.sceneTop ?: headerHeight)
        val openingHeight = min(visible, measures.viewportHeight - top - ACTIONS_ROW_RESERVE - accessoryHeight)
        if (openingHeight <= 0f) return reading
        val opening = aspectFit(width, openingHeight, ratio)
        return if (opening.width >= width * MINIMUM_WIDTH_FRACTION) opening else reading
    }

    private fun aspectFit(width: Float, height: Float, ratio: Float): Size {
        val fitted = min(width, height * ratio)
        return Size(fitted, fitted / ratio)
    }
}

/** Les trois règles de lecture de la scène du détail, une seule fois (iOS `StoryDetailPlaybackPolicy`, `BackgroundSoundBadge`). */
object PostDetailScenePlayback {
    /** Le bouton muet n'existe que si un canvas est RÉELLEMENT rendu et porte du son : la porte du rendu, jamais une copie. */
    fun showsSoundControls(rendered: Boolean, offersSound: Boolean): Boolean = rendered && offersSound

    /** La scène est-elle à l'écran ? Sans mesure de la zone, elle l'est (aucune pause à tort). */
    fun isVisible(top: Float, bottom: Float, viewportTop: Float?, viewportBottom: Float?): Boolean {
        if (viewportTop == null || viewportBottom == null) return true
        return bottom > viewportTop && top < viewportBottom
    }

    /** En pause : hors écran, ou arrêtée par le lecteur. */
    fun isPaused(visible: Boolean, viewerPaused: Boolean): Boolean = !visible || viewerPaused
}
