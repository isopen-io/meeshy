package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import okhttp3.MediaType.Companion.toMediaType
import okio.Buffer
import okio.BufferedSink
import okio.blackholeSink
import okio.buffer
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile

/**
 * #13551 — un média adossé à un fichier part EN FLUX : ni le corps multipart, ni une tranche TUS, ni la
 * taille annoncée ne chargent le fichier en mémoire.
 */
class MediaUploadSourceTest {
    @get:Rule val folder = TemporaryFolder()

    private val octets = "application/octet-stream".toMediaType()

    private fun fileOf(bytes: ByteArray): File = folder.newFile().also { it.writeBytes(bytes) }

    /** Un fichier creux de [size] octets : rien n'est écrit, il se lit comme des zéros. */
    private fun sparseFile(size: Long): File = folder.newFile().also { RandomAccessFile(it, "rw").use { raf -> raf.setLength(size) } }

    private fun BufferedSink.drain(item: MediaUploadItem) = item.requestBody(octets).writeTo(this)

    @Test
    fun `an item on disk announces its size and sends exactly the file`() {
        val content = ByteArray(300_000) { (it % 251).toByte() }
        val item = MediaUploadItem.onDisk(fileOf(content), "clip.mp4", "video/mp4")

        val body = item.requestBody(octets)
        val sent = Buffer().also { body.writeTo(it) }.readByteArray()

        assertThat(item.sizeBytes).isEqualTo(content.size.toLong())
        assertThat(body.contentLength()).isEqualTo(content.size.toLong())
        assertThat(sent).isEqualTo(content)
    }

    @Test
    fun `a body on disk can be written again, as a retried request does`() {
        val content = ByteArray(70_000) { it.toByte() }
        val body = MediaUploadItem.onDisk(fileOf(content), "a.bin", "").requestBody(octets)

        val first = Buffer().also { body.writeTo(it) }.readByteArray()
        val second = Buffer().also { body.writeTo(it) }.readByteArray()

        assertThat(body.isOneShot()).isFalse()
        assertThat(second).isEqualTo(first)
    }

    @Test
    fun `a range of a file is sent from its offset, for its length`() {
        val content = ByteArray(200_000) { (it * 7).toByte() }
        val item = MediaUploadItem.onDisk(fileOf(content), "a.bin", "")

        val body = item.rangeBody(offset = 65_537, length = 100_003, contentType = octets)
        val sent = Buffer().also { body.writeTo(it) }.readByteArray()

        assertThat(body.contentLength()).isEqualTo(100_003L)
        assertThat(sent).isEqualTo(content.copyOfRange(65_537, 165_540))
    }

    @Test
    fun `an item in memory keeps its bytes and its ranges`() {
        val content = ByteArray(1_000) { it.toByte() }
        val item = MediaUploadItem(content, "a.jpg", "image/jpeg")

        val range = Buffer().also { item.rangeBody(10, 20, octets).writeTo(it) }.readByteArray()

        assertThat(item.bytes).isSameInstanceAs(content)
        assertThat(item.sizeBytes).isEqualTo(1_000L)
        assertThat(range).isEqualTo(content.copyOfRange(10, 30))
    }

    @Test
    fun `a file that shrank after it was announced fails the request instead of sending a short body`() {
        val file = fileOf(ByteArray(50_000))
        val body = MediaUploadItem.onDisk(file, "a.bin", "").requestBody(octets)
        RandomAccessFile(file, "rw").use { it.setLength(10_000) }

        val failure = runCatching { Buffer().also { body.writeTo(it) } }.exceptionOrNull()

        assertThat(failure).isInstanceOf(IOException::class.java)
    }

    @Test
    fun `a file of 200 MB is sent whole without any array of its size`() {
        val size = 200L * 1024 * 1024
        val item = MediaUploadItem.onDisk(sparseFile(size), "long.mp4", "video/mp4")
        val counted = CountingSink()

        val allocated = allocatedBy { counted.buffer().use { it.drain(item) } }

        assertThat(counted.total).isEqualTo(size)
        assertThat(allocated).isLessThan(MEMORY_BOUND_BYTES)
    }

    @Test
    fun `a 10 MB TUS slice of a 200 MB file is sent without any array of the slice size`() {
        val item = MediaUploadItem.onDisk(sparseFile(200L * 1024 * 1024), "long.mp4", "video/mp4")
        val slice = TusUploadRepository.DEFAULT_CHUNK_SIZE_BYTES

        val allocated = allocatedBy {
            blackholeSink().buffer().use { item.rangeBody(150L * 1024 * 1024, slice, octets).writeTo(it) }
        }

        assertThat(allocated).isLessThan(MEMORY_BOUND_BYTES)
    }

    @Test
    fun `the meter sees an array of the media size, so a bounded reading means something`() {
        val allocated = allocatedBy { check(ByteArray(16 * 1024 * 1024).size > 0) }

        assertThat(allocated).isAtLeast(16L * 1024 * 1024)
    }

    private class CountingSink : okio.Sink by blackholeSink() {
        var total = 0L
        override fun write(source: Buffer, byteCount: Long) {
            total += byteCount
            source.skip(byteCount)
        }
    }

    private companion object {
        /** Quelques Mo : la mémoire tenue par l'envoi ne dépend pas de la taille du fichier. */
        const val MEMORY_BOUND_BYTES = 4L * 1024 * 1024

        fun allocatedBy(block: () -> Unit): Long = AllocationMeter.allocatedBy(block)
    }
}
