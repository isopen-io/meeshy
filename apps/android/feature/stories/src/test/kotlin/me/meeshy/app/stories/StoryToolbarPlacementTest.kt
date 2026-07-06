package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure floating-toolbar placement math. While an on-canvas
 * text element is being edited the style toolbar floats just clear of the element and
 * must stay fully visible inside the (keyboard-shrunk) canvas. The resolver decides
 * BELOW when the toolbar fits in the band beneath the element, otherwise ABOVE, and
 * clamps the result into the canvas so it is never pushed off the top or past the
 * bottom. No Compose, no I/O — the canvas Composable stays declarative glue.
 */
@RunWith(JUnit4::class)
class StoryToolbarPlacementTest {

    private val toolbarH = 120f
    private val canvasH = 1920f
    private val half = 50f

    @Test
    fun `sits below the element when the toolbar fits beneath it`() {
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 200f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = canvasH,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.BELOW)
        // 200 + 50 = 250 (clear of the element's bottom edge)
        assertThat(p.topPx).isEqualTo(250f)
    }

    @Test
    fun `goes above the element when below would overflow the canvas bottom`() {
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 1800f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = canvasH,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.ABOVE)
        // 1800 - 50 - 120 = 1630
        assertThat(p.topPx).isEqualTo(1630f)
    }

    @Test
    fun `a shrunken canvas (keyboard open) pushes the toolbar above the element`() {
        // Same mid-canvas element, but the keyboard has shrunk the canvas to 1020px.
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 900f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = 1020f,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.ABOVE)
        // below = 950 + 120 = 1070 > 1020 → above at 900 - 50 - 120 = 730
        assertThat(p.topPx).isEqualTo(730f)
    }

    @Test
    fun `clamps to the top when the element is high and below does not fit`() {
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 60f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = 70f,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.ABOVE)
        // above = 60 - 50 - 120 = -110 → clamped up to 0
        assertThat(p.topPx).isEqualTo(0f)
    }

    @Test
    fun `clamps down off the bottom when the visible band is too tight for an above placement`() {
        // below doesn't fit, and the unclamped above position would itself overflow the band bottom.
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 780f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = 820f,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.ABOVE)
        // below = 830 + 120 = 950 > 820 → above = 780 - 50 - 120 = 610;
        // clampMax = 820 - 120 = 700; 610 <= 700 so it stays at 610.
        assertThat(p.topPx).isEqualTo(610f)
    }

    @Test
    fun `a canvas shorter than the toolbar pins it to the top`() {
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 40f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = 80f,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.ABOVE)
        // clampMax = (80 - 120).coerceAtLeast(0) = 0 → pinned to 0
        assertThat(p.topPx).isEqualTo(0f)
    }

    @Test
    fun `the gap separates the toolbar from the element below`() {
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 200f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = canvasH,
            gapPx = 40f,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.BELOW)
        // 200 + 50 + 40 = 290
        assertThat(p.topPx).isEqualTo(290f)
    }

    @Test
    fun `the gap is also honoured for an above placement`() {
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 1800f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = canvasH,
            gapPx = 40f,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.ABOVE)
        // 1800 - 50 - 40 - 120 = 1590
        assertThat(p.topPx).isEqualTo(1590f)
    }

    @Test
    fun `the toolbar exactly filling the band beneath the element still sits below`() {
        // below + toolbar == canvasHeight is the boundary: it fits.
        val p = StoryToolbarPlacement.resolve(
            elementCenterYpx = 800f,
            elementHalfHeightPx = half,
            toolbarHeightPx = toolbarH,
            canvasHeightPx = 970f,
        )
        assertThat(p.side).isEqualTo(ToolbarSide.BELOW)
        // below = 850; 850 + 120 = 970 == canvasHeight → fits
        assertThat(p.topPx).isEqualTo(850f)
    }
}
