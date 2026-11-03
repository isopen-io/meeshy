package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.composer.StoryCanvasFraming
import me.meeshy.sdk.model.composer.StoryCanvasFraming.Presentation

/**
 * La forme et le cadrage du canevas du lecteur dans un viewport donné — miroir de
 * `StoryReaderCanvasLayout` (iOS). Fonction pure du viewport et de deux drapeaux de chrome : carte
 * arrondie au repos, plein bord quand le chrome s'efface (appui long), immersif en session plein écran.
 */
object StoryReaderCanvasLayout {
    /** Le rayon de la carte au repos (`SceneShape.cardedCornerRadius`). */
    const val CARDED_CORNER_RADIUS: Float = 22f

    /** Clairance du chrome auteur : barres de progression, ligne auteur et marge. */
    const val HEADER_CLEARANCE: Float = 72f
    const val BOTTOM_INSET: Float = 64f
    const val SIDE_INSET: Float = 8f

    /** L'ombre de la carte : rayon 20, décalage 8, noir à 40 %, coupée quand la carte s'étend. */
    const val SHADOW_RADIUS_DP: Float = 20f
    const val SHADOW_OFFSET_Y_DP: Float = 8f
    const val SHADOW_ALPHA: Float = 0.4f

    /** Le ressort de la carte (réponse 0,42 s, amortissement 0,84), en millisecondes pour un `tween` de repli. */
    const val REFRAME_MS: Int = 420

    fun presentation(isFullscreenSession: Boolean, chromeVisible: Boolean, lifted: Boolean = false): Presentation =
        StoryReaderSceneFocus.presentation(
            resting = StoryCanvasFraming.readerPresentation(isFullscreenSession, chromeVisible),
            isComposing = lifted,
        )

    /** Étendu (plein bord ou immersif) = tout sauf la carte : pilote voile, ombre et animation. */
    fun isExpanded(isFullscreenSession: Boolean, chromeVisible: Boolean, lifted: Boolean = false): Boolean =
        presentation(isFullscreenSession, chromeVisible, lifted) != Presentation.CARDED

    fun shadowAlpha(expanded: Boolean): Float = if (expanded) 0f else SHADOW_ALPHA

    fun framing(
        viewportWidth: Float,
        viewportHeight: Float,
        topInset: Float,
        isFullscreenSession: Boolean,
        chromeVisible: Boolean,
        composerReserve: Float? = null,
    ): StoryCanvasFraming.Result {
        val resting = StoryCanvasFraming.Input(
            viewportWidth = viewportWidth,
            viewportHeight = viewportHeight,
            headerInset = topInset + HEADER_CLEARANCE,
            bottomInset = BOTTOM_INSET,
            sideInset = SIDE_INSET,
            presentation = presentation(isFullscreenSession, chromeVisible, lifted = composerReserve != null),
            cardedCornerRadius = CARDED_CORNER_RADIUS,
        )
        return StoryCanvasFraming.resolve(StoryReaderSceneFocus.framingInput(resting, topInset, composerReserve))
    }
}
