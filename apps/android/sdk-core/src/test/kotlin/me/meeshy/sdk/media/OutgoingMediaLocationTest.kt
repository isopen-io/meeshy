package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.nio.ByteBuffer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Une vidéo ou un son ne quitte jamais l'appareil avec son lieu (#13543, #13490) — sur de VRAIS fichiers écrits par
 * ffmpeg (`src/test/resources/media-location/`) : `udta/loci` (3GPP), `udta/©xyz` (QuickTime, ce qu'écrit
 * `MediaMuxer.setLocation`), `meta/keys` `com.apple.quicktime.location.ISO6709` (iPhone), `Tags` WebM.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OutgoingMediaLocationTest {

    private fun sanitizer(keepsLocation: Boolean = false) =
        OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(keepsLocation), Dispatchers.Unconfined)

    private fun fixture(name: String): ByteArray =
        requireNotNull(javaClass.classLoader?.getResourceAsStream("media-location/$name")) { name }.use { it.readBytes() }

    private suspend fun result(bytes: ByteArray, mime: String, keepsLocation: Boolean = false) =
        sanitizer(keepsLocation).sanitizeOnBothPaths(bytes, "clip", mime)

    private suspend fun sent(bytes: ByteArray, mime: String, keepsLocation: Boolean = false) =
        (result(bytes, mime, keepsLocation) as NetworkResult.Success).data.bytes

    private fun ascii(text: String) = text.toByteArray(Charsets.ISO_8859_1)

    private fun String.occursIn(bytes: ByteArray) = String(bytes, Charsets.ISO_8859_1).contains(this)

    private fun ByteArray.indexOf(text: String) = String(this, Charsets.ISO_8859_1).indexOf(text)

    private data class TopBox(val type: String, val offset: Int, val size: Int)

    private fun topLevel(bytes: ByteArray): List<TopBox> {
        val boxes = mutableListOf<TopBox>()
        var at = 0
        while (at + 8 <= bytes.size) {
            val size = ByteBuffer.wrap(bytes, at, 4).int
            boxes += TopBox(String(bytes, at + 4, 4, Charsets.ISO_8859_1), at, size)
            at += size
        }
        return boxes
    }

    private fun ByteArray.boxBytes(type: String): List<ByteArray> {
        val text = String(this, Charsets.ISO_8859_1)
        val found = mutableListOf<ByteArray>()
        var from = 0
        while (true) {
            val at = text.indexOf(type, from).takeIf { it >= 4 } ?: return found
            val size = ByteBuffer.wrap(this, at - 4, 4).int
            if (size in 8..(this.size - at + 4)) found += copyOfRange(at - 4, at - 4 + size)
            from = at + 4
        }
    }

    private val isoFixtures = listOf(
        "video_location.mp4" to "video/mp4",
        "video_location.mov" to "video/quicktime",
        "video_apple_keys.mov" to "video/quicktime",
        "voice_location.m4a" to "audio/mp4",
        "video_location.3gp" to "video/3gpp",
    )

    private val locationMarkers = listOf("loci", "©xyz", "ISO6709", "+48.8566", "+002.3522")

    @Test
    fun `chaque fixture porte bien un lieu avant le retrait`() {
        isoFixtures.forEach { (name, _) ->
            assertWithMessage(name).that(locationMarkers.any { it.occursIn(fixture(name)) }).isTrue()
        }
    }

    @Test
    fun `une vidéo ou un son ISO part sans aucun atome de lieu`() = runTest {
        isoFixtures.forEach { (name, mime) ->
            val out = sent(fixture(name), mime)
            locationMarkers.forEach { marker -> assertWithMessage("$name / $marker").that(marker.occursIn(out)).isFalse() }
            listOf("udta", "keys", "ilst", "com.apple").forEach { assertWithMessage("$name / $it").that(it.occursIn(out)).isFalse() }
        }
    }

    @Test
    fun `le retrait ne réencode rien — même taille, mêmes échantillons, mêmes pistes, même rotation, moov reste devant mdat`() = runTest {
        isoFixtures.forEach { (name, mime) ->
            val original = fixture(name)
            val out = sent(original, mime)

            assertWithMessage(name).that(out.size).isEqualTo(original.size)
            val before = topLevel(original)
            val after = topLevel(out)
            assertWithMessage(name).that(after.map { it.offset to it.size }).isEqualTo(before.map { it.offset to it.size })
            assertWithMessage(name).that(after.map { it.type }.filter { it != "free" }).isEqualTo(before.map { it.type }.filter { it in KEPT_TOP && it != "free" })
            before.filter { it.type == "mdat" }.forEach { mdat ->
                assertWithMessage(name).that(out.copyOfRange(mdat.offset, mdat.offset + mdat.size)).isEqualTo(original.copyOfRange(mdat.offset, mdat.offset + mdat.size))
            }
            listOf("tkhd", "mvhd", "mdhd", "stsd", "stco", "stsz", "stts", "elst").forEach { type ->
                assertWithMessage("$name / $type").that(out.boxBytes(type).map { it.toList() }).isEqualTo(original.boxBytes(type).map { it.toList() })
            }
        }
    }

    @Test
    fun `la vidéo à démarrage rapide garde moov devant mdat et sa rotation de 90 degrés`() = runTest {
        val original = fixture("video_location.mp4")
        val out = sent(original, "video/mp4")

        assertThat(out.indexOf("moov")).isLessThan(out.indexOf("mdat"))
        val tkhd = out.boxBytes("tkhd").first()
        val matrix = ByteBuffer.wrap(tkhd, tkhd.size - 44, 36)
        assertThat(matrix.int).isEqualTo(0)
        assertThat(matrix.int).isNotEqualTo(0)
    }

    @Test
    fun `repasser une vidéo nettoyée ne change plus rien`() = runTest {
        isoFixtures.forEach { (name, mime) ->
            val once = sent(fixture(name), mime)
            assertWithMessage(name).that(sent(once, mime)).isEqualTo(once)
        }
    }

    @Test
    fun `le réglage Conserver le lieu laisse partir la vidéo telle quelle`() = runTest {
        val original = fixture("video_location.mov")
        assertThat(sent(original, "video/quicktime", keepsLocation = true)).isEqualTo(original)
    }

    @Test
    fun `un XMP posé dans une boîte uuid de premier niveau ne part pas`() = runTest {
        val xmp = box("uuid", hex("BE7ACFCB97A942E89C71999491E3AFAC") + ascii("<x:xmpmeta><exif:GPSLatitude>48,51N</exif:GPSLatitude></x:xmpmeta>"))
        val original = fixture("video_location.mp4") + xmp

        val out = sent(original, "video/mp4")

        assertThat(out.size).isEqualTo(original.size)
        listOf("xmpmeta", "GPSLatitude", "48,51N").forEach { assertWithMessage(it).that(it.occursIn(out)).isFalse() }
    }

    @Test
    fun `une piste de métadonnées minutées part vide et sa piste disparaît`() = runTest {
        val sample = ascii("+48.8566+002.3522+035.000/")
        val video = timedMetadataMovie(sample)

        val out = sent(video, "video/quicktime")

        assertThat(out.size).isEqualTo(video.size)
        assertThat("+48.8566".occursIn(out)).isFalse()
        assertThat("trak".occursIn(out)).isFalse()
        assertThat("FRAMES".occursIn(out)).isTrue()
    }

    @Test
    fun `un moov compressé ou illisible fait échouer l envoi au lieu de partir tel quel`() = runTest {
        val compressed = box("ftyp", ascii("qt  ") + ByteArray(4)) + box("moov", box("cmov", ascii("zlib+48.8566"))) + box("mdat", ascii("FRAMES"))
        val broken = box("ftyp", ascii("isom") + ByteArray(4)) + box("moov", ByteBuffer.allocate(12).putInt(400).put(ascii("udta")).put(ascii("loci")).array()) + box("mdat", ascii("FRAMES"))

        listOf(compressed, broken).forEach { bytes ->
            val failure = result(bytes, "video/mp4") as NetworkResult.Failure
            assertThat(failure.error.code).isEqualTo(OutgoingMediaSanitizer.MEDIA_REFUSED_CODE)
        }
    }

    @Test
    fun `une traîne illisible après le film part coupée, jamais telle quelle`() = runTest {
        val original = fixture("video_location.mov")
        val trailer = ascii("SEFH\u0000+48.8566+002.3522/SEFT")

        val out = sent(original + trailer, "video/quicktime")

        assertThat(out.size).isEqualTo(original.size)
        assertThat("+48.8566".occursIn(out)).isFalse()
    }

    @Test
    fun `une vidéo WebM perd ses Tags de lieu et de titre sans changer de taille ni d images`() = runTest {
        val original = fixture("video_location.webm")
        val clusterAt = original.indexOfSequence(hex("1F43B675"), from = original.indexOf("+48.8566"))

        val out = sent(original, "video/webm")

        assertThat(out.size).isEqualTo(original.size)
        listOf("+48.8566", "Chez moi").forEach { assertThat(it.occursIn(original)).isTrue(); assertWithMessage(it).that(it.occursIn(out)).isFalse() }
        assertThat(out.copyOfRange(clusterAt, out.size)).isEqualTo(original.copyOfRange(clusterAt, original.size))
        assertThat(sent(out, "video/webm")).isEqualTo(out)
    }

    @Test
    fun `une vidéo ou un son dont on ne sait pas lire le conteneur ne part pas`() = runTest {
        val avi = ascii("RIFF") + ByteArray(4) + ascii("AVI LIST") + ascii("+48.8566+002.3522/")
        val mp3 = ascii("ID3") + byteArrayOf(4, 0, 0, 0, 0, 0, 20) + ascii("TXXX+48.8566+002.35")

        listOf(avi to "video/x-msvideo", mp3 to "audio/mpeg").forEach { (bytes, mime) ->
            val failure = result(bytes, mime) as NetworkResult.Failure
            assertWithMessage(mime).that(failure.error.code).isEqualTo(OutgoingMediaSanitizer.MEDIA_REFUSED_CODE)
        }
    }

    private fun box(type: String, body: ByteArray) = ByteBuffer.allocate(8 + body.size).putInt(8 + body.size).put(ascii(type)).put(body).array()

    private fun full(type: String, body: ByteArray) = box(type, ByteArray(4) + body)

    private fun hex(text: String) = text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    private fun ByteArray.indexOfSequence(needle: ByteArray, from: Int): Int =
        (from..size - needle.size).first { at -> needle.indices.all { this[at + it] == needle[it] } }

    private fun u32(vararg values: Int) = values.fold(ByteArray(0)) { acc, v -> acc + ByteBuffer.allocate(4).putInt(v).array() }

    /** Un film QuickTime : une piste `meta` (handler `meta`, comme les `mebx` de l'iPhone) dont l'unique échantillon est un lieu. */
    private fun timedMetadataMovie(sample: ByteArray): ByteArray {
        val ftyp = box("ftyp", ascii("qt  ") + ByteArray(4))
        fun moov(chunkOffset: Int): ByteArray {
            val stbl = box(
                "stbl",
                full("stsd", u32(0)) + full("stsz", u32(sample.size, 1)) + full("stsc", u32(1, 1, 1, 1)) + full("stco", u32(1, chunkOffset)),
            )
            val minf = box("minf", full("nmhd", ByteArray(0)) + stbl)
            val mdia = box("mdia", full("mdhd", ByteArray(20)) + full("hdlr", u32(0) + ascii("meta") + ByteArray(13)) + minf)
            val trak = box("trak", full("tkhd", ByteArray(80)) + mdia)
            return box("moov", full("mvhd", ByteArray(96)) + trak)
        }
        val moovSize = moov(0).size
        val mdat = box("mdat", ascii("FRAMES") + sample)
        val sampleOffset = ftyp.size + moovSize + 8 + 6
        return ftyp + moov(sampleOffset) + mdat
    }

    private companion object {
        val KEPT_TOP = setOf("ftyp", "moov", "mdat", "free", "wide")
    }
}
