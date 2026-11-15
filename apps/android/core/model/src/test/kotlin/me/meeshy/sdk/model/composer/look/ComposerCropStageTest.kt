package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import org.junit.Test

/**
 * #15194 : en recadrage, l'image reste en grand, le cadre est fixe et l'image se place dessous — pincer zoome, glisser
 * déplace —, et la fenêtre gardée est exactement ce que le cadre montre.
 */
class ComposerCropStageTest {

    private val room = CropRect(0f, 0f, 1000f, 2000f)

    private fun layout(crop: NormalizedCrop?, width: Int = 1000, height: Int = 1000) =
        requireNotNull(ComposerCropStage.layout(crop, width, height, room))

    @Test
    fun `the whole take sits in a frame centred in the room, at its own proportions`() {
        val stage = layout(null)

        assertThat(stage.frame.width).isWithin(0.5f).of(920f)
        assertThat(stage.frame.height).isWithin(0.5f).of(920f)
        assertThat(stage.frame.centerX).isWithin(0.5f).of(500f)
        assertThat(stage.frame.centerY).isWithin(0.5f).of(1000f)
        assertThat(stage.image).isEqualTo(stage.frame)
    }

    @Test
    fun `a preset's window is laid exactly under the frame, the rest of the image around it`() {
        val window = requireNotNull(ComposerCropPreset.centeredCrop(9.0 / 16, 1000.0, 1000.0))
        val stage = layout(window)

        assertThat(stage.frame.width / stage.frame.height).isWithin(0.001f).of(9f / 16f)
        assertThat(stage.image.width).isWithin(0.5f).of(stage.frame.width / window.width)
        assertThat(stage.image.left + window.x * stage.image.width).isWithin(0.5f).of(stage.frame.left)
        assertThat(stage.image.top + window.y * stage.image.height).isWithin(0.5f).of(stage.frame.top)
    }

    @Test
    fun `pinching zooms the image under a frame that keeps its shape`() {
        val before = layout(null)
        val zoomed = ComposerCropStage.reframed(null, before.frame, panX = 0f, panY = 0f, zoom = 2f)

        assertThat(zoomed).isEqualTo(NormalizedCrop(0.25f, 0.25f, 0.5f, 0.5f))
        val after = layout(zoomed)
        assertThat(after.frame).isEqualTo(before.frame)
        assertThat(after.image.width).isWithin(0.5f).of(before.image.width * 2f)
    }

    @Test
    fun `dragging moves the image with the finger, and never past its edge`() {
        val start = NormalizedCrop(0.25f, 0.25f, 0.5f, 0.5f)
        val frame = layout(start).frame

        val moved = requireNotNull(ComposerCropStage.reframed(start, frame, panX = frame.width * 0.2f, panY = 0f, zoom = 1f))
        assertThat(moved.x).isWithin(0.0001f).of(0.15f)

        val pushed = requireNotNull(ComposerCropStage.reframed(start, frame, panX = frame.width * 5f, panY = 0f, zoom = 1f))
        assertThat(pushed.x).isWithin(0.0001f).of(0f)
    }

    @Test
    fun `pinching out past the whole take comes back to no crop`() {
        val frame = layout(null).frame

        assertThat(ComposerCropStage.reframed(NormalizedCrop(0.25f, 0.25f, 0.5f, 0.5f), frame, 0f, 0f, zoom = 0.1f)).isNull()
    }

    @Test
    fun `a corner pulled on the still image keeps the window it covers`() {
        val stage = layout(null)
        val pulled = stage.frame.copy(width = stage.frame.width / 2f)

        val crop = requireNotNull(ComposerCropStage.resized(null, pulled, stage.image))
        assertThat(crop.x).isWithin(0.001f).of(0f)
        assertThat(crop.width).isWithin(0.001f).of(0.5f)
        assertThat(crop.height).isWithin(0.001f).of(1f)
    }

    @Test
    fun `once released the pulled frame re-centres at its new proportions, the image following it`() {
        val half = NormalizedCrop(0f, 0f, 0.5f, 1f)
        val stage = layout(half)

        assertThat(stage.frame.centerX).isWithin(0.5f).of(500f)
        assertThat(stage.frame.width / stage.frame.height).isWithin(0.001f).of(0.5f)
        assertThat(stage.image.left).isWithin(0.5f).of(stage.frame.left)
        assertThat(stage.image.width).isWithin(0.5f).of(stage.frame.width * 2f)
    }

    @Test
    fun `a degenerate frame changes nothing`() {
        val stage = layout(null)
        val kept = NormalizedCrop(0.1f, 0.1f, 0.5f, 0.5f)

        assertThat(ComposerCropStage.resized(kept, stage.frame.copy(width = 0f), stage.image)).isEqualTo(kept)
    }

    @Test
    fun `an empty room or take has no stage`() {
        assertThat(ComposerCropStage.layout(null, 0, 100, room)).isNull()
        assertThat(ComposerCropStage.layout(null, 100, 100, CropRect(0f, 0f, 0f, 0f))).isNull()
    }
}
