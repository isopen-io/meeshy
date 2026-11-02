package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.composer.scene.SceneFrame
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import org.junit.Test

class SlideThumbnailGeometryTest {
    private fun spec(slide: StorySlide, canvasWidthPx: Float = 1080f) =
        SlideThumbnailSpec.of(slide, backgroundKey = "bg", accentHex = "#6366F1", widthPx = 74, heightPx = 132, canvasWidthPx = canvasWidthPx)

    @Test
    fun `a filled landscape photo is cropped to the tile and centred`() {
        val rect = SlideThumbnailGeometry.imageRect(400, 200, 74f, 132f, filled = true, framing = ThumbFraming.IDENTITY)
        assertThat(rect.height).isWithin(0.01f).of(132f)
        assertThat(rect.width).isWithin(0.01f).of(264f)
        assertThat((rect.left + rect.right) / 2f).isWithin(0.01f).of(37f)
    }

    @Test
    fun `a fitted photo is contained whole, leaving bands for the backdrop`() {
        val rect = SlideThumbnailGeometry.imageRect(400, 200, 74f, 132f, filled = false, framing = ThumbFraming.IDENTITY)
        assertThat(rect.width).isWithin(0.01f).of(74f)
        assertThat(rect.height).isWithin(0.01f).of(37f)
    }

    @Test
    fun `zoom scales about the centre and the pan moves it by a fraction of the tile`() {
        val framing = ThumbFraming(scale = 2f, offsetXFraction = 0.1f, offsetYFraction = -0.05f)
        val rect = SlideThumbnailGeometry.imageRect(100, 100, 100f, 100f, filled = true, framing = framing)
        assertThat(rect.width).isWithin(0.01f).of(200f)
        assertThat((rect.left + rect.right) / 2f).isWithin(0.01f).of(60f)
        assertThat((rect.top + rect.bottom) / 2f).isWithin(0.01f).of(45f)
    }

    @Test
    fun `the author's pixel pan becomes a fraction of the canvas, dropped while the canvas is unmeasured`() {
        val transform = StoryCanvasTransform(scale = 2f, offsetX = 108f, offsetY = -192f)
        val framing = ThumbFraming.of(transform, canvasWidthPx = 1080f)
        assertThat(framing.offsetXFraction).isWithin(0.0001f).of(0.1f)
        assertThat(framing.offsetYFraction).isWithin(0.0001f).of(-0.1f)
        val unmeasured = ThumbFraming.of(transform, canvasWidthPx = 0f)
        assertThat(unmeasured.scale).isEqualTo(2f)
        assertThat(unmeasured.offsetXFraction).isEqualTo(0f)
    }

    @Test
    fun `text lines align inside their block, and start and end flip for right to left`() {
        val widths = listOf(100f, 40f)
        assertThat(SlideThumbnailGeometry.lineLefts(widths, StoryTextAlign.LEFT, false, 50f)).containsExactly(0f, 0f).inOrder()
        assertThat(SlideThumbnailGeometry.lineLefts(widths, StoryTextAlign.CENTER, false, 50f)).containsExactly(0f, 30f).inOrder()
        assertThat(SlideThumbnailGeometry.lineLefts(widths, StoryTextAlign.RIGHT, false, 50f)).containsExactly(0f, 60f).inOrder()
        assertThat(SlideThumbnailGeometry.lineLefts(widths, StoryTextAlign.LEFT, true, 50f)).containsExactly(0f, 60f).inOrder()
    }

    @Test
    fun `each style draws in its own face`() {
        assertThat(SlideThumbnailGeometry.typefaceOf(StoryTextStyle.BOLD).bold).isTrue()
        assertThat(SlideThumbnailGeometry.typefaceOf(StoryTextStyle.HANDWRITING).italic).isTrue()
        assertThat(SlideThumbnailGeometry.typefaceOf(StoryTextStyle.HANDWRITING).family).isEqualTo(StoryTextFontFamily.CURSIVE)
        assertThat(SlideThumbnailGeometry.typefaceOf(StoryTextStyle.CLASSIC).bold).isFalse()
        assertThat(SlideThumbnailGeometry.typefaceOf(StoryTextStyle.TYPEWRITER).family).isEqualTo(StoryTextFontFamily.MONOSPACE)
    }

    @Test
    fun `a filter, a zoom, a fit and a backdrop each change the fingerprint, so the tile repaints`() {
        val base = StorySlide(id = "a")
        assertThat(spec(base)).isEqualTo(spec(base.copy()))
        assertThat(spec(base.copy(filter = StoryFilter.BW))).isNotEqualTo(spec(base))
        assertThat(spec(base.copy(transform = StoryCanvasTransform(scale = 2f)))).isNotEqualTo(spec(base))
        val fitted = base.copy(frame = SceneFrame(fitMode = "fit", backdrop = "indigo"))
        assertThat(spec(fitted).filled).isFalse()
        assertThat(spec(fitted).backdrop).isEqualTo(StoryBackdrop.INDIGO)
        assertThat(spec(base).look).isNull()
        assertThat(spec(base.copy(filter = StoryFilter.BW)).look).isNotNull()
    }

    @Test
    fun `a multi-line text with its style and alignment is part of the fingerprint`() {
        val one = StorySlide(id = "a", elements = listOf(StoryTextElement(id = "t", text = "Bonjour")))
        val two = one.copy(elements = listOf(one.elements.first().copy(text = "Bonjour\nle monde")))
        assertThat(spec(two)).isNotEqualTo(spec(one))
        val styled = one.copy(elements = listOf(one.elements.first().copy(style = StoryTextStyle.CLASSIC, align = StoryTextAlign.LEFT)))
        assertThat(spec(styled)).isNotEqualTo(spec(one))
    }
}
