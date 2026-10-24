package me.meeshy.sdk.composer

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.PendingAttachmentType
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AttachmentThumbnailerTest {

    private fun thumbnailer() = AttachmentThumbnailer(UnconfinedTestDispatcher())

    private fun tempDir(): File = File.createTempFile("thumbs", "").apply { delete(); mkdirs() }

    @Test
    fun `an image gets a thumbnail with its dimensions`() = runTest {
        val file = File.createTempFile("pic", ".png")
        val bitmap = Bitmap.createBitmap(40, 20, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }

        val result = thumbnailer().thumbnail(file, PendingAttachmentType.IMAGE, tempDir(), "t1")

        assertThat(result).isNotNull()
        assertThat(result!!.width).isEqualTo(40)
        assertThat(result.height).isEqualTo(20)
        assertThat(File(result.thumbnailPath!!).exists()).isTrue()
    }

    @Test
    fun `an unreadable image yields no thumbnail`() = runTest {
        val file = File.createTempFile("broken", ".png").apply { writeBytes(byteArrayOf(1, 2, 3)) }

        assertThat(thumbnailer().thumbnail(file, PendingAttachmentType.IMAGE, tempDir(), "t2")).isNull()
    }

    @Test
    fun `a video or audio that cannot be decoded yields no thumbnail`() = runTest {
        val file = File.createTempFile("broken", ".mp4").apply { writeBytes(byteArrayOf(1, 2, 3)) }

        assertThat(thumbnailer().thumbnail(file, PendingAttachmentType.VIDEO, tempDir(), "t3")).isNull()
        assertThat(thumbnailer().thumbnail(file, PendingAttachmentType.AUDIO, tempDir(), "t4")).isNull()
    }

    @Test
    fun `a generic file has no thumbnail`() = runTest {
        val file = File.createTempFile("doc", ".pdf")

        assertThat(thumbnailer().thumbnail(file, PendingAttachmentType.FILE, tempDir(), "t5")).isNull()
    }
}
