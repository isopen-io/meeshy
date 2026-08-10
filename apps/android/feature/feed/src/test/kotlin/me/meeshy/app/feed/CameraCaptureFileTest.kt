package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [CameraCaptureFile] names the destination file a Feed-composer camera-photo capture writes
 * into before the system camera activity even launches ([androidx.activity.result.contract.
 * ActivityResultContracts.TakePicture] takes the destination [android.net.Uri] up front, unlike
 * the gallery pickers which hand back an already-existing content Uri). Pure — the timestamp is
 * an explicit parameter, never read internally, so the same instant always yields the same name.
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
}
