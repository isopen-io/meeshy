package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** L'en-tête d'un WAV PCM : ce qu'on sait lire sans codec, et ce qu'on laisse à `MediaCodec`. */
class WavHeaderTest {

    private fun le(value: Long, bytes: Int) = ByteArray(bytes) { ((value ushr (8 * it)) and 0xFF).toByte() }

    private fun chunk(tag: String, body: ByteArray): ByteArray =
        tag.toByteArray() + le(body.size.toLong(), 4) + body + (if (body.size % 2 == 1) byteArrayOf(0) else byteArrayOf())

    private fun fmt(tag: Int, channels: Int, rate: Int, bits: Int): ByteArray =
        le(tag.toLong(), 2) + le(channels.toLong(), 2) + le(rate.toLong(), 4) +
            le((rate * channels * bits / 8).toLong(), 4) + le((channels * bits / 8).toLong(), 2) + le(bits.toLong(), 2)

    private fun wav(fmtBody: ByteArray, data: ByteArray, extra: ByteArray = ByteArray(0), declaredData: Long? = null): ByteArray {
        val dataChunk = "data".toByteArray() + le(declaredData ?: data.size.toLong(), 4) + data
        val payload = "WAVE".toByteArray() + chunk("fmt ", fmtBody) + extra + dataChunk
        return "RIFF".toByteArray() + le(payload.size.toLong(), 4) + payload
    }

    @Test
    fun `un WAV PCM 16 bits mono est lu sans codec`() {
        val bytes = wav(fmt(1, 1, 44_100, 16), ByteArray(4_000))

        val header = WavHeader.parse(bytes.copyOf(minOf(bytes.size, 65_536)), fileLength = bytes.size.toLong())

        assertThat(header).isEqualTo(WavHeader(1, 44_100, PcmEncoding.PCM_16BIT, dataOffset = 44, dataBytes = 4_000))
        assertThat(header!!.totalFrames).isEqualTo(2_000)
    }

    @Test
    fun `un WAV flottant stereo est reconnu`() {
        val bytes = wav(fmt(3, 2, 48_000, 32), ByteArray(8_000))

        val header = WavHeader.parse(bytes, bytes.size.toLong())

        assertThat(header!!.encoding).isEqualTo(PcmEncoding.PCM_FLOAT)
        assertThat(header.channelCount).isEqualTo(2)
        assertThat(header.totalFrames).isEqualTo(1_000)
    }

    @Test
    fun `un chunk intermediaire est saute et le remplissage pair respecte`() {
        val bytes = wav(fmt(1, 1, 8_000, 16), ByteArray(100), extra = chunk("LIST", ByteArray(7)))

        val header = WavHeader.parse(bytes, bytes.size.toLong())

        assertThat(header!!.dataOffset).isEqualTo(12 + 24 + 16 + 8)
        assertThat(header.dataBytes).isEqualTo(100)
    }

    @Test
    fun `le format extensible lit son sous-format`() {
        val extension = le(22, 2) + le(16, 2) + le(3, 4) + le(1, 2) + ByteArray(14)
        val bytes = wav(fmt(0xFFFE, 2, 44_100, 16).copyOf(16) + extension, ByteArray(400))

        assertThat(WavHeader.parse(bytes, bytes.size.toLong())!!.encoding).isEqualTo(PcmEncoding.PCM_16BIT)
    }

    @Test
    fun `une taille de donnees nulle ou trop grande court jusqu'a la fin du fichier`() {
        val streamed = wav(fmt(1, 1, 8_000, 16), ByteArray(1_000), declaredData = 0xFFFFFFFFL)
        val zero = wav(fmt(1, 1, 8_000, 16), ByteArray(1_000), declaredData = 0)

        assertThat(WavHeader.parse(streamed, streamed.size.toLong())!!.dataBytes).isEqualTo(1_000)
        assertThat(WavHeader.parse(zero, zero.size.toLong())!!.dataBytes).isEqualTo(1_000)
    }

    @Test
    fun `un fichier tronque garde les donnees presentes`() {
        val bytes = wav(fmt(1, 1, 8_000, 16), ByteArray(1_000))
        val truncated = bytes.copyOf(500)

        assertThat(WavHeader.parse(truncated, truncated.size.toLong())!!.dataBytes).isEqualTo(500L - 44)
    }

    @Test
    fun `ce qui n'est pas du PCM 16 bits ou flottant revient au codec`() {
        assertThat(WavHeader.parse(wav(fmt(1, 1, 8_000, 24), ByteArray(60)), 104)).isNull()
        assertThat(WavHeader.parse(wav(fmt(2, 1, 8_000, 4), ByteArray(60)), 104)).isNull()
        assertThat(WavHeader.parse(wav(fmt(1, 0, 8_000, 16), ByteArray(60)), 104)).isNull()
    }

    @Test
    fun `un fichier qui n'est pas un WAV ou sans donnees est refuse`() {
        assertThat(WavHeader.parse(ByteArray(0), 0)).isNull()
        assertThat(WavHeader.parse(ByteArray(64), 64)).isNull()
        assertThat(WavHeader.parse("RIFF".toByteArray() + ByteArray(4) + "AVI ".toByteArray(), 12)).isNull()
        val noData = "RIFF".toByteArray() + le(28, 4) + "WAVE".toByteArray() + chunk("fmt ", fmt(1, 1, 8_000, 16))
        assertThat(WavHeader.parse(noData, noData.size.toLong())).isNull()
        val empty = wav(fmt(1, 1, 8_000, 16), ByteArray(0))
        assertThat(WavHeader.parse(empty, empty.size.toLong())).isNull()
    }

    @Test
    fun `des donnees avant le format sont refusees`() {
        val data = "data".toByteArray() + le(4, 4) + ByteArray(4)
        val bytes = "RIFF".toByteArray() + le(0, 4) + "WAVE".toByteArray() + data + chunk("fmt ", fmt(1, 1, 8_000, 16))

        assertThat(WavHeader.parse(bytes, bytes.size.toLong())).isNull()
    }

    @Test
    fun `un en-tete plus long que la fenetre lue est refuse`() {
        val big = wav(fmt(1, 1, 8_000, 16), ByteArray(10), extra = chunk("LIST", ByteArray(200)))

        assertThat(WavHeader.parse(big.copyOf(100), big.size.toLong())).isNull()
    }
}
