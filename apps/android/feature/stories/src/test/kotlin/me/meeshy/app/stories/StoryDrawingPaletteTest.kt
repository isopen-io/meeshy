package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/** Behavioural spec for the drawing tool's minimal colour/width picker config. */
@RunWith(JUnit4::class)
class StoryDrawingPaletteTest {

    @Test
    fun `default colour is one of the offered swatches`() {
        assertThat(StoryDrawingPalette.colors).contains(StoryDrawingPalette.DEFAULT_COLOR)
    }

    @Test
    fun `default width is one of the offered thickness steps, the middle one`() {
        assertThat(StoryDrawingPalette.widths).containsExactly(6.0, 14.0, 28.0).inOrder()
        assertThat(StoryDrawingPalette.DEFAULT_WIDTH).isEqualTo(StoryDrawingPalette.widths[1])
    }

    @Test
    fun `every swatch is a bare 6-digit hex — no leading hash`() {
        assertThat(StoryDrawingPalette.colors.all { it.length == 6 && it.toLongOrNull(16) != null }).isTrue()
    }
}
