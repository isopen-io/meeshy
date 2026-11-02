package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.Color
import android.media.ExifInterface
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13612 — a photo kept on the device while its upload waits still tells its shape: the scene that designates it
 * carries `aspectRatio` like every scene iOS publishes, read as the reader will see the photo (EXIF orientation applied).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MediaUploadImageSizeTest {

    private fun jpeg(width: Int, height: Int): ByteArray {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.BLUE) }
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
    }

    private fun rotatedJpegOnDisk(width: Int, height: Int): File =
        File.createTempFile("upright", ".jpg").apply {
            writeBytes(jpeg(width, height))
            ExifInterface(absolutePath).apply {
                setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_ROTATE_90.toString())
                saveAttributes()
            }
            deleteOnExit()
        }

    @Test
    fun `a photo in memory gives its width and height`() {
        val item = MediaUploadItem(jpeg(120, 80), "a.jpg", "image/jpeg")

        assertThat(MediaUploadImageSize.of(item)).isEqualTo(120 to 80)
    }

    @Test
    fun `a photo on disk turned by its exif gives the shape it is seen in`() {
        val item = MediaUploadItem.onDisk(rotatedJpegOnDisk(120, 80), "b.jpg", "image/jpeg")

        assertThat(MediaUploadImageSize.of(item)).isEqualTo(80 to 120)
    }

    @Test
    fun `what is not a photo gives no size`() {
        assertThat(MediaUploadImageSize.of(MediaUploadItem(byteArrayOf(1, 2, 3, 4), "c.mp4", "video/mp4"))).isNull()
        assertThat(MediaUploadImageSize.of(MediaUploadItem(byteArrayOf(1, 2, 3, 4), "d.jpg", "image/jpeg"))).isNull()
    }
}
