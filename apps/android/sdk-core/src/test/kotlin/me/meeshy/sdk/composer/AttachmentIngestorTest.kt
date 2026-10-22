package me.meeshy.sdk.composer

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.PendingAttachmentType
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class AttachmentIngestorTest {

    private class NoThumbnails : AttachmentThumbnailing {
        override suspend fun thumbnail(file: File, type: PendingAttachmentType, outputDir: File, id: String) = null
    }

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun ingestor() = AttachmentIngestor(context, UnconfinedTestDispatcher(), NoThumbnails())

    private fun source(name: String, content: ByteArray): Uri {
        val file = File(context.cacheDir, "source-$name").apply { writeBytes(content) }
        return Uri.fromFile(file)
    }

    @Test
    fun `describe resolves the name the size and the mime of a picked file`() = runTest {
        val info = ingestor().describe(source("report.pdf", ByteArray(3)))

        assertThat(info.fileName).isEqualTo("source-report.pdf")
        assertThat(info.mimeType).isEqualTo("application/pdf")
    }

    @Test
    fun `ingest copies the source into the working folder`() = runTest {
        val ingestor = ingestor()
        val uri = source("photo.png", byteArrayOf(1, 2, 3, 4))

        val result = ingestor.ingest(uri, "id1", ingestor.describe(uri))

        assertThat(result).isNotNull()
        assertThat(File(result!!.localPath).readBytes()).isEqualTo(byteArrayOf(1, 2, 3, 4))
        assertThat(result.sizeBytes).isEqualTo(4L)
    }

    @Test
    fun `an unreadable source fails without leaving a file behind`() = runTest {
        val ingestor = ingestor()
        val missing = Uri.fromFile(File(context.cacheDir, "absent-file.pdf"))

        val result = ingestor.ingest(missing, "id2", ingestor.describe(missing))

        assertThat(result).isNull()
        val leftovers = File(context.cacheDir, "composer-pending").listFiles().orEmpty().filter { it.name.startsWith("id2_") }
        assertThat(leftovers).isEmpty()
    }

    @Test
    fun `ingestBytes writes the bytes and refuses empty content`() = runTest {
        val ingestor = ingestor()

        val ok = ingestor.ingestBytes(byteArrayOf(9, 9), "id3", "voice.m4a", "audio/mp4")
        val empty = ingestor.ingestBytes(ByteArray(0), "id4", "voice.m4a", "audio/mp4")

        assertThat(File(ok!!.localPath).readBytes()).isEqualTo(byteArrayOf(9, 9))
        assertThat(empty).isNull()
    }

    @Test
    fun `delete removes the working files and tolerates missing ones`() = runTest {
        val ingestor = ingestor()
        val ok = ingestor.ingestBytes(byteArrayOf(1), "id5", "a.bin", "application/octet-stream")!!

        ingestor.delete(listOf(ok.localPath, "/nonexistent/path"))

        assertThat(File(ok.localPath).exists()).isFalse()
    }

    @Test
    fun `a hostile file name cannot escape the working folder`() = runTest {
        val ingestor = ingestor()

        val result = ingestor.ingestBytes(byteArrayOf(1), "id6", "../../etc/passwd", "text/plain")!!

        assertThat(File(result.localPath).parentFile!!.name).isEqualTo("composer-pending")
    }
}
