package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerMediaPlacement.Landing
import org.junit.Test

/** R4 de #13863 : le premier média d'une diapo vide en devient le fond, les suivants se posent sur la scène, une série fonde une diapo par média. */
class ComposerMediaPlacementTest {

    private val background = Landing(ComposerMediaRole.BACKGROUND, newSlide = false)
    private val foreground = Landing(ComposerMediaRole.FOREGROUND, newSlide = false)
    private val newSlide = Landing(ComposerMediaRole.BACKGROUND, newSlide = true)

    @Test
    fun `a single media becomes the background of a slide that has none`() {
        assertThat(ComposerMediaPlacement.plan(1, slideHasBackground = false, freeSlides = 9)).containsExactly(background)
    }

    @Test
    fun `a single media lands in the foreground, on the scene, of a slide that already has a background`() {
        assertThat(ComposerMediaPlacement.plan(1, slideHasBackground = true, freeSlides = 9)).containsExactly(foreground)
    }

    @Test
    fun `a series founds one slide per media, the first filling the current slide when it has no background`() {
        assertThat(ComposerMediaPlacement.plan(3, slideHasBackground = false, freeSlides = 9))
            .containsExactly(background, newSlide, newSlide).inOrder()
    }

    @Test
    fun `a series on a slide that has a background founds a slide for every media`() {
        assertThat(ComposerMediaPlacement.plan(2, slideHasBackground = true, freeSlides = 9))
            .containsExactly(newSlide, newSlide).inOrder()
    }

    @Test
    fun `the series stops at the slide cap, what finds no slide is refused`() {
        assertThat(ComposerMediaPlacement.plan(4, slideHasBackground = false, freeSlides = 1))
            .containsExactly(background, newSlide).inOrder()
        assertThat(ComposerMediaPlacement.plan(3, slideHasBackground = true, freeSlides = 1)).containsExactly(newSlide)
    }

    @Test
    fun `with no slide left a series keeps only what a single pick would do`() {
        assertThat(ComposerMediaPlacement.plan(3, slideHasBackground = true, freeSlides = 0)).containsExactly(foreground)
        assertThat(ComposerMediaPlacement.plan(3, slideHasBackground = false, freeSlides = 0)).containsExactly(background)
    }

    @Test
    fun `choosing a background takes the current slide's background even when it has one`() {
        assertThat(ComposerMediaPlacement.plan(1, slideHasBackground = true, freeSlides = 9, asBackground = true))
            .containsExactly(background)
    }

    @Test
    fun `nothing chosen places nothing`() {
        assertThat(ComposerMediaPlacement.plan(0, slideHasBackground = false, freeSlides = 9)).isEmpty()
    }
}
