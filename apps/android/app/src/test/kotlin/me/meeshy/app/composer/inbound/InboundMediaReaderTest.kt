package me.meeshy.app.composer.inbound

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.InboundMediaKind
import me.meeshy.sdk.model.composer.InboundMediaPolicy
import me.meeshy.sdk.model.composer.InboundMediaRefusal
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream

class InboundMediaReaderTest {
    @get:Rule val folder = TemporaryFolder()
    private val target get() = File(folder.root, "0.part")
    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) + ByteArray(100) { 7 }

    private fun copy(source: InboundSource) = InboundMediaReader.copy(source, target)

    @Test
    fun `a real image is copied whole and typed from its bytes`() {
        val copy = copy(InboundSource({ ByteArrayInputStream(jpeg) }, "application/octet-stream")) as InboundCopy.Stored
        assertThat(copy.media.kind).isEqualTo(InboundMediaKind.IMAGE)
        assertThat(copy.media.mimeType).isEqualTo("image/jpeg")
        assertThat(copy.media.bytes).isEqualTo(jpeg.size.toLong())
        assertThat(target.readBytes()).isEqualTo(jpeg)
    }

    @Test
    fun `a stream that cannot be opened or fails is refused as empty, never thrown, and leaves no file`() {
        assertThat(copy(InboundSource({ null }))).isEqualTo(InboundCopy.Refused(InboundMediaRefusal.EMPTY))
        assertThat(copy(InboundSource({ throw SecurityException("no grant") }))).isEqualTo(InboundCopy.Refused(InboundMediaRefusal.EMPTY))
        val broken = object : InputStream() { override fun read(): Int = throw java.io.IOException("boom") }
        assertThat(copy(InboundSource({ broken }))).isEqualTo(InboundCopy.Refused(InboundMediaRefusal.EMPTY))
        assertThat(target.exists()).isFalse()
    }

    @Test
    fun `a stream that breaks halfway leaves no partial file`() {
        var calls = 0
        val flaky = object : InputStream() {
            override fun read(): Int = throw java.io.IOException("boom")
            override fun read(b: ByteArray, off: Int, len: Int): Int =
                if (calls++ == 0) jpeg.copyInto(b, off, 0, minOf(len, jpeg.size)).let { minOf(len, jpeg.size) } else throw java.io.IOException("cut")
        }
        assertThat(copy(InboundSource({ flaky }, "image/jpeg"))).isInstanceOf(InboundCopy.Refused::class.java)
        assertThat(target.exists()).isFalse()
    }

    @Test
    fun `an endless stream stops one byte past the ceiling and is refused as too large`() {
        var served = 0L
        val endless = object : InputStream() {
            override fun read(): Int = 0xFF
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                if (served == 0L) jpeg.copyInto(buffer, offset, 0, 4) else buffer.fill(0xFF.toByte(), offset, offset + length)
                served += length
                return length
            }
        }
        assertThat(copy(InboundSource({ endless }, "image/jpeg"))).isEqualTo(InboundCopy.Refused(InboundMediaRefusal.TOO_LARGE))
        assertThat(served).isEqualTo(InboundMediaPolicy.MAX_BYTES + 1)
        assertThat(target.exists()).isFalse()
    }

    @Test
    fun `text claiming to be an image is refused before anything is written`() {
        val html = "<html><script>alert(1)</script></html>".toByteArray() + ByteArray(30)
        assertThat(copy(InboundSource({ ByteArrayInputStream(html) }, "image/png")))
            .isEqualTo(InboundCopy.Refused(InboundMediaRefusal.UNRECOGNIZED))
        assertThat(target.exists()).isFalse()
    }
}
