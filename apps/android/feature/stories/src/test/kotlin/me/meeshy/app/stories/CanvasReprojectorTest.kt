package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for [CanvasReprojector] — the Android port of iOS
 * `CanvasReprojector`. Positions are normalized `[0, 1]`; reprojection is
 * center-anchored (`(0.5, 0.5)` is a fixed point) and scaled by the
 * source/target aspect ratio, clamping out-of-bounds results back into `[0, 1]`
 * and reporting each with a [ReprojectionWarning.Clamped]. Scale, aspect ratio
 * and rotation are invariant. The batch [CanvasReprojector.reprojectAll] counts
 * the clamps that drive the composer's "items repositioned" banner.
 */
@RunWith(JUnit4::class)
class CanvasReprojectorTest {

    private val portrait = CanvasSize(1080.0, 1920.0)
    private val square = CanvasSize(1080.0, 1080.0)
    private val landscape = CanvasSize(1920.0, 1080.0)

    private fun text(x: Double, y: Double) = StoryTextObject(id = "t", text = "x", x = x, y = y)

    @Test
    fun `a centered item stays centered when 9-16 reprojects to 1-1`() {
        val result = CanvasReprojector(portrait, square).reproject(text(0.5, 0.5))

        assertThat(result.value.x).isWithin(1e-9).of(0.5)
        assertThat(result.value.y).isWithin(1e-9).of(0.5)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `the horizontal position is untouched when the widths match`() {
        // 1080-wide source and target ⇒ scaleX == 1 ⇒ x is a fixed point.
        val result = CanvasReprojector(portrait, square).reproject(text(0.2, 0.5))

        assertThat(result.value.x).isWithin(1e-9).of(0.2)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `a bottom item is pushed out of bounds and clamped with a warning`() {
        val result = CanvasReprojector(portrait, square).reproject(text(0.5, 0.95))

        // scaleY = 1920/1080 ⇒ projectedY = 0.5 + 0.45*1.777… = 1.3 ⇒ clamped to 1.0.
        assertThat(result.value.y).isWithin(1e-9).of(1.0)
        assertThat(result.warning).isEqualTo(ReprojectionWarning.Clamped(originalX = 0.5, originalY = 0.95))
    }

    @Test
    fun `a top item clamps to zero, not one`() {
        val result = CanvasReprojector(portrait, square).reproject(text(0.5, 0.05))

        // projectedY = 0.5 + (-0.45)*1.777… = -0.3 ⇒ clamped to 0.0.
        assertThat(result.value.y).isWithin(1e-9).of(0.0)
        assertThat(result.warning).isEqualTo(ReprojectionWarning.Clamped(originalX = 0.5, originalY = 0.05))
    }

    @Test
    fun `the clamp warning reports the ORIGINAL coordinates, not the clamped ones`() {
        val result = CanvasReprojector(landscape, square).reproject(text(0.95, 0.5))

        val warning = result.warning
        assertThat(warning).isInstanceOf(ReprojectionWarning.Clamped::class.java)
        warning as ReprojectionWarning.Clamped
        assertThat(warning.originalX).isEqualTo(0.95)
        assertThat(warning.originalY).isEqualTo(0.5)
        // and the projected x is the clamped 1.0, distinct from the reported original.
        assertThat(result.value.x).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a taller target pulls an off-center item toward center without clamping`() {
        // square ⇒ portrait: scaleY = 1080/1920 = 0.5625 < 1 ⇒ item moves closer to center.
        val result = CanvasReprojector(square, portrait).reproject(text(0.5, 0.95))

        val expected = 0.5 + (0.95 - 0.5) * (1080.0 / 1920.0)
        assertThat(result.value.y).isWithin(1e-9).of(expected)
        assertThat(result.value.y).isLessThan(0.95) // pulled toward center
        assertThat(result.warning).isNull()
    }

    @Test
    fun `an in-bounds item is still moved when the aspect ratio changes`() {
        val result = CanvasReprojector(portrait, square).reproject(text(0.5, 0.7))

        val expected = 0.5 + (0.7 - 0.5) * (1920.0 / 1080.0)
        assertThat(result.value.y).isWithin(1e-9).of(expected)
        assertThat(result.value.y).isGreaterThan(0.7) // stretched away from center, still < 1
        assertThat(result.warning).isNull()
    }

    @Test
    fun `media aspect ratio is invariant under reprojection`() {
        val media = StoryMediaObject(id = "m", postMediaId = "pm", aspectRatio = 1.5, x = 0.5, y = 0.5)

        val result = CanvasReprojector(portrait, square).reproject(media)

        assertThat(result.value.aspectRatio).isEqualTo(1.5)
    }

    @Test
    fun `sticker rotation is invariant under reprojection`() {
        val sticker = StorySticker(id = "s", emoji = "⭐", x = 0.5, y = 0.5, rotation = 45.0)

        val result = CanvasReprojector(portrait, square).reproject(sticker)

        assertThat(result.value.rotation).isEqualTo(45.0)
    }

    @Test
    fun `audio reprojection is identity with no warning`() {
        val audio = StoryAudioPlayerObject(id = "a", x = 0.1, y = 0.9)

        val result = CanvasReprojector(portrait, square).reproject(audio)

        assertThat(result.value).isSameInstanceAs(audio)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `a degenerate target size is an identity reprojection, never NaN`() {
        val result = CanvasReprojector(portrait, CanvasSize(0.0, 1080.0)).reproject(text(0.2, 0.95))

        assertThat(result.value.x).isEqualTo(0.2)
        assertThat(result.value.y).isEqualTo(0.95)
        assertThat(result.warning).isNull()
    }

    @Test
    fun `reprojectAll counts every clamped item across families for the banner`() {
        val objects = CanvasObjects(
            textObjects = listOf(text(0.5, 0.5), text(0.5, 0.95)), // 2nd clamps
            mediaObjects = listOf(StoryMediaObject(id = "m", x = 0.5, y = 0.02)), // clamps (top)
            stickers = listOf(StorySticker(id = "s", x = 0.5, y = 0.5)), // stays
            audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "a", x = 0.1, y = 0.9)),
        )

        val result = CanvasReprojector(portrait, square).reprojectAll(objects)

        assertThat(result.repositionedCount).isEqualTo(2)
        assertThat(result.hasClampedItems).isTrue()
        // the reprojected set preserves cardinality per family
        assertThat(result.objects.textObjects).hasSize(2)
        assertThat(result.objects.mediaObjects).hasSize(1)
        assertThat(result.objects.stickers).hasSize(1)
        assertThat(result.objects.audioPlayerObjects).hasSize(1)
    }

    @Test
    fun `reprojectAll with only centered items reports no repositioning`() {
        val objects = CanvasObjects(
            textObjects = listOf(text(0.5, 0.5)),
            stickers = listOf(StorySticker(id = "s", x = 0.5, y = 0.5)),
        )

        val result = CanvasReprojector(portrait, square).reprojectAll(objects)

        assertThat(result.repositionedCount).isEqualTo(0)
        assertThat(result.hasClampedItems).isFalse()
        assertThat(result.warnings).isEmpty()
    }

    @Test
    fun `reprojectAll on an empty set is an empty, banner-less result`() {
        val result = CanvasReprojector(portrait, square).reprojectAll(CanvasObjects())

        assertThat(result.repositionedCount).isEqualTo(0)
        assertThat(result.hasClampedItems).isFalse()
        assertThat(result.objects.textObjects).isEmpty()
    }
}
