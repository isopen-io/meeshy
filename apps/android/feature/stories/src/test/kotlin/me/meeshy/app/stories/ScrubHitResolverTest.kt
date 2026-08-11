package me.meeshy.app.stories

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure hit-testing behind the scrubbable reaction/language bars: finger
 * position -> hovered tile index (with a vertical tolerance band so a
 * trembling finger never loses the hover), and release -> action.
 */
class ScrubHitResolverTest {

    // Three 40x40 tiles side by side at y=100, then the "+" tile (index 3).
    private val bounds = mapOf(
        0 to Rect(0f, 100f, 40f, 140f),
        1 to Rect(44f, 100f, 84f, 140f),
        2 to Rect(88f, 100f, 128f, 140f),
        3 to Rect(132f, 100f, 172f, 140f),
    )
    private val emojis = listOf("❤️", "😂", "🔥")

    private fun hovered(x: Float, y: Float) =
        ScrubHitResolver.hoveredIndex(bounds, Offset(x, y), verticalTolerance = 16f)

    @Test
    fun `a position inside a tile hovers that tile`() {
        assertThat(hovered(60f, 120f)).isEqualTo(1)
    }

    @Test
    fun `a position slightly above a tile still hovers it within the tolerance band`() {
        assertThat(hovered(60f, 90f)).isEqualTo(1)
    }

    @Test
    fun `a position slightly below a tile still hovers it within the tolerance band`() {
        assertThat(hovered(60f, 150f)).isEqualTo(1)
    }

    @Test
    fun `a position beyond the tolerance band hovers nothing`() {
        assertThat(hovered(60f, 200f)).isNull()
    }

    @Test
    fun `a position horizontally outside every tile hovers nothing`() {
        assertThat(hovered(500f, 120f)).isNull()
    }

    @Test
    fun `an empty bounds map hovers nothing`() {
        assertThat(ScrubHitResolver.hoveredIndex(emptyMap(), Offset(60f, 120f), 16f)).isNull()
    }

    @Test
    fun `releasing over an emoji tile reacts with that emoji`() {
        assertThat(ScrubHitResolver.release(1, emojis))
            .isEqualTo(ScrubRelease.React("😂"))
    }

    @Test
    fun `releasing over the trailing plus tile expands the full picker`() {
        assertThat(ScrubHitResolver.release(emojis.size, emojis)).isEqualTo(ScrubRelease.Expand)
    }

    @Test
    fun `releasing outside every tile keeps the bar open`() {
        assertThat(ScrubHitResolver.release(null, emojis)).isEqualTo(ScrubRelease.KeepOpen)
    }

    @Test
    fun `releasing on an out-of-range index keeps the bar open`() {
        assertThat(ScrubHitResolver.release(9, emojis)).isEqualTo(ScrubRelease.KeepOpen)
    }
}
