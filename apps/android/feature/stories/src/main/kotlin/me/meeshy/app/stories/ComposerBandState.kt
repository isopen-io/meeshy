package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.StoryToolMode

/**
 * What the composer's tool row serves today. The band state machine itself
 * ([me.meeshy.sdk.model.composer.ComposerBandState], port of iOS `BandStateMachine`) lives
 * in `:core:model`; this holds the app-side part: **a tool without a panel is not served**,
 * so [StoryToolMode.AUDIO] and [StoryToolMode.TIMELINE] stay out of the row until their
 * panels land, and the per-tool badge counts shown on the row.
 */
internal object ComposerBandTools {

    /** Tools that have a panel in this build. */
    val withPanel: Set<StoryToolMode> = setOf(
        StoryToolMode.MEDIA,
        StoryToolMode.TEXT,
        StoryToolMode.DRAWING,
        StoryToolMode.TEXTURE,
    )

    /** The tools of the row, in canonical order. */
    val served: List<StoryToolMode> = StoryToolMode.served(withPanel)

    /** Number of elements each tool carries on the selected slide (0 hides the badge). */
    fun badges(mediaCount: Int, textCount: Int, strokeCount: Int, hasBackground: Boolean): Map<StoryToolMode, Int> =
        mapOf(
            StoryToolMode.MEDIA to mediaCount,
            StoryToolMode.TEXT to textCount,
            StoryToolMode.DRAWING to strokeCount,
            StoryToolMode.TEXTURE to if (hasBackground) 1 else 0,
        )

    /**
     * Whether the open tool's panel is shown over the stage. It steps aside while a text is
     * edited or a stroke drawn: their settings live in the stage footer, which the panel would
     * otherwise cover (#12298). The band keeps its open tool, so the panel returns after.
     */
    fun showsPanel(isDrawing: Boolean, isEditingText: Boolean): Boolean = !isDrawing && !isEditingText
}
