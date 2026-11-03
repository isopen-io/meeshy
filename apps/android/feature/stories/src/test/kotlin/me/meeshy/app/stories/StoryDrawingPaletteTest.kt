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
    fun `nine swatches in the iOS order`() {
        assertThat(StoryDrawingPalette.colors).containsExactly(
            "FFFFFF", "000000", "FF2E63", "08D9D6", "F8B500", "9B59B6", "2ECC71", "FF6B6B", "3498DB",
        ).inOrder()
    }

    @Test
    fun `thickness runs from 1 to 30 and the default sits inside`() {
        assertThat(StoryDrawingPalette.MIN_WIDTH).isEqualTo(1.0)
        assertThat(StoryDrawingPalette.MAX_WIDTH).isEqualTo(30.0)
        assertThat(StoryDrawingPalette.DEFAULT_WIDTH).isAtLeast(1.0)
        assertThat(StoryDrawingPalette.DEFAULT_WIDTH).isAtMost(30.0)
    }

    @Test
    fun `a requested thickness is clamped to the bounds`() {
        assertThat(StoryDrawingPalette.clampWidth(0.0)).isEqualTo(1.0)
        assertThat(StoryDrawingPalette.clampWidth(99.0)).isEqualTo(30.0)
        assertThat(StoryDrawingPalette.clampWidth(12.0)).isEqualTo(12.0)
    }

    @Test
    fun `every swatch is a bare 6-digit hex — no leading hash`() {
        assertThat(StoryDrawingPalette.colors.all { it.length == 6 && it.toLongOrNull(16) != null }).isTrue()
    }
}
