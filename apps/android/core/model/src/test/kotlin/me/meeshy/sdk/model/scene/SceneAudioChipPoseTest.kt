package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import org.junit.Test

class SceneAudioChipPoseTest {

    private fun chip(scale: Double? = null, rotation: Double? = null) = StoryAudioPlayerObject(id = "s", scale = scale, rotation = rotation)

    @Test
    fun `a pinch multiplies the pose of the chip like any other object`() {
        assertThat(SceneAudioChipPose.transformed(chip(scale = 2.0), scaleBy = 1.5f, rotateByDeg = 0f).scale).isWithin(1e-6).of(3.0)
    }

    @Test
    fun `a chip without a served scale starts from one`() {
        assertThat(SceneAudioChipPose.transformed(chip(), scaleBy = 2f, rotateByDeg = 0f).scale).isWithin(1e-6).of(2.0)
    }

    @Test
    fun `the chip has no ceiling, as stickers and texts have none`() {
        assertThat(SceneAudioChipPose.transformed(chip(scale = 30.0), scaleBy = 10f, rotateByDeg = 0f).scale).isWithin(1e-6).of(300.0)
    }

    @Test
    fun `the chip shrinks down to the floor every scene object shares`() {
        val floor = SceneObjectScalePolicy.floorFor(SceneAudioChipPose.SMALLEST_SIDE_DESIGN_PX)
        assertThat(SceneAudioChipPose.transformed(chip(scale = 1.0), scaleBy = 0.0001f, rotateByDeg = 0f).scale).isWithin(1e-9).of(floor)
    }

    @Test
    fun `a degenerate pinch leaves the scale where it is`() {
        assertThat(SceneAudioChipPose.transformed(chip(scale = 2.0), scaleBy = Float.NaN, rotateByDeg = 0f).scale).isWithin(1e-9).of(2.0)
    }

    @Test
    fun `a twist turns the chip, wrapped on a half turn`() {
        assertThat(SceneAudioChipPose.transformed(chip(rotation = 170.0), scaleBy = 1f, rotateByDeg = 20f).rotation).isWithin(1e-6).of(-170.0)
        assertThat(SceneAudioChipPose.transformed(chip(), scaleBy = 1f, rotateByDeg = 30f).rotation).isWithin(1e-6).of(30.0)
    }

    @Test
    fun `a broken rotation falls back to upright`() {
        assertThat(SceneAudioChipPose.transformed(chip(rotation = 10.0), scaleBy = 1f, rotateByDeg = Float.NaN).rotation).isEqualTo(0.0)
    }

    @Test
    fun `the served pose of a chip is one and upright by default`() {
        assertThat(SceneAudioChipPose.scale(chip())).isEqualTo(1.0)
        assertThat(SceneAudioChipPose.scale(chip(scale = -2.0))).isEqualTo(1.0)
        assertThat(SceneAudioChipPose.rotation(chip())).isEqualTo(0.0)
        assertThat(SceneAudioChipPose.rotation(chip(rotation = 540.0))).isWithin(1e-9).of(180.0)
    }
}
