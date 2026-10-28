package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.NetworkResult
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Un morceau partagé dans une conversation part SANS ses étiquettes, jamais refusé quand on sait les retirer (#13550, #13543) —
 * sur de VRAIS fichiers écrits par ffmpeg (`src/test/resources/media-location/audio_*`, titre « Chez moi », artiste « Tour
 * Eiffel », commentaire et lieu `+48.8566+002.3522/`) : MP3 (ID3v2.3/2.4, image, ID3v1, et APEv2 / Lyrics3 posés à la main),
 * WAV (`bext`, `LIST/INFO`, puis `iXML`, `_PMX`, `id3 `, `cart`), FLAC (VORBIS_COMMENT, PICTURE), AIFF (NAME, (c), ANNO, ID3),
 * CAF (`info`). L'Ogg reste refusé ; une piste de sous-titres WebM part vidée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OutgoingAudioLocationTest {

    private val place = "+48.8566+002.3522/"
    private val texts = listOf("+48.8566", "Chez moi", "Tour Eiffel")

    private suspend fun result(bytes: ByteArray, mime: String) =
        OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), Dispatchers.Unconfined).sanitize(MediaUploadItem(bytes, "clip", mime))

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

    private fun assertNoText(name: String, bytes: ByteArray) =
        texts.forEach { assertWithMessage("$name / $it").that(it.occursIn(bytes)).isFalse() }

    private fun synchsafe(size: Int) = byteArrayOf((size shr 21 and 0x7F).toByte(), (size shr 14 and 0x7F).toByte(), (size shr 7 and 0x7F).toByte(), (size and 0x7F).toByte())

    private fun id3v2Size(bytes: ByteArray) = 10 + ((bytes[6].toInt() shl 21) or (bytes[7].toInt() shl 14) or (bytes[8].toInt() shl 7) or bytes[9].toInt())

    private fun le32(value: Int) = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array()

    private fun be32(value: Int) = ByteBuffer.allocate(4).putInt(value).array()

    private data class Chunk(val id: String, val offset: Int, val size: Int)

    private fun chunks(bytes: ByteArray, order: ByteOrder): List<Chunk> {
        val found = mutableListOf<Chunk>()
        var at = 12
        while (at + 8 <= bytes.size) {
            val size = ByteBuffer.wrap(bytes, at + 4, 4).order(order).int
            found += Chunk(String(bytes, at, 4, Charsets.ISO_8859_1), at, size)
            at += 8 + size + (size and 1)
        }
        return found
    }

    private fun ByteArray.body(chunk: Chunk) = copyOfRange(chunk.offset + 8, chunk.offset + 8 + chunk.size)

    private fun riffChunk(id: String, body: ByteArray) = ascii(id) + le32(body.size) + body + if (body.size % 2 == 1) byteArrayOf(0) else ByteArray(0)

    private fun withRiffChunks(wav: ByteArray, vararg extra: ByteArray): ByteArray {
        val body = extra.fold(wav.copyOfRange(12, wav.size)) { acc, chunk -> acc + chunk }
        return ascii("RIFF") + le32(4 + body.size) + ascii("WAVE") + body
    }

    @Test
    fun `chaque fixture audio porte bien ses étiquettes et son lieu avant le retrait`() {
        listOf("audio_tagged.mp3", "audio_cover.mp3", "audio_tagged.wav", "audio_tagged.flac", "audio_tagged.aiff", "audio_tagged.caf", "audio_tagged.ogg")
            .forEach { name -> texts.take(2).forEach { assertWithMessage("$name / $it").that(it.occursIn(fixture(name))).isTrue() } }
    }

    @Test
    fun `un MP3 part sans ID3v2, sans image ni ID3v1, et ses trames MPEG — en-tête Xing compris — restent octet pour octet`() = runTest {
        listOf("audio_tagged.mp3" to true, "audio_cover.mp3" to false).forEach { (name, hasV1) ->
            val original = fixture(name)
            val frames = original.copyOfRange(id3v2Size(original), original.size - if (hasV1) 128 else 0)

            val out = sent(original, "audio/mpeg")

            assertWithMessage(name).that(out).isEqualTo(frames)
            assertNoText(name, out)
            assertWithMessage(name).that(sent(out, "audio/mpeg")).isEqualTo(out)
        }
        assertThat("Xing".occursIn(sent(fixture("audio_tagged.mp3"), "audio/mpeg"))).isTrue()
    }

    @Test
    fun `un MP3 à en-tête étendu et pied ID3v2_4, suivi d APEv2, de Lyrics3 et d ID3v1, part réduit à ses seules trames`() = runTest {
        val original = fixture("audio_cover.mp3")
        val frames = original.copyOfRange(id3v2Size(original), original.size)
        val extended = synchsafe(6) + byteArrayOf(1, 0)
        val frame = ascii("TXXX") + synchsafe(1 + place.length) + byteArrayOf(0, 0, 3) + ascii(place)
        val id3Body = extended + frame
        val id3v24 = ascii("ID3") + byteArrayOf(4, 0, 0x50) + synchsafe(id3Body.size) + id3Body + ascii("3DI") + byteArrayOf(4, 0, 0x50) + synchsafe(id3Body.size)
        val apeItem = le32(place.length) + le32(0) + ascii("Location") + byteArrayOf(0) + ascii(place)
        fun apeHeader(isHeader: Boolean) = ascii("APETAGEX") + le32(2000) + le32(apeItem.size + 32) + le32(1) +
            le32(if (isHeader) 0xA0000000.toInt() else 0x80000000.toInt()) + ByteArray(8)
        val ape = apeHeader(true) + apeItem + apeHeader(false)
        val lyricsBody = ascii("LYRICSBEGIN") + ascii("IND00003") + ascii("110") + ascii("LYR" + "%05d".format(9 + place.length) + "Chez moi $place")
        val lyrics3 = lyricsBody + ascii("%06d".format(lyricsBody.size)) + ascii("LYRICS200")
        val id3v1 = ascii("TAG") + ascii("Chez moi".padEnd(30, '\u0000')) + ByteArray(95)

        val out = sent(id3v24 + frames + ape + lyrics3 + id3v1, "application/octet-stream")

        assertThat(out).isEqualTo(frames)
        assertNoText("mp3 piégé", out)
    }

    @Test
    fun `un MP3 sans aucune étiquette part tel quel`() = runTest {
        val bare = sent(fixture("audio_cover.mp3"), "audio/mpeg")

        assertThat(sent(bare, "audio/mpeg")).isSameInstanceAs(bare)
    }

    @Test
    fun `un MP3 dont une étiquette déborde ou qui ne contient aucune trame ne part pas`() = runTest {
        val frames = sent(fixture("audio_cover.mp3"), "audio/mpeg")
        val overflowing = ascii("ID3") + byteArrayOf(4, 0, 0) + synchsafe(frames.size + 50) + frames
        val noFrames = ascii("ID3") + byteArrayOf(4, 0, 0) + synchsafe(place.length) + ascii(place) + ascii("not an mpeg stream at all")
        val garbageAfter = frames + ascii("SEFH $place trailing")

        assertRefused(overflowing, "audio/mpeg")
        assertRefused(noFrames, "audio/mpeg")
        assertRefused(garbageAfter, "audio/mpeg")
    }

    @Test
    fun `un WAV ne garde que fmt, fact et data — bext, LIST INFO, iXML, XMP, id3 et cart partent — et ses échantillons restent identiques`() = runTest {
        val original = withRiffChunks(
            fixture("audio_tagged.wav"),
            riffChunk("iXML", ascii("<BWFXML><LOCATION>$place</LOCATION></BWFXML>")),
            riffChunk("_PMX", ascii("<x:xmpmeta><exif:GPSLatitude>48,51N</exif:GPSLatitude></x:xmpmeta>")),
            riffChunk("id3 ", ascii("ID3") + byteArrayOf(3, 0, 0) + synchsafe(9) + ascii("Chez moi!")),
            riffChunk("cart", ascii("Tour Eiffel")),
        )
        val data = chunks(original, ByteOrder.LITTLE_ENDIAN).first { it.id == "data" }

        val out = sent(original, "audio/wav")

        val kept = chunks(out, ByteOrder.LITTLE_ENDIAN)
        assertThat(kept.map { it.id }).containsExactly("fmt ", "data").inOrder()
        assertThat(ByteBuffer.wrap(out, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int).isEqualTo(out.size - 8)
        assertThat(out.body(kept[1])).isEqualTo(original.body(data))
        assertNoText("wav", out)
        listOf("bext", "LIST", "iXML", "xmpmeta", "48,51N").forEach { assertWithMessage(it).that(it.occursIn(out)).isFalse() }
        assertThat(sent(out, "audio/wav")).isEqualTo(out)
    }

    @Test
    fun `un WAV RF64, BW64, RIFX, sans data, ou dont data déborde ne part pas`() = runTest {
        val wav = fixture("audio_tagged.wav")
        val fmt = chunks(wav, ByteOrder.LITTLE_ENDIAN).first { it.id == "fmt " }
        val fmtChunk = wav.copyOfRange(fmt.offset, fmt.offset + 8 + fmt.size)
        val overflowing = ascii("RIFF") + le32(4 + fmtChunk.size + 8 + 4) + ascii("WAVE") + fmtChunk + ascii("data") + le32(-1) + ascii("$place!!")

        listOf("RF64", "BW64", "RIFX").forEach { magic -> assertRefused(ascii(magic) + wav.copyOfRange(4, wav.size), "audio/wav") }
        assertRefused(ascii("RIFF") + le32(4 + fmtChunk.size) + ascii("WAVE") + fmtChunk, "audio/wav")
        assertRefused(overflowing, "audio/wav")
    }

    @Test
    fun `un FLAC garde STREAMINFO et ses trames à leur place — VORBIS_COMMENT et PICTURE deviennent du PADDING de même taille`() = runTest {
        val original = fixture("audio_tagged.flac")

        val out = sent(original, "audio/flac")

        assertThat(out.size).isEqualTo(original.size)
        assertThat(out.copyOfRange(0, 42)).isEqualTo(original.copyOfRange(0, 42))
        val blocks = flacBlocks(out)
        assertThat(blocks.map { it.first }.toSet()).containsExactly(0, 1)
        val audioAt = blocks.last().second
        assertThat(out.copyOfRange(audioAt, out.size)).isEqualTo(original.copyOfRange(audioAt, original.size))
        assertNoText("flac", out)
        assertThat(sent(out, "audio/flac")).isEqualTo(out)
    }

    @Test
    fun `un FLAC dont le premier bloc n est pas STREAMINFO ou dont un bloc déborde ne part pas`() = runTest {
        val original = fixture("audio_tagged.flac")
        val noStreamInfo = original.copyOf().also { it[4] = 4 }
        val overflowing = original.copyOfRange(0, 60)

        assertRefused(noStreamInfo, "audio/flac")
        assertRefused(overflowing, "audio/flac")
    }

    private fun flacBlocks(bytes: ByteArray): List<Pair<Int, Int>> {
        val found = mutableListOf<Pair<Int, Int>>()
        var at = 4
        while (true) {
            val header = bytes[at].toInt() and 0xFF
            val length = ((bytes[at + 1].toInt() and 0xFF) shl 16) or ((bytes[at + 2].toInt() and 0xFF) shl 8) or (bytes[at + 3].toInt() and 0xFF)
            at += 4 + length
            found += (header and 0x7F) to at
            if (header and 0x80 != 0) return found
        }
    }

    @Test
    fun `un AIFF ne garde que COMM et SSND — NAME, (c), ANNO et ID3 partent — et ses échantillons restent identiques`() = runTest {
        val original = fixture("audio_tagged.aiff")
        val ssnd = chunks(original, ByteOrder.BIG_ENDIAN).first { it.id == "SSND" }

        val out = sent(original, "audio/aiff")

        val kept = chunks(out, ByteOrder.BIG_ENDIAN)
        assertThat(kept.map { it.id }).containsExactly("COMM", "SSND").inOrder()
        assertThat(ByteBuffer.wrap(out, 4, 4).int).isEqualTo(out.size - 8)
        assertThat(out.body(kept[1])).isEqualTo(original.body(ssnd))
        assertNoText("aiff", out)
        assertThat(sent(out, "audio/aiff")).isEqualTo(out)
    }

    @Test
    fun `un CAF perd son chunk info et garde desc, chan et data`() = runTest {
        val original = fixture("audio_tagged.caf")

        val out = sent(original, "audio/x-caf")

        assertThat(cafChunks(out)).containsExactly("desc", "chan", "data").inOrder()
        assertThat(out.copyOfRange(out.size - 26464, out.size)).isEqualTo(original.copyOfRange(original.size - 26464, original.size))
        assertNoText("caf", out)
        assertThat(sent(out, "audio/x-caf")).isEqualTo(out)
    }

    @Test
    fun `un CAF dont un chunk déborde ne part pas`() = runTest {
        val original = fixture("audio_tagged.caf")
        assertRefused(original.copyOfRange(0, 60), "audio/x-caf")
    }

    private fun cafChunks(bytes: ByteArray): List<String> {
        val found = mutableListOf<String>()
        var at = 8
        while (at + 12 <= bytes.size) {
            found += String(bytes, at, 4, Charsets.ISO_8859_1)
            val size = ByteBuffer.wrap(bytes, at + 4, 8).long
            if (size < 0) return found
            at += 12 + size.toInt()
        }
        return found
    }

    @Test
    fun `un Ogg reste refusé — réécrire ses pages et leurs CRC n est pas prouvé`() = runTest {
        assertRefused(fixture("audio_tagged.ogg"), "audio/ogg")
        assertRefused(fixture("audio_tagged.ogg"), "application/octet-stream")
    }

    @Test
    fun `une piste de sous-titres WebVTT d un WebM part vidée — entrée de piste et blocs — sans changer de taille`() = runTest {
        val original = fixture("video_subtitles.webm")
        listOf("+48.8566", "+48.8584", "D_WEBVTT").forEach { assertWithMessage(it).that(it.occursIn(original)).isTrue() }

        val out = sent(original, "video/webm")

        assertThat(out.size).isEqualTo(original.size)
        listOf("+48.8566", "+48.8584", "GPS", "Chez moi", "D_WEBVTT").forEach { assertWithMessage(it).that(it.occursIn(out)).isFalse() }
        assertThat("V_VP8".occursIn(out)).isTrue()
        assertThat("A_OPUS".occursIn(out)).isTrue()
        assertThat(sent(out, "video/webm")).isEqualTo(out)
    }

    @Test
    fun `chaque son nettoyé et le WebM sans sous-titres restent décodables de bout en bout par ffmpeg`() = runTest {
        val ffmpeg = listOf("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg").firstOrNull { File(it).canExecute() }
        assumeTrue("ffmpeg absent : témoin d'intégrité joué seulement là où ffmpeg existe", ffmpeg != null)
        mapOf(
            "audio_tagged.mp3" to "audio/mpeg", "audio_cover.mp3" to "audio/mpeg", "audio_tagged.wav" to "audio/wav",
            "audio_tagged.flac" to "audio/flac", "audio_tagged.aiff" to "audio/aiff", "audio_tagged.caf" to "audio/x-caf",
            "video_subtitles.webm" to "video/webm",
        ).forEach { (name, mime) ->
            val file = File.createTempFile("scrubbed", "-$name").apply { deleteOnExit(); writeBytes(sent(fixture(name), mime)) }
            val process = ProcessBuilder(ffmpeg, "-v", "error", "-xerror", "-i", file.path, "-f", "null", "-").redirectErrorStream(true).start()
            val output = process.inputStream.bufferedReader().readText()
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).isTrue()
            assertWithMessage("$name : $output").that(process.exitValue()).isEqualTo(0)
            assertWithMessage(name).that(output.trim()).isEmpty()
        }
    }
}
