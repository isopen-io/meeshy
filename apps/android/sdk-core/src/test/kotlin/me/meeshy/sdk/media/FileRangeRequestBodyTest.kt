package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.InputStream

class FileRangeRequestBodyTest {
    @get:Rule val folder = TemporaryFolder()

    private fun written(body: okhttp3.RequestBody) = okio.Buffer().also { body.writeTo(it) }.readByteArray()

    @Test
    fun `a range of a file is exactly those octets and announces its length`() {
        val file = folder.newFile().apply { writeBytes(ByteArray(100) { it.toByte() }) }
        val body = MediaUploadItem.onDisk(file, "f.bin", "application/octet-stream").rangeBody(30, 20, null)

        assertThat(body.contentLength()).isEqualTo(20L)
        assertThat(written(body).toList()).isEqualTo((30..49).map { it.toByte() })
    }

    @Test
    fun `only the requested range is read, never the whole source`() {
        var read = 0L
        val source = object : MediaUploadSource {
            override val size = 100_000_000L
            override fun open(offset: Long): InputStream = object : InputStream() {
                private var position = offset
                override fun read(): Int = if (position < size) { read++; position++; 7 } else -1
                override fun read(b: ByteArray, off: Int, len: Int): Int {
                    if (position >= size) return -1
                    val n = minOf(len.toLong(), size - position).toInt()
                    position += n; read += n
                    return n
                }
            }
        }

        written(SourceRequestBody(source, 90_000_000L, 1_000L, null))

        assertThat(read).isEqualTo(1_000L)
    }

    @Test
    fun `the body is replayable`() {
        val file = folder.newFile().apply { writeBytes(ByteArray(10) { it.toByte() }) }
        val body = MediaUploadItem.onDisk(file, "f", "x/y").rangeBody(2, 4, null)

        assertThat(written(body)).isEqualTo(written(body))
        assertThat(body.isOneShot()).isFalse()
    }
}
