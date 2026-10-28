package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import org.junit.Test

/** Le lecteur lit le cadre qu'iOS ou le composeur Android a publié (#13578), et un texte sans champ de cadre se lit comme avant. */
class StoryTextFrameReaderTest {
    private fun project(text: StoryTextObject) = StoryTextObjectProjection.project(text, preferredLanguages = emptyList())

    @Test
    fun `a text published without frame fields reads as the default rounded frame`() {
        val view = project(StoryTextObject(id = "t", text = "Hello"))
        assertThat(view.frame).isEqualTo(StoryTextFrame())
    }

    @Test
    fun `an iOS speech bubble keeps its shape, padding and ring`() {
        val view = project(
            StoryTextObject(
                id = "t", text = "Hello", frameShape = "speech", framePaddingScale = 1.5,
                frameBorderWidth = 4.0, frameBorderColor = "FF2E63",
            ),
        )
        assertThat(view.frame).isEqualTo(
            StoryTextFrame(shape = StoryTextFrameShape.SPEECH, paddingScale = 1.5f, borderWidth = 4f, borderColor = "FF2E63"),
        )
    }

    @Test
    fun `a shape from a newer client reads as rounded, a hostile ring width as none`() {
        val view = project(StoryTextObject(id = "t", text = "x", frameShape = "hexagon", frameBorderWidth = Double.NaN))
        assertThat(view.frame.shape).isEqualTo(StoryTextFrameShape.ROUNDED)
        assertThat(view.frame.borderWidth).isEqualTo(0f)
    }

    @Test
    fun `the frame unit is one design pixel at the object scale, like the glyphs`() {
        val view = project(StoryTextObject(id = "t", text = "x", scale = 2.0))
        assertThat(view.framePxPerDesign(canvasWidthPx = 1080f)).isEqualTo(2f)
        assertThat(view.framePxPerDesign(canvasWidthPx = 540f)).isEqualTo(1f)
        assertThat(view.fontPx(540f)).isEqualTo(view.fontSize.toFloat())
    }

    @Test
    fun `a hostile published scale reads as the scene object bounds, NaN zero or negative as identity`() {
        fun pxPerDesign(scale: Double) = project(StoryTextObject(id = "t", text = "x", scale = scale)).framePxPerDesign(1080f)
        assertThat(pxPerDesign(Double.NaN)).isEqualTo(1f)
        assertThat(pxPerDesign(Double.POSITIVE_INFINITY)).isEqualTo(1f)
        assertThat(pxPerDesign(-2.0)).isEqualTo(1f)
        assertThat(pxPerDesign(1e30)).isEqualTo(4f)
        assertThat(pxPerDesign(0.01)).isWithin(1e-6f).of(0.3f)
        val huge = project(StoryTextObject(id = "t", text = "x", scale = 1e30, borderWidth = 2.0))
        assertThat(huge.fontPx(1080f)).isEqualTo(64f * 4f)
        assertThat(huge.outlinePx(1080f)).isEqualTo(8f)
    }

    @Test
    fun `a hostile ring or padding is bounded at the projection like the composer sliders`() {
        val view = project(StoryTextObject(id = "t", text = "x", frameBorderWidth = 1e9, framePaddingScale = 1e9))
        assertThat(view.frame.borderWidth).isEqualTo(StoryTextFrame.MAX_BORDER)
        assertThat(view.frame.paddingScale).isEqualTo(StoryTextFrame.MAX_PADDING)
        val nan = project(StoryTextObject(id = "t", text = "x", framePaddingScale = Double.NaN, frameBorderWidth = Double.POSITIVE_INFINITY))
        assertThat(nan.frame.paddingScale).isEqualTo(StoryTextFrame.DEFAULT_PADDING)
        assertThat(nan.frame.borderWidth).isEqualTo(0f)
        assertThat(project(StoryTextObject(id = "t", text = "x", framePaddingScale = -4.0)).frame.paddingScale).isEqualTo(0f)
    }
}
