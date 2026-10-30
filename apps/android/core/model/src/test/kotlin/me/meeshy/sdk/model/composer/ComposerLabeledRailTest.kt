package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le rail gauche du grand écran (#13837, maquette du 2026-10-30) : Fermer, les cinq outils et Fond, rien d'autre ; les
 * entrées du « ⋯ » restent derrière « Plus », quelle que soit la hauteur du rail, comme sur le petit écran.
 */
class ComposerLabeledRailTest {

    private val more = listOf(
        ComposerMoreEntry.ADD_SLIDE,
        ComposerMoreEntry.BACKGROUND,
        ComposerMoreEntry.SLIDE_DURATION,
        ComposerMoreEntry.ANIMATION,
        ComposerMoreEntry.CAPTION,
    )

    @Test
    fun `the rail always carries the five tools and the background, never the more button`() {
        assertThat(ComposerLabeledRail.tools).containsExactly(
            ComposerSceneTool.TEXT, ComposerSceneTool.MEDIA, ComposerSceneTool.STICKER,
            ComposerSceneTool.SOUND, ComposerSceneTool.DRAWING,
        ).inOrder()
    }

    @Test
    fun `every more entry but the background stays behind more, in its order`() {
        assertThat(ComposerLabeledRail.overflow(more)).containsExactly(
            ComposerMoreEntry.ADD_SLIDE, ComposerMoreEntry.SLIDE_DURATION,
            ComposerMoreEntry.ANIMATION, ComposerMoreEntry.CAPTION,
        ).inOrder()
    }

    @Test
    fun `the background is a fixed row of the rail, never repeated behind more`() {
        assertThat(ComposerLabeledRail.overflow(more)).doesNotContain(ComposerMoreEntry.BACKGROUND)
    }

    @Test
    fun `with only the background to offer, there is nothing behind more`() {
        assertThat(ComposerLabeledRail.overflow(listOf(ComposerMoreEntry.BACKGROUND))).isEmpty()
    }
}
