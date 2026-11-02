package me.meeshy.ui.component.lottie

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.zip.CRC32
import java.util.zip.Deflater

class AnimatedImageEncoderTest {
    private class Chunk(val type: String, val data: ByteArray, val crcOk: Boolean)

    private fun png(width: Int, height: Int, argb: Int): ByteArray {
        val raw = ByteArrayOutputStream()
        repeat(height) {
            raw.write(0)
            repeat(width) {
                raw.write(argb shr 16 and 0xFF); raw.write(argb shr 8 and 0xFF); raw.write(argb and 0xFF); raw.write(argb ushr 24)
            }
        }
        val deflater = Deflater().apply { setInput(raw.toByteArray()); finish() }
        val buffer = ByteArray(4096)
        val idat = ByteArrayOutputStream()
        while (!deflater.finished()) idat.write(buffer, 0, deflater.deflate(buffer))
        val out = ByteArrayOutputStream()
        out.write(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))
        chunk(out, "IHDR", ByteBuffer.allocate(13).putInt(width).putInt(height).put(8).put(6).put(0).put(0).put(0).array())
        chunk(out, "IDAT", idat.toByteArray())
        chunk(out, "IEND", ByteArray(0))
        return out.toByteArray()
    }

    private fun chunk(out: ByteArrayOutputStream, type: String, data: ByteArray) {
        out.write(ByteBuffer.allocate(4).putInt(data.size).array())
        out.write(type.toByteArray())
        out.write(data)
        val crc = CRC32().apply { update(type.toByteArray()); update(data) }
        out.write(ByteBuffer.allocate(4).putInt(crc.value.toInt()).array())
    }

    private fun chunks(apng: ByteArray): List<Chunk> {
        val list = mutableListOf<Chunk>()
        var p = 8
        while (p < apng.size) {
            val len = ByteBuffer.wrap(apng, p, 4).int
            val type = String(apng, p + 4, 4)
            val data = apng.copyOfRange(p + 8, p + 8 + len)
            val crc = CRC32().apply { update(type.toByteArray()); update(data) }
            list += Chunk(type, data, ByteBuffer.wrap(apng, p + 8 + len, 4).int == crc.value.toInt())
            p += 12 + len
        }
        return list
    }

    private val frames = listOf(png(4, 4, 0x80FF0000.toInt()), png(4, 4, 0x4000FF00), png(4, 4, 0xFF0000FF.toInt()))

    @Test fun `les blocs APNG sont dans l'ordre avec des empreintes valides`() {
        val parsed = chunks(ApngAssembler.assemble(frames, delayMillis = 67)!!)
        assertThat(parsed.map { it.type }).containsExactly("IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "fcTL", "fdAT", "IEND").inOrder()
        assertThat(parsed.all { it.crcOk }).isTrue()
    }

    @Test fun `acTL annonce les images et la boucle infinie`() {
        val actl = chunks(ApngAssembler.assemble(frames, 67)!!).first { it.type == "acTL" }.data
        assertThat(ByteBuffer.wrap(actl).int).isEqualTo(3)
        assertThat(ByteBuffer.wrap(actl, 4, 4).int).isEqualTo(0)
    }

    @Test fun `les numeros de sequence se suivent et le delai est en millisecondes`() {
        val parsed = chunks(ApngAssembler.assemble(frames, 67)!!)
        val seqs = parsed.filter { it.type == "fcTL" || it.type == "fdAT" }.map { ByteBuffer.wrap(it.data).int }
        assertThat(seqs).containsExactly(0, 1, 2, 3, 4).inOrder()
        val fctl = ByteBuffer.wrap(parsed.first { it.type == "fcTL" }.data)
        assertThat(fctl.getShort(20).toInt()).isEqualTo(67)
        assertThat(fctl.getShort(22).toInt()).isEqualTo(1000)
        assertThat(fctl.get(25).toInt()).isEqualTo(0)
    }

    @Test fun `l'alpha est conserve dans les donnees de l'image`() {
        val ihdr = chunks(ApngAssembler.assemble(frames, 67)!!).first { it.type == "IHDR" }.data
        assertThat(ihdr[9].toInt()).isEqualTo(6)
    }

    @Test fun `des tailles differentes ou un PNG illisible ne s'assemblent pas`() {
        assertThat(ApngAssembler.assemble(listOf(png(4, 4, 0), png(8, 8, 0)), 67)).isNull()
        assertThat(ApngAssembler.assemble(listOf(byteArrayOf(1, 2, 3)), 67)).isNull()
        assertThat(ApngAssembler.assemble(emptyList(), 67)).isNull()
    }

    @Test fun `le nombre d'images d'un film est borne et sans plantage`() {
        assertThat(LottieFilmRaster.frameCount(1.0, 15.0)).isEqualTo(15)
        assertThat(LottieFilmRaster.frameCount(Double.NaN, 15.0)).isEqualTo(1)
        assertThat(LottieFilmRaster.frameCount(Double.POSITIVE_INFINITY, 15.0)).isEqualTo(1)
        assertThat(LottieFilmRaster.frameCount(10_000.0, 15.0)).isEqualTo(LottieFilmRaster.MAX_FRAMES)
    }
}
