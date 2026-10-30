package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le rail gauche du grand écran (#13837) : Fermer, les cinq outils et Fond toujours, puis les entrées du « ⋯ » qui tiennent
 * dans sa hauteur ; le reste va dans « Plus », qui n'existe que s'il range quelque chose.
 */
class ComposerLabeledRailTest {

    private val more = listOf(
        ComposerMoreEntry.ADD_SLIDE,
        ComposerMoreEntry.BACKGROUND,
        ComposerMoreEntry.SLIDE_DURATION,
        ComposerMoreEntry.ANIMATION,
        ComposerMoreEntry.CAPTION,
    )

    private fun rows(count: Int): Float = count * ComposerLabeledRail.ROW - ComposerLabeledRail.GAP + count * ComposerLabeledRail.GAP

    @Test
    fun `the rail always carries the five tools and the background, never the more button`() {
        assertThat(ComposerLabeledRail.tools).containsExactly(
            ComposerSceneTool.TEXT, ComposerSceneTool.MEDIA, ComposerSceneTool.STICKER,
            ComposerSceneTool.SOUND, ComposerSceneTool.DRAWING,
        ).inOrder()
    }

    @Test
    fun `a tall rail lays every more entry inline and has no more button`() {
        val rail = ComposerLabeledRail.leading(more, railHeightDp = rows(20))

        assertThat(rail.inline).containsExactly(
            ComposerMoreEntry.ADD_SLIDE, ComposerMoreEntry.SLIDE_DURATION,
            ComposerMoreEntry.ANIMATION, ComposerMoreEntry.CAPTION,
        ).inOrder()
        assertThat(rail.overflow).isEmpty()
    }

    @Test
    fun `the background is a fixed row of the rail, never repeated among the more entries`() {
        val rail = ComposerLabeledRail.leading(more, railHeightDp = rows(20))

        assertThat(rail.inline).doesNotContain(ComposerMoreEntry.BACKGROUND)
        assertThat(rail.overflow).doesNotContain(ComposerMoreEntry.BACKGROUND)
    }

    @Test
    fun `a rail one row short keeps what fits and moves the rest to more, which takes a row`() {
        val rail = ComposerLabeledRail.leading(more, railHeightDp = rows(ComposerLabeledRail.FIXED_ROWS + 3))

        assertThat(rail.inline).containsExactly(ComposerMoreEntry.ADD_SLIDE, ComposerMoreEntry.SLIDE_DURATION).inOrder()
        assertThat(rail.overflow).containsExactly(ComposerMoreEntry.ANIMATION, ComposerMoreEntry.CAPTION).inOrder()
    }

    @Test
    fun `a short rail sends every more entry to more and loses none`() {
        val rail = ComposerLabeledRail.leading(more, railHeightDp = rows(4))

        assertThat(rail.inline).isEmpty()
        assertThat(rail.overflow).containsExactly(
            ComposerMoreEntry.ADD_SLIDE, ComposerMoreEntry.SLIDE_DURATION,
            ComposerMoreEntry.ANIMATION, ComposerMoreEntry.CAPTION,
        ).inOrder()
    }
}
