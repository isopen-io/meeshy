package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.StoryTextFrameGeometry.Primitive
import org.junit.Test

/** Les valeurs sont celles d'iOS `StoryTextLayer.frameMetrics` / `framePath` calculées à la main sur un texte 200 × 100. */
class StoryTextFrameGeometryTest {
    private fun metrics(shape: StoryTextFrameShape, framed: Boolean = true, o: Double = 20.0, scale: Double = 1.0) =
        StoryTextFrameGeometry.metrics(shape, framed, textWidth = 200.0, textHeight = 100.0, oGlyphWidth = o, paddingScale = scale)

    @Test
    fun `corner shapes pad by an o horizontally and 8 vertically`() {
        listOf(StoryTextFrameShape.ROUNDED, StoryTextFrameShape.PILL, StoryTextFrameShape.RECTANGLE).forEach {
            val m = metrics(it)
            assertThat(m.boundsWidth).isEqualTo(240.0)
            assertThat(m.boundsHeight).isEqualTo(116.0)
            assertThat(m.glyphX).isEqualTo(20.0)
            assertThat(m.glyphY).isEqualTo(8.0)
        }
    }

    @Test
    fun `a narrow o never pads under 8 design pixels`() {
        assertThat(metrics(StoryTextFrameShape.ROUNDED, o = 3.0).boundsWidth).isEqualTo(216.0)
    }

    @Test
    fun `the padding slider scales both pads, down to nothing`() {
        assertThat(metrics(StoryTextFrameShape.ROUNDED, scale = 2.0).boundsWidth).isEqualTo(280.0)
        assertThat(metrics(StoryTextFrameShape.ROUNDED, scale = 2.0).boundsHeight).isEqualTo(132.0)
        assertThat(metrics(StoryTextFrameShape.ROUNDED, scale = -1.0).boundsWidth).isEqualTo(200.0)
    }

    @Test
    fun `a bare text keeps the historic 8 pixel inset whatever the slider says`() {
        val m = metrics(StoryTextFrameShape.CLOUD, framed = false, o = 40.0, scale = 3.0)
        assertThat(m.boundsWidth).isEqualTo(216.0)
        assertThat(m.boundsHeight).isEqualTo(116.0)
        assertThat(m.glyphX).isEqualTo(8.0)
    }

    @Test
    fun `the diamond doubles the text so its corners touch the rhombus`() {
        val m = metrics(StoryTextFrameShape.DIAMOND)
        assertThat(m.boundsWidth).isEqualTo(400.0)
        assertThat(m.boundsHeight).isEqualTo(200.0)
        assertThat(m.glyphX).isEqualTo(100.0)
        assertThat(m.glyphY).isEqualTo(50.0)
    }

    @Test
    fun `the speech bubble adds a fixed tail band that the slider does not move`() {
        assertThat(metrics(StoryTextFrameShape.SPEECH).boundsHeight).isEqualTo(156.0)
        assertThat(metrics(StoryTextFrameShape.SPEECH, scale = 2.0).boundsHeight).isEqualTo(132.0 + 40.0)
    }

    @Test
    fun `the cloud adds a puff all around and a thought band below`() {
        val m = metrics(StoryTextFrameShape.CLOUD)
        assertThat(m.boundsWidth).isEqualTo(292.0)
        assertThat(m.boundsHeight).isEqualTo(216.0)
        assertThat(m.glyphX).isEqualTo(46.0)
        assertThat(m.glyphY).isEqualTo(34.0)
    }

    @Test
    fun `the measured size is rounded up to whole design pixels`() {
        val m = StoryTextFrameGeometry.metrics(StoryTextFrameShape.ROUNDED, true, 200.2, 99.1, 20.0)
        assertThat(m.glyphWidth).isEqualTo(201.0)
        assertThat(m.glyphHeight).isEqualTo(100.0)
    }

    @Test
    fun `the measure width is capped at 88 percent of the canvas, 44 for the diamond`() {
        assertThat(StoryTextFrameGeometry.maxTextWidthFraction(StoryTextFrameShape.ROUNDED, framed = true)).isEqualTo(0.88)
        assertThat(StoryTextFrameGeometry.maxTextWidthFraction(StoryTextFrameShape.DIAMOND, framed = true)).isEqualTo(0.44)
        assertThat(StoryTextFrameGeometry.maxTextWidthFraction(StoryTextFrameShape.DIAMOND, framed = false)).isEqualTo(0.88)
    }

    @Test
    fun `corner radii follow iOS frameCornerRadius`() {
        assertThat(StoryTextFrameGeometry.cornerRadius(StoryTextFrameShape.ROUNDED, 116.0)).isWithin(1e-9).of(17.4)
        assertThat(StoryTextFrameGeometry.cornerRadius(StoryTextFrameShape.ROUNDED, 10.0)).isEqualTo(4.0)
        assertThat(StoryTextFrameGeometry.cornerRadius(StoryTextFrameShape.PILL, 116.0)).isEqualTo(58.0)
        assertThat(StoryTextFrameGeometry.cornerRadius(StoryTextFrameShape.RECTANGLE, 116.0)).isWithin(1e-9).of(4.64)
        assertThat(StoryTextFrameGeometry.cornerRadius(StoryTextFrameShape.RECTANGLE, 10.0)).isEqualTo(2.0)
    }

    @Test
    fun `a corner shape is one rounded rectangle of the whole box`() {
        val prims = StoryTextFrameGeometry.primitives(StoryTextFrameShape.PILL, 240.0, 116.0)
        assertThat(prims).containsExactly(Primitive.RoundRect(0.0, 0.0, 240.0, 116.0, 58.0))
    }

    @Test
    fun `the diamond joins the four edge midpoints`() {
        val prims = StoryTextFrameGeometry.primitives(StoryTextFrameShape.DIAMOND, 400.0, 200.0)
        assertThat(prims).containsExactly(
            Primitive.Polygon(listOf(200.0 to 0.0, 400.0 to 100.0, 200.0 to 200.0, 0.0 to 100.0)),
        )
    }

    @Test
    fun `the speech bubble is a rounded body and a tail pointing down-left`() {
        val prims = StoryTextFrameGeometry.primitives(StoryTextFrameShape.SPEECH, 240.0, 156.0)
        val body = prims[0] as Primitive.RoundRect
        assertThat(body.height).isEqualTo(116.0)
        assertThat(body.radius).isWithin(1e-9).of(34.8)
        assertThat(prims[1]).isEqualTo(Primitive.Polygon(listOf(48.0 to 114.0, 112.0 to 114.0, 38.0 to 156.0)))
    }

    @Test
    fun `the cloud is an inner body, a ring of puffs and two thought bubbles`() {
        val prims = StoryTextFrameGeometry.primitives(StoryTextFrameShape.CLOUD, 292.0, 216.0)
        val inner = prims[0] as Primitive.RoundRect
        assertThat(inner.left).isEqualTo(26.0)
        assertThat(inner.width).isEqualTo(240.0)
        assertThat(inner.height).isEqualTo(116.0)
        assertThat(inner.radius).isEqualTo(29.0)
        assertThat(prims.filterIsInstance<Primitive.Oval>()).hasSize(8 + 4 + 8 + 4 + 2)
    }

    @Test
    fun `a cloud too small for its puffs falls back to an ellipse`() {
        val prims = StoryTextFrameGeometry.primitives(StoryTextFrameShape.CLOUD, 40.0, 100.0)
        assertThat(prims).containsExactly(Primitive.Oval(0.0, 0.0, 40.0, 52.0))
    }

    @Test
    fun `the cloud thought bubbles fall down-left in the thought band, as iOS framePath computes them`() {
        val ovals = StoryTextFrameGeometry.primitives(StoryTextFrameShape.CLOUD, 292.0, 216.0).filterIsInstance<Primitive.Oval>()
        val (large, small) = ovals.takeLast(2)
        assertThat(large.left).isWithin(1e-9).of(46.4)
        assertThat(large.top).isWithin(1e-9).of(161.76)
        assertThat(large.width).isWithin(1e-9).of(31.2)
        assertThat(small.left).isWithin(1e-9).of(32.1)
        assertThat(small.top).isWithin(1e-9).of(189.84)
        assertThat(small.width).isWithin(1e-9).of(18.2)
    }

    @Test
    fun `the widest text a box can hold inverts the metrics, so the box never outgrows its room`() {
        fun widest(shape: StoryTextFrameShape, room: Double) =
            StoryTextFrameGeometry.maxTextWidth(shape, room, oGlyphWidth = 20.0, paddingScale = 1.0)
        assertThat(widest(StoryTextFrameShape.ROUNDED, 240.0)).isEqualTo(200.0)
        assertThat(widest(StoryTextFrameShape.SPEECH, 240.0)).isEqualTo(200.0)
        assertThat(widest(StoryTextFrameShape.CLOUD, 292.0)).isEqualTo(200.0)
        assertThat(widest(StoryTextFrameShape.DIAMOND, 400.0)).isEqualTo(200.0)
        assertThat(widest(StoryTextFrameShape.DIAMOND, 50.0)).isEqualTo(10.0)
        assertThat(widest(StoryTextFrameShape.CLOUD, 10.0)).isEqualTo(0.0)
        listOf(StoryTextFrameShape.ROUNDED, StoryTextFrameShape.DIAMOND, StoryTextFrameShape.CLOUD).forEach { shape ->
            val w = widest(shape, 333.0)
            assertThat(StoryTextFrameGeometry.metrics(shape, true, w, 10.0, 20.0).boundsWidth).isAtMost(334.0)
        }
    }
}
