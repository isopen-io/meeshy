package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [CameraCaptureFile] names the destination file a Feed-composer camera-photo or camera-video
 * capture writes into before the system camera activity even launches
 * ([androidx.activity.result.contract.ActivityResultContracts.TakePicture]/[androidx.activity.
 * result.contract.ActivityResultContracts.CaptureVideo] both take the destination
 * [android.net.Uri] up front, unlike the gallery pickers which hand back an already-existing
 * content Uri). Pure — the timestamp is an explicit parameter, never read internally, so the
 * same instant always yields the same name.
 */
class CameraCaptureFileTest {

    @Test
    fun `next names the file from the given instant with a jpg extension`() {
        assertThat(CameraCaptureFile.next(1_700_000_000_000L))
            .isEqualTo("capture_1700000000000.jpg")
    }

    @Test
    fun `next is deterministic for the same instant`() {
        assertThat(CameraCaptureFile.next(42L)).isEqualTo(CameraCaptureFile.next(42L))
    }

    @Test
    fun `two different instants produce two different file names`() {
        val first = CameraCaptureFile.next(1_000L)
        val second = CameraCaptureFile.next(1_001L)

        assertThat(first).isNotEqualTo(second)
    }

    @Test
    fun `next always ends with the jpg extension`() {
        assertThat(CameraCaptureFile.next(0L)).endsWith(".jpg")
    }

    @Test
    fun `nextVideo names the file from the given instant with an mp4 extension`() {
        assertThat(CameraCaptureFile.nextVideo(1_700_000_000_000L))
            .isEqualTo("video_1700000000000.mp4")
    }

    @Test
    fun `nextVideo is deterministic for the same instant`() {
        assertThat(CameraCaptureFile.nextVideo(42L)).isEqualTo(CameraCaptureFile.nextVideo(42L))
    }

    @Test
    fun `two different instants produce two different video file names`() {
        val first = CameraCaptureFile.nextVideo(1_000L)
        val second = CameraCaptureFile.nextVideo(1_001L)

        assertThat(first).isNotEqualTo(second)
    }

    @Test
    fun `nextVideo always ends with the mp4 extension`() {
        assertThat(CameraCaptureFile.nextVideo(0L)).endsWith(".mp4")
    }

    @Test
    fun `next and nextVideo never collide for the same instant`() {
        assertThat(CameraCaptureFile.next(7L)).isNotEqualTo(CameraCaptureFile.nextVideo(7L))
    }
}
