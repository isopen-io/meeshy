package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerOpening
import org.junit.Test

class CameraRecordingReadinessTest {
    private fun video(
        running: Boolean = true,
        bound: Boolean = true,
        active: Boolean = true,
        enabled: Boolean = true,
    ) = CameraRecordingReadiness.mayStartRecording(running, bound, active, enabled)

    @Test
    fun `recording is allowed only when the four conditions hold`() {
        assertThat(video()).isTrue()
        assertThat(video(running = false)).isFalse()
        assertThat(video(bound = false)).isFalse()
        assertThat(video(active = false)).isFalse()
        assertThat(video(enabled = false)).isFalse()
    }

    @Test
    fun `photo trigger obeys the same guard`() {
        assertThat(CameraRecordingReadiness.mayCapturePhoto(true, true, true, true)).isTrue()
        assertThat(CameraRecordingReadiness.mayCapturePhoto(true, false, true, true)).isFalse()
        assertThat(CameraRecordingReadiness.mayCapturePhoto(false, true, true, true)).isFalse()
    }

    @Test
    fun `the viewfinder opens in the mode the door promises`() {
        assertThat(CameraCaptureMode.forOpening(ComposerOpening.VIDEO_CAMERA_READY)).isEqualTo(CameraCaptureMode.VIDEO)
        ComposerOpening.entries.filter { it != ComposerOpening.VIDEO_CAMERA_READY }.forEach {
            assertThat(CameraCaptureMode.forOpening(it)).isEqualTo(CameraCaptureMode.PHOTO)
        }
    }

    @Test
    fun `a photo carries its original bytes untouched`() {
        val bytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2)
        val photo = CameraResult.Photo("t1", "file:///a.jpg", bytes)
        assertThat(photo.originalJpeg).isSameInstanceAs(bytes)
        assertThat(photo).isEqualTo(CameraResult.Photo("t1", "file:///a.jpg", bytes.copyOf()))
    }
}
