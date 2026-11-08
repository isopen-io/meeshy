package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneTextFrameGeometryTest {
    private fun placed(shape: StoryTextFrameShape, framed: Boolean = true, o: Double = 20.0, ink: Double = 0.0, padding: Double = 1.0) =
        SceneTextFrameGeometry.place(shape, framed, textWidth = 200.0, textHeight = 100.0, oGlyphWidth = o, paddingScale = padding, inkPad = ink)

    @Test
    fun `a framed text keeps the margin of an o on each side`() {
        val p = placed(StoryTextFrameShape.ROUNDED)
        assertThat(p.metrics.boundsWidth).isEqualTo(240.0)
        assertThat(p.textX).isEqualTo(20.0)
    }

    @Test
    fun `a bare text keeps the historic eight pixel inset`() {
        assertThat(placed(StoryTextFrameShape.ROUNDED, framed = false, o = 40.0).textX).isEqualTo(8.0)
    }

    @Test
    fun `ink that overflows the advance is reserved inside the frame`() {
        val plain = placed(StoryTextFrameShape.ROUNDED)
        val inked = placed(StoryTextFrameShape.ROUNDED, ink = 6.0)
        assertThat(inked.metrics.boundsWidth).isEqualTo(plain.metrics.boundsWidth + 12.0)
        assertThat(inked.textX).isEqualTo(plain.textX + 6.0)
        assertThat(inked.textY).isEqualTo(plain.textY)
    }

    @Test
    fun `the ink reserve is the larger overhang rounded up and never negative`() {
        assertThat(SceneTextFrameGeometry.inkReserve(leftOverhang = 2.2, rightOverhang = 4.1)).isEqualTo(5.0)
        assertThat(SceneTextFrameGeometry.inkReserve(leftOverhang = -3.0, rightOverhang = -1.0)).isEqualTo(0.0)
        assertThat(SceneTextFrameGeometry.inkReserve(leftOverhang = Double.NaN, rightOverhang = 1.0)).isEqualTo(1.0)
    }

    @Test
    fun `the diamond widens around the inked text and centres it`() {
        val p = placed(StoryTextFrameShape.DIAMOND, ink = 5.0)
        assertThat(p.metrics.boundsWidth).isEqualTo(420.0)
        assertThat(p.textX).isEqualTo(110.0)
    }

    @Test
    fun `every shape fits its text inside its bounds`() {
        StoryTextFrameShape.entries.forEach { shape ->
            val p = placed(shape, ink = 4.0)
            assertThat(p.textX + 208.0).isAtMost(p.metrics.boundsWidth)
            assertThat(p.textY + 100.0).isAtMost(p.metrics.boundsHeight)
        }
    }

    @Test
    fun `the speech tail and the cloud band sit under the text`() {
        assertThat(placed(StoryTextFrameShape.SPEECH).metrics.boundsHeight).isEqualTo(156.0)
        assertThat(placed(StoryTextFrameShape.CLOUD).metrics.boundsHeight).isEqualTo(116.0 + 52.0 + 48.0)
    }

    @Test
    fun `every shape draws a non empty path and the tail leaves the body`() {
        StoryTextFrameShape.entries.filter { it != StoryTextFrameShape.NONE }.forEach {
            assertThat(StoryTextFrameGeometry.primitives(it, 300.0, 200.0)).isNotEmpty()
        }
        val tail = StoryTextFrameGeometry.primitives(StoryTextFrameShape.SPEECH, 300.0, 200.0)
            .filterIsInstance<StoryTextFrameGeometry.Primitive.Polygon>().single()
        assertThat(tail.points.maxOf { it.second }).isEqualTo(200.0)
    }
}
