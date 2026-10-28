package me.meeshy.app.composer.inbound

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.InboundMediaKind
import me.meeshy.sdk.model.composer.InboundMediaPolicy
import me.meeshy.sdk.model.composer.InboundMediaRefusal
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream

class InboundMediaReaderTest {
    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) + ByteArray(100)

    @Test
    fun `a real image is read and typed from its bytes`() {
        val read = InboundMediaReader.read({ ByteArrayInputStream(jpeg) }, "application/octet-stream") as InboundRead.Read
        assertThat(read.media.kind).isEqualTo(InboundMediaKind.IMAGE)
        assertThat(read.media.mimeType).isEqualTo("image/jpeg")
        assertThat(read.media.bytes).isEqualTo(jpeg)
    }

    @Test
    fun `a stream that cannot be opened or fails is refused as empty, never thrown`() {
        assertThat(InboundMediaReader.read({ null }, null)).isEqualTo(InboundRead.Refused(InboundMediaRefusal.EMPTY))
        assertThat(InboundMediaReader.read({ throw SecurityException("no grant") }, null)).isEqualTo(InboundRead.Refused(InboundMediaRefusal.EMPTY))
        val broken = object : InputStream() { override fun read(): Int = throw java.io.IOException("boom") }
        assertThat(InboundMediaReader.read({ broken }, null)).isEqualTo(InboundRead.Refused(InboundMediaRefusal.EMPTY))
    }

    @Test
    fun `an endless stream stops one byte past the ceiling and is refused as too large`() {
        var served = 0L
        val endless = object : InputStream() {
            override fun read(): Int = 0xFF.also { served++ }
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                served += length
                buffer.fill(0xFF.toByte(), offset, offset + length)
                return length
            }
        }
        val verdict = InboundMediaReader.read({ endless }, "image/jpeg")
        assertThat(verdict).isEqualTo(InboundRead.Refused(InboundMediaRefusal.TOO_LARGE))
        assertThat(served).isEqualTo(InboundMediaPolicy.MAX_BYTES + 1)
    }

    @Test
    fun `text claiming to be an image is refused`() {
        val html = "<html><script>alert(1)</script></html>".toByteArray() + ByteArray(30)
        assertThat(InboundMediaReader.read({ ByteArrayInputStream(html) }, "image/png"))
            .isEqualTo(InboundRead.Refused(InboundMediaRefusal.UNRECOGNIZED))
    }
}
