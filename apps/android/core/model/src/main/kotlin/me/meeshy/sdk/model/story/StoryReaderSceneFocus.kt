package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.composer.StoryCanvasFraming
import me.meeshy.sdk.model.composer.StoryCanvasFraming.Presentation

/**
 * La scène d'une story pendant qu'on lit ou qu'on écrit ses commentaires — miroir de `StorySceneFocus`
 * (iOS). Le cadrage réduit n'est pas un second solveur : il remet au solveur une région plus courte.
 */
object StoryReaderSceneFocus {
    /** « Un peu » : la scène se devine encore sous la liste des commentaires. */
    const val COMMENTS_BLUR_RADIUS_DP: Float = 6f
    const val COMPOSING_GAP: Float = 8f

    fun blurRadius(commentsOpen: Boolean): Float = if (commentsOpen) COMMENTS_BLUR_RADIUS_DP else 0f

    /** En saisie, la scène est une CARTE, même en session plein écran. */
    fun presentation(resting: Presentation, isComposing: Boolean): Presentation =
        if (isComposing) Presentation.CARDED else resting

    fun framingInput(
        resting: StoryCanvasFraming.Input,
        topInset: Float,
        composerReserve: Float?,
    ): StoryCanvasFraming.Input {
        if (composerReserve == null || composerReserve <= 0f) return resting
        return resting.copy(
            headerInset = topInset + COMPOSING_GAP,
            bottomInset = composerReserve + COMPOSING_GAP,
            presentation = Presentation.CARDED,
            verticalAlignment = StoryCanvasFraming.VerticalAlignment.TOP,
        )
    }
}
