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
}
