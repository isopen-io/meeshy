package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Les contournements relevés par la revue de sécurité de #13550 : ce qui passait parce que le nettoyeur raisonnait en liste
 * NOIRE. Une traîne après les trames d'un FLAC (APEv2, ID3v2, Lyrics3, octets quelconques) ; un bloc WebM d'une piste jamais
 * déclarée, une piste déclarée deux fois, un champ inconnu dans une piste vidéo. Chaque cas part nettoyé ou ne part pas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OutgoingMediaAllowListTrapTest {

    private val place = "+48.8566+002.3522/"

    private suspend fun result(bytes: ByteArray, mime: String) =
        OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), Dispatchers.Unconfined).sanitizeOnBothPaths(bytes, "clip", mime)

    private suspend fun sent(bytes: ByteArray, mime: String): ByteArray {
        val outcome = result(bytes, mime)
        assertWithMessage(mime).that(outcome).isInstanceOf(NetworkResult.Success::class.java)
        return (outcome as NetworkResult.Success).data.bytes
    }

    private suspend fun assertRefused(bytes: ByteArray, mime: String) {
        val outcome = result(bytes, mime)
        assertWithMessage(mime).that(outcome).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((outcome as NetworkResult.Failure).error.code).isEqualTo(OutgoingMediaSanitizer.MEDIA_REFUSED_CODE)
    }

    private fun fixture(name: String): ByteArray =
        requireNotNull(javaClass.classLoader?.getResourceAsStream("media-location/$name")) { name }.use { it.readBytes() }

    private fun ascii(text: String) = text.toByteArray(Charsets.ISO_8859_1)

    private fun String.occursIn(bytes: ByteArray) = String(bytes, Charsets.ISO_8859_1).contains(this)

    private fun le32(value: Int) = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array()

    private fun synchsafe(size: Int) = byteArrayOf((size shr 21 and 0x7F).toByte(), (size shr 14 and 0x7F).toByte(), (size shr 7 and 0x7F).toByte(), (size and 0x7F).toByte())

    private fun hex(text: String) = text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    private fun ebml(id: String, body: ByteArray): ByteArray {
        require(body.size < 0x3FFF)
        return hex(id) + byteArrayOf((0x40 or (body.size shr 8)).toByte(), body.size.toByte()) + body
    }

    private val ape: ByteArray by lazy {
        val item = le32(place.length) + le32(0) + ascii("Location") + byteArrayOf(0) + ascii(place)
        fun header(isHeader: Boolean) = ascii("APETAGEX") + le32(2000) + le32(item.size + 32) + le32(1) +
            le32(if (isHeader) 0xA0000000.toInt() else 0x80000000.toInt()) + ByteArray(8)
        header(true) + item + header(false)
    }

    private val id3v2: ByteArray by lazy {
        val frame = ascii("TIT2") + synchsafe(9) + byteArrayOf(0, 0, 3) + ascii("Chez moi")
        ascii("ID3") + byteArrayOf(4, 0, 0) + synchsafe(frame.size) + frame
    }

    private val lyrics3: ByteArray by lazy {
        val body = ascii("LYRICSBEGIN") + ascii("LYR" + "%05d".format(9 + place.length) + "Chez moi $place")
        body + ascii("%06d".format(body.size)) + ascii("LYRICS200")
    }

    private val id3v1 = ascii("TAG") + ascii("Chez moi".padEnd(30, '\u0000')) + ByteArray(95)

    @Test
    fun `un FLAC suivi d APEv2, d ID3v2, de Lyrics3 et d ID3v1 part réduit à son flux, sans aucune de ces étiquettes`() = runTest {
        val flac = fixture("audio_tagged.flac")
        val stream = sent(flac, "audio/flac")

        val out = sent(flac + ape + id3v2 + lyrics3 + id3v1, "audio/flac")

        assertThat(out).isEqualTo(stream)
        listOf(place, "Chez moi", "APETAGEX", "LYRICS").forEach { assertWithMessage(it).that(it.occursIn(out)).isFalse() }
    }

    @Test
    fun `un FLAC suivi d octets inconnus ne part pas`() = runTest {
        val flac = fixture("audio_tagged.flac")

        assertRefused(flac + ascii("SEFH Chez moi trailing bytes"), "audio/flac")
        assertRefused(flac + ape + ascii("Chez moi"), "audio/flac")
    }

    private val ebmlHeader = ebml("1A45DFA3", ebml("4282", ascii("webm")))
    private val unknownSizeSegment = hex("1853806701FFFFFFFFFFFFFF")
    private val info = ebml("1549A966", ebml("2AD7B1", hex("0F4240")))

    private fun trackEntry(number: Int, type: Int, codec: String, vararg extra: ByteArray) =
        ebml("AE", extra.fold(ebml("D7", byteArrayOf(number.toByte())) + ebml("83", byteArrayOf(type.toByte())) + ebml("86", ascii(codec))) { acc, it -> acc + it })

    private fun simpleBlock(track: Int, payload: ByteArray) = ebml("A3", byteArrayOf((0x80 or track).toByte(), 0, 0, 0x80.toByte()) + payload)

    private fun webm(tracks: ByteArray, vararg blocks: ByteArray) =
        ebmlHeader + unknownSizeSegment + info + ebml("1654AE6B", tracks) + ebml("1F43B675", blocks.fold(ebml("E7", byteArrayOf(0))) { acc, it -> acc + it })

    @Test
    fun `un bloc WebM d une piste jamais déclarée part vidé, le bloc de la piste vidéo reste`() = runTest {
        val original = webm(trackEntry(1, 1, "V_VP8"), simpleBlock(1, ascii("FRAME")), simpleBlock(9, ascii("Chez moi, porte 3")))

        val out = sent(original, "video/webm")

        assertThat(out.size).isEqualTo(original.size)
        assertThat("Chez moi".occursIn(out)).isFalse()
        assertThat("FRAME".occursIn(out)).isTrue()
        assertThat(sent(out, "video/webm")).isEqualTo(out)
    }

    @Test
    fun `une piste WebM déclarée deux fois — vidéo puis sous-titres sous le même numéro — fait refuser l envoi`() = runTest {
        val original = webm(
            trackEntry(1, 1, "V_VP8") + trackEntry(1, 0x11, "S_TEXT/UTF8"),
            simpleBlock(1, ascii("Chez moi, porte 3")),
        )

        assertRefused(original, "video/webm")
    }

    @Test
    fun `un champ inconnu dans une piste vidéo admise part vidé, ses champs techniques restent`() = runTest {
        val original = webm(trackEntry(1, 1, "V_VP8", ebml("7446", ascii("Chez moi, porte 3"))), simpleBlock(1, ascii("FRAME")))

        val out = sent(original, "video/webm")

        assertThat(out.size).isEqualTo(original.size)
        assertThat("Chez moi".occursIn(out)).isFalse()
        assertThat("V_VP8".occursIn(out)).isTrue()
        assertThat("FRAME".occursIn(out)).isTrue()
    }

    @Test
    fun `un texte inconnu glissé sous Video ou sous Colour d une piste admise part vidé, les dimensions restent`() = runTest {
        val video = ebml("E0", ebml("B0", byteArrayOf(64)) + ebml("BA", byteArrayOf(48)) + ebml("7446", ascii("Chez moi, porte 3")) +
            ebml("55B0", ebml("55B9", byteArrayOf(1)) + ebml("4D80", ascii("Tour Eiffel"))))
        val audio = ebml("E1", ebml("9F", byteArrayOf(2)) + ebml("7446", ascii("Lieu-dit")))
        val original = webm(trackEntry(1, 1, "V_VP8", video) + trackEntry(2, 2, "A_OPUS", audio), simpleBlock(1, ascii("FRAME")))

        val out = sent(original, "video/webm")

        assertThat(out.size).isEqualTo(original.size)
        listOf("Chez moi", "Tour Eiffel", "Lieu-dit").forEach { assertWithMessage(it).that(it.occursIn(out)).isFalse() }
        listOf(hex("B0400140"), hex("BA400130"), hex("55B9400101"), hex("9F400102")).forEach { field ->
            assertWithMessage(field.joinToString()).that(String(out, Charsets.ISO_8859_1).contains(String(field, Charsets.ISO_8859_1))).isTrue()
        }
        assertThat(sent(out, "video/webm")).isEqualTo(out)
    }
}
