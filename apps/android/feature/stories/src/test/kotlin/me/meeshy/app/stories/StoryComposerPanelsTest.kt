package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #14661 — un panneau du composeur retient la story tant qu'on le VOIT. Replier la plaque (chevron ou glissé) la réduit à
 * hauteur nulle sans refermer le panneau du composeur : un panneau caché ne doit pas figer la story sans raison visible.
 */
class StoryComposerPanelsTest {

    @Test
    fun `a panel the composer reports open holds the story`() {
        val panels = StoryComposerPanels()
        panels.report(open = true)
        assertThat(panels.open).isTrue()
        panels.report(open = false)
        assertThat(panels.open).isFalse()
    }

    @Test
    fun `folding the plate hides the panel and lets the story play`() {
        val panels = StoryComposerPanels()
        panels.report(open = true)
        panels.fold(folded = true)
        assertThat(panels.open).isFalse()
    }

    @Test
    fun `unfolding the plate shows the panel again and holds the story again`() {
        val panels = StoryComposerPanels()
        panels.report(open = true)
        panels.fold(folded = true)
        panels.fold(folded = false)
        assertThat(panels.open).isTrue()
    }
}
