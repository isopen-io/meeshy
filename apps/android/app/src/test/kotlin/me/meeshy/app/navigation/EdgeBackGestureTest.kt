package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EdgeBackGestureTest {

    @Test
    fun `the gesture is armed only in the leading 20dp strip`() {
        assertThat(EdgeBackGesture.beginsAtEdge(x = 10f, widthPx = 1000f, edgePx = 60f, isRtl = false)).isTrue()
        assertThat(EdgeBackGesture.beginsAtEdge(x = 61f, widthPx = 1000f, edgePx = 60f, isRtl = false)).isFalse()
        assertThat(EdgeBackGesture.beginsAtEdge(x = 990f, widthPx = 1000f, edgePx = 60f, isRtl = false)).isFalse()
    }

    @Test
    fun `in RTL the strip is the right edge and the travel is mirrored`() {
        assertThat(EdgeBackGesture.beginsAtEdge(x = 990f, widthPx = 1000f, edgePx = 60f, isRtl = true)).isTrue()
        assertThat(EdgeBackGesture.beginsAtEdge(x = 10f, widthPx = 1000f, edgePx = 60f, isRtl = true)).isFalse()
        assertThat(EdgeBackGesture.travel(startX = 990f, currentX = 790f, isRtl = true)).isEqualTo(200f)
        assertThat(EdgeBackGesture.travel(startX = 10f, currentX = 210f, isRtl = false)).isEqualTo(200f)
    }

    @Test
    fun `progress follows the finger across the width and is clamped`() {
        assertThat(EdgeBackGesture.progress(250f, 1000f)).isEqualTo(0.25f)
        assertThat(EdgeBackGesture.progress(-30f, 1000f)).isEqualTo(0f)
        assertThat(EdgeBackGesture.progress(2000f, 1000f)).isEqualTo(1f)
        assertThat(EdgeBackGesture.progress(10f, 0f)).isEqualTo(0f)
    }

    @Test
    fun `a third of the width commits, less cancels`() {
        assertThat(EdgeBackGesture.shouldCommit(progress = 0.34f, velocityWidthsPerSecond = 0f)).isTrue()
        assertThat(EdgeBackGesture.shouldCommit(progress = 0.30f, velocityWidthsPerSecond = 0f)).isFalse()
    }

    @Test
    fun `a firm fling commits from a short drag but a graze never does`() {
        assertThat(EdgeBackGesture.shouldCommit(progress = 0.10f, velocityWidthsPerSecond = 2.5f)).isTrue()
        assertThat(EdgeBackGesture.shouldCommit(progress = 0.02f, velocityWidthsPerSecond = 5f)).isFalse()
        assertThat(EdgeBackGesture.shouldCommit(progress = 0.10f, velocityWidthsPerSecond = 0.5f)).isFalse()
        assertThat(EdgeBackGesture.shouldCommit(progress = 0.10f, velocityWidthsPerSecond = -3f)).isFalse()
    }

    @Test
    fun `a vertical or outward start is not a back swipe`() {
        assertThat(EdgeBackGesture.isForeign(travelPx = 5f, verticalPx = 40f, slopPx = 16f)).isTrue()
        assertThat(EdgeBackGesture.isForeign(travelPx = -40f, verticalPx = 2f, slopPx = 16f)).isTrue()
        assertThat(EdgeBackGesture.isForeign(travelPx = 30f, verticalPx = 10f, slopPx = 16f)).isFalse()
        assertThat(EdgeBackGesture.hasStarted(travelPx = 17f, slopPx = 16f)).isTrue()
        assertThat(EdgeBackGesture.hasStarted(travelPx = 10f, slopPx = 16f)).isFalse()
    }
}
