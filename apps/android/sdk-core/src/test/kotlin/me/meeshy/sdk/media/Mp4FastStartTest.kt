package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import org.junit.Test

class Mp4FastStartTest {

    private fun box(type: String, payload: ByteArray): ByteArray =
        ByteBuffer.allocate(8 + payload.size).putInt(8 + payload.size).put(type.toByteArray()).put(payload).array()

    private fun stco(offset: Int): ByteArray =
        box("stco", ByteBuffer.allocate(12).putInt(0).putInt(1).putInt(offset).array())

    private fun moov(offset: Int): ByteArray =
        box("moov", box("trak", box("mdia", box("minf", box("stbl", stco(offset))))))

    private fun sample(): ByteArray {
        val ftyp = box("ftyp", "isom0000".toByteArray())
        val mdat = box("mdat", ByteArray(100) { 9 })
        val payloadOffset = ftyp.size + 8
        return ByteArrayOutputStream().apply {
            write(ftyp); write(mdat); write(moov(payloadOffset))
        }.toByteArray()
    }

    private fun types(bytes: ByteArray): List<String> {
        val out = mutableListOf<String>()
        var at = 0
        while (at < bytes.size) {
            val size = ByteBuffer.wrap(bytes, at, 4).int
            out += String(bytes, at + 4, 4)
            at += size
        }
        return out
    }

    @Test
    fun `moov passe avant mdat et les offsets de chunks suivent`() {
        val file = File.createTempFile("fast", ".mp4").apply { writeBytes(sample()) }
        val originalMoovSize = moov(0).size

        assertThat(Mp4FastStart.apply(file)).isTrue()

        val result = file.readBytes()
        assertThat(types(result)).containsExactly("ftyp", "moov", "mdat").inOrder()
        val mdatPayload = result.size - 100
        val stcoAt = result.indexOfSlice("stco".toByteArray()) + 4 + 8
        assertThat(ByteBuffer.wrap(result, stcoAt, 4).int).isEqualTo(mdatPayload)
        assertThat(result.size).isEqualTo(sample().size)
        assertThat(originalMoovSize).isGreaterThan(0)
    }

    @Test
    fun `un fichier déjà en démarrage rapide reste intact`() {
        val ftyp = box("ftyp", "isom0000".toByteArray())
        val bytes = ftyp + moov(0) + box("mdat", ByteArray(10))
        val file = File.createTempFile("fast", ".mp4").apply { writeBytes(bytes) }
        assertThat(Mp4FastStart.apply(file)).isFalse()
        assertThat(file.readBytes()).isEqualTo(bytes)
    }

    @Test
    fun `un fichier illisible reste intact`() {
        val file = File.createTempFile("fast", ".mp4").apply { writeBytes(ByteArray(5) { 3 }) }
        assertThat(Mp4FastStart.apply(file)).isFalse()
        assertThat(file.readBytes()).hasLength(5)
    }

    private fun ByteArray.indexOfSlice(needle: ByteArray): Int =
        (0..size - needle.size).first { start -> needle.indices.all { this[start + it] == needle[it] } }
}
