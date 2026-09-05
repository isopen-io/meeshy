package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

/**
 * Behavioural spec for the composer→wire conversion of a background image's framing:
 * [StoryCanvasTransform.toBackgroundFraming] projects the persisted 9:16 pan/zoom
 * (canvas **pixels**) onto the wire's **normalised** `x`/`y`/`scale`, closing the
 * author→reader loop that [StoryBackgroundObjectTransform] opened on the reader side.
 */
class StoryBackgroundFramingTest {

    private companion object {
        const val W = 1080f
        const val H = 1920f
    }

    @Test
    fun `an at-rest transform frames the background at dead centre, unscaled`() {
        val framing = StoryCanvasTransform.IDENTITY.toBackgroundFraming(W, H)

        assertThat(framing).isEqualTo(StoryBackgroundFraming.IDENTITY)
        assertThat(framing.isIdentity).isTrue()
    }

    @Test
    fun `panning the content right moves x past centre by the pixel fraction`() {
        val framing = StoryCanvasTransform(scale = 2f, offsetX = 270f, offsetY = 0f)
            .toBackgroundFraming(W, H)

        // 270 / 1080 = 0.25 past the 0.5 centre.
        assertThat(framing.x).isWithin(1e-9).of(0.75)
        assertThat(framing.y).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `panning the content left and up pulls x and y before centre`() {
        val framing = StoryCanvasTransform(scale = 2f, offsetX = -270f, offsetY = -480f)
            .toBackgroundFraming(W, H)

        assertThat(framing.x).isWithin(1e-9).of(0.25) // -270/1080
        assertThat(framing.y).isWithin(1e-9).of(0.25) // -480/1920
    }

    @Test
    fun `the zoom factor rides straight onto scale`() {
        val framing = StoryCanvasTransform(scale = 3f).toBackgroundFraming(W, H)

        assertThat(framing.scale).isWithin(1e-9).of(3.0)
    }

    @Test
    fun `a not-yet-measured canvas width collapses the x offset to centre without dividing`() {
        val framing = StoryCanvasTransform(scale = 2f, offsetX = 100f, offsetY = 200f)
            .toBackgroundFraming(canvasWidth = 0f, canvasHeight = H)

        assertThat(framing.x).isWithin(1e-9).of(0.5)
        assertThat(framing.y).isWithin(1e-9).of(0.5 + 200.0 / H) // height still measured
        assertThat(framing.scale).isWithin(1e-9).of(2.0)
    }

    @Test
    fun `a not-yet-measured canvas height collapses the y offset to centre`() {
        val framing = StoryCanvasTransform(scale = 2f, offsetX = 108f, offsetY = 300f)
            .toBackgroundFraming(canvasWidth = W, canvasHeight = 0f)

        assertThat(framing.x).isWithin(1e-9).of(0.6) // 108/1080
        assertThat(framing.y).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `a non-finite scale decays to the neutral 1x`() {
        val framing = StoryCanvasTransform(scale = Float.NaN, offsetX = 0f, offsetY = 0f)
            .toBackgroundFraming(W, H)

        assertThat(framing.scale).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a non-positive scale decays to the neutral 1x`() {
        val framing = StoryCanvasTransform(scale = 0f).toBackgroundFraming(W, H)

        assertThat(framing.scale).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a non-finite offset collapses to a centred coordinate`() {
        val framing = StoryCanvasTransform(scale = 2f, offsetX = Float.NaN, offsetY = Float.POSITIVE_INFINITY)
            .toBackgroundFraming(W, H)

        assertThat(framing.x).isWithin(1e-9).of(0.5)
        assertThat(framing.y).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `isIdentity is false once any component leaves its neutral value`() {
        assertThat(StoryBackgroundFraming(x = 0.6, y = 0.5, scale = 1.0).isIdentity).isFalse()
        assertThat(StoryBackgroundFraming(x = 0.5, y = 0.4, scale = 1.0).isIdentity).isFalse()
        assertThat(StoryBackgroundFraming(x = 0.5, y = 0.5, scale = 2.0).isIdentity).isFalse()
    }

    @Test
    fun `the framing round-trips through the reader's inverse projection`() {
        // The composer's framing, once serialised onto the wire object the reader reads,
        // must reproduce the exact same normalised offset the reader converts back — this
        // is the author→reader loop: what an Android author frames renders identically.
        val framing = StoryCanvasTransform(scale = 2.5f, offsetX = 270f, offsetY = -480f)
            .toBackgroundFraming(W, H)
        val wire = StoryMediaObject(
            id = "m1",
            x = framing.x,
            y = framing.y,
            scale = framing.scale,
        )

        val readBack = StoryBackgroundObjectTransform.from(wire)

        assertThat(readBack.offsetXFraction.toDouble()).isWithin(1e-6).of(270.0 / W)
        assertThat(readBack.offsetYFraction.toDouble()).isWithin(1e-6).of(-480.0 / H)
        assertThat(readBack.scaleX.toDouble()).isWithin(1e-6).of(2.5)
    }
}
