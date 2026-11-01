package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureTargetRotationTest {

    @Test
    fun `held upright the photo stands at rotation zero`() {
        assertThat(CaptureTargetRotation.fromDegrees(0)).isEqualTo(CaptureTargetRotation.ROTATION_0)
        assertThat(CaptureTargetRotation.fromDegrees(30)).isEqualTo(CaptureTargetRotation.ROTATION_0)
        assertThat(CaptureTargetRotation.fromDegrees(340)).isEqualTo(CaptureTargetRotation.ROTATION_0)
    }

    @Test
    fun `turned a quarter clockwise the photo targets rotation 270`() {
        assertThat(CaptureTargetRotation.fromDegrees(90)).isEqualTo(CaptureTargetRotation.ROTATION_270)
    }

    @Test
    fun `upside down the photo targets rotation 180`() {
        assertThat(CaptureTargetRotation.fromDegrees(180)).isEqualTo(CaptureTargetRotation.ROTATION_180)
    }

    @Test
    fun `turned a quarter counter clockwise the photo targets rotation 90`() {
        assertThat(CaptureTargetRotation.fromDegrees(270)).isEqualTo(CaptureTargetRotation.ROTATION_90)
    }

    @Test
    fun `the boundaries follow the CameraX table`() {
        assertThat(CaptureTargetRotation.fromDegrees(44)).isEqualTo(CaptureTargetRotation.ROTATION_0)
        assertThat(CaptureTargetRotation.fromDegrees(45)).isEqualTo(CaptureTargetRotation.ROTATION_270)
        assertThat(CaptureTargetRotation.fromDegrees(135)).isEqualTo(CaptureTargetRotation.ROTATION_180)
        assertThat(CaptureTargetRotation.fromDegrees(225)).isEqualTo(CaptureTargetRotation.ROTATION_90)
        assertThat(CaptureTargetRotation.fromDegrees(315)).isEqualTo(CaptureTargetRotation.ROTATION_0)
    }

    @Test
    fun `flat on a table the orientation is unknown and nothing changes`() {
        assertThat(CaptureTargetRotation.fromDegrees(-1)).isNull()
    }
}
