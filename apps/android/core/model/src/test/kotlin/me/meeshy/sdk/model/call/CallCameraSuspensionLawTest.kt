package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallCameraSuspensionLawTest {
    private fun decide(
        foreground: Boolean = true,
        pip: Boolean = false,
        video: Boolean = true,
        cameraOn: Boolean = true,
        hold: Boolean = false,
        suspended: Boolean = false,
    ) = CallCameraSuspensionLaw.decide(foreground, pip, video, cameraOn, hold, suspended)

    @Test
    fun `going to the background suspends the camera`() {
        assertThat(decide(foreground = false)).isEqualTo(CallCameraSuspension.Suspend)
    }

    @Test
    fun `coming back resumes a suspended camera`() {
        assertThat(decide(foreground = true, suspended = true)).isEqualTo(CallCameraSuspension.Resume)
    }

    @Test
    fun `the picture in picture window keeps the camera running`() {
        assertThat(decide(foreground = false, pip = true)).isEqualTo(CallCameraSuspension.None)
    }

    @Test
    fun `entering the picture in picture window resumes a camera suspended before`() {
        assertThat(decide(foreground = false, pip = true, suspended = true)).isEqualTo(CallCameraSuspension.Resume)
    }

    @Test
    fun `a camera the user turned off is never touched`() {
        assertThat(decide(foreground = false, cameraOn = false)).isEqualTo(CallCameraSuspension.None)
        assertThat(decide(foreground = true, cameraOn = false, suspended = true)).isEqualTo(CallCameraSuspension.None)
    }

    @Test
    fun `an audio call or a held call says nothing`() {
        assertThat(decide(foreground = false, video = false)).isEqualTo(CallCameraSuspension.None)
        assertThat(decide(foreground = false, hold = true)).isEqualTo(CallCameraSuspension.None)
    }

    @Test
    fun `an already suspended camera is not suspended twice`() {
        assertThat(decide(foreground = false, suspended = true)).isEqualTo(CallCameraSuspension.None)
    }
}
