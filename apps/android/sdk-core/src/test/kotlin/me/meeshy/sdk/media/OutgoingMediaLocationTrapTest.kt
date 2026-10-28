package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.TimeUnit
import kotlin.random.Random
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.SendResult
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Les fichiers PIÉGÉS de l'audit adversarial de #13543 : un lieu là où le premier lot ne regardait pas — dans un film
 * FRAGMENTÉ (`moof/udta`, `traf/meta`, `emsg`), dans une boîte gardée mais jamais parcourue (`hdlr`, `dref`), dans une piste
 * de sous-titres, dans les chapitres ou le nom de piste d'un WebM, dans un conteneur déclaré `application/octet-stream`. Chaque cas part nettoyé ou ne part pas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OutgoingMediaLocationTrapTest {

    private val place = "+48.8566+002.3522/"

    private suspend fun result(bytes: ByteArray, mime: String) =
        OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), Dispatchers.Unconfined).sanitizeOnBothPaths(bytes, "clip", mime)

    private suspend fun sent(bytes: ByteArray, mime: String) = (result(bytes, mime) as NetworkResult.Success).data.bytes

    private suspend fun assertRefused(bytes: ByteArray, mime: String) {
        val failure = result(bytes, mime)
        assertWithMessage(mime).that(failure).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((failure as NetworkResult.Failure).error.code).isEqualTo(OutgoingMediaSanitizer.MEDIA_REFUSED_CODE)
    }

    private fun fixture(name: String): ByteArray =
        requireNotNull(javaClass.classLoader?.getResourceAsStream("media-location/$name")) { name }.use { it.readBytes() }

    private fun ascii(text: String) = text.toByteArray(Charsets.ISO_8859_1)

    private fun String.occursIn(bytes: ByteArray) = String(bytes, Charsets.ISO_8859_1).contains(this)

    private fun box(type: String, body: ByteArray) = ByteBuffer.allocate(8 + body.size).putInt(8 + body.size).put(ascii(type)).put(body).array()

    private fun full(type: String, body: ByteArray) = box(type, ByteArray(4) + body)

    private fun hex(text: String) = text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    private fun ebml(id: String, body: ByteArray): ByteArray {
        require(body.size < 0x3FFF)
        return hex(id) + byteArrayOf((0x40 or (body.size shr 8)).toByte(), body.size.toByte()) + body
    }

    private val ebmlHeader = ebml("1A45DFA3", ebml("4282", ascii("webm")))
    private val unknownSizeSegment = hex("1853806701FFFFFFFFFFFFFF")

    @Test
    fun `un lieu posé dans moof, traf ou emsg d un film fragmenté part vidé, sans changer de taille`() = runTest {
        val traf = box("traf", full("tfhd", ByteArray(4)) + box("udta", box("©xyz", ascii(place))) + full("meta", box("keys", ascii(place))))
        val moof = box("moof", full("mfhd", ByteArray(4)) + traf + box("udta", box("loci", ascii(place))))
        val film = box("ftyp", ascii("iso5") + ByteArray(4)) + box("moov", full("mvhd", ByteArray(96)) + box("mvex", full("trex", ByteArray(20)))) +
            moof + box("mdat", ascii("FRAMES")) + full("emsg", ascii("urn:geo\u0000$place"))

        val out = sent(film, "video/mp4")

        assertThat(out.size).isEqualTo(film.size)
        listOf(place, "udta", "loci", "keys", "emsg").forEach { assertWithMessage(it).that(it.occursIn(out)).isFalse() }
        listOf("moof", "traf", "tfhd", "mfhd", "FRAMES").forEach { assertWithMessage(it).that(it.occursIn(out)).isTrue() }
    }

    private fun movie(handlerName: ByteArray = ByteArray(1), dataReference: ByteArray = full("url ", ByteArray(0)).also { it[11] = 1 }): ByteArray {
        val dinf = box("dinf", full("dref", ByteBuffer.allocate(4).putInt(1).array() + dataReference))
        val hdlr = full("hdlr", ByteArray(4) + ascii("vide") + ByteArray(12) + handlerName)
        val trak = box("trak", full("tkhd", ByteArray(80)) + box("mdia", full("mdhd", ByteArray(20)) + hdlr + box("minf", full("vmhd", ByteArray(8)) + dinf)))
        return box("ftyp", ascii("isom") + ByteArray(4)) + box("moov", full("mvhd", ByteArray(96)) + trak) + box("mdat", ascii("FRAMES"))
    }

    @Test
    fun `une coordonnée ISO 6709 sans aucun mot-clé, dans une boîte gardée mais jamais parcourue, fait refuser l envoi`() = runTest {
        assertThat(sent(movie(), "video/mp4")).isEqualTo(movie())
        assertRefused(movie(handlerName = ascii("Video $place\u0000")), "video/mp4")
    }

    @Test
    fun `une référence de données vers un fichier extérieur — une URL libre — fait refuser l envoi`() = runTest {
        assertRefused(movie(dataReference = full("url ", ascii("file:///Users/moi/Paris 48,8566 N 2,3522 E.mov\u0000"))), "video/mp4")
    }

    @Test
    fun `une piste de sous-titres — du texte libre où un drone écrit sa télémétrie — part vidée et sa piste disparaît`() = runTest {
        val original = fixture("video_subtitles.mp4")
        assertThat("GPS 48.8566, 2.3522".occursIn(original)).isTrue()

        val out = sent(original, "video/mp4")

        assertThat(out.size).isEqualTo(original.size)
        listOf("48.8566", "tx3g").forEach { assertWithMessage(it).that(it.occursIn(out)).isFalse() }
    }

    @Test
    fun `la revérification reconnaît les formes de coordonnées ISO 6709 que portent ©xyz, loci et mebx`() {
        listOf("+48.8566+002.3522/", "-33.8688+151.2093+058.000/", "+48.85-002.35", "+48+002/").forEach {
            assertWithMessage(it).that(MediaLocationSignatures.foundIn(ByteArray(7) + ascii(it) + ByteArray(3))).isTrue()
        }
        listOf("+48+002", "version 1.2+3.4", "+4.8566+002.3522/", "x264 qcomp=0.60 ip_ratio=1.40").forEach {
            assertWithMessage(it).that(MediaLocationSignatures.foundIn(ascii(it))).isFalse()
        }
    }

    @Test
    fun `la revérification ne refuse pas des octets compressés au hasard — 64 Mo pseudo-aléatoires, aucune fausse coordonnée`() {
        val random = Random(13543)
        repeat(4) { assertWithMessage("bloc $it").that(MediaLocationSignatures.foundIn(random.nextBytes(16 * 1024 * 1024))).isFalse() }
    }

    @Test
    fun `les chapitres, le nom et la langue de piste d un WebM partent vidés, sans changer de taille`() = runTest {
        val original = fixture("video_chapters.webm")
        listOf(place, "Tour Eiffel", "Chez moi", "fra").forEach { assertWithMessage(it).that(it.occursIn(original)).isTrue() }

        val out = sent(original, "video/webm")

        assertThat(out.size).isEqualTo(original.size)
        listOf(place, "Tour Eiffel", "Chez moi", "48.8584").forEach { assertWithMessage(it).that(it.occursIn(out)).isFalse() }
        assertThat(sent(out, "video/webm")).isEqualTo(out)
    }

    @Test
    fun `un élément de premier niveau inconnu dans un segment WebM fait refuser l envoi`() = runTest {
        val webm = ebmlHeader + unknownSizeSegment + ebml("1549A966", ebml("2AD7B1", hex("0F4240"))) + ebml("10ABCDEF", ascii("Chez moi"))

        assertRefused(webm, "video/webm")
    }

    @Test
    fun `un média reconnu à ses octets ne part pas sous un type octet-stream`() = runTest {
        val traps = mapOf(
            "avi" to ascii("RIFF") + ByteArray(4) + ascii("AVI LIST") + ascii("Chez moi"),
            "wav" to ascii("RIFF") + ByteArray(4) + ascii("WAVEfmt ") + ByteArray(32),
            "mp3" to ascii("ID3") + byteArrayOf(4, 0, 0, 0, 0, 0, 20) + ascii("TXXX Chez moi"),
            "ogg" to ascii("OggS") + ByteArray(40),
            "flac" to ascii("fLaC") + ByteArray(40),
            "ts" to ByteArray(188 * 3 + 1) { if (it % 188 == 0) 0x47 else 0 },
            "iso-uuid" to box("uuid", ByteArray(16) + ascii("Chez moi")) + box("mdat", ascii("FRAMES")),
        )
        traps.forEach { (name, bytes) ->
            val outcome = result(bytes, "application/octet-stream")
            assertWithMessage(name).that(outcome).isInstanceOf(NetworkResult.Failure::class.java)
        }
    }

    @Test
    fun `un document part tel quel — PDF avec paquet XMP, CSV avec coordonnée, texte, archive (#13591)`() = runTest {
        val pdf = ascii("%PDF-1.7\n<x:xmpmeta><exif:GPSLatitude>48,51N</exif:GPSLatitude></x:xmpmeta>")
        val csv = ascii("ville,position\nParis,$place\n")
        val zip = byteArrayOf(0x50, 0x4B, 3, 4) + ascii("<x:xmpmeta>$place")

        assertThat(sent(pdf, "application/pdf")).isEqualTo(pdf)
        assertThat(sent(csv, "text/csv")).isEqualTo(csv)
        assertThat(sent(csv, "application/octet-stream")).isEqualTo(csv)
        assertThat(sent(zip, "application/zip")).isEqualTo(zip)
    }

    @Test
    fun `un refus de lieu est définitif — l envoi n est pas rejoué jusqu à épuisement`() = runTest {
        val refused = MediaUploadSender.send(MediaUploadItem(ByteArray(1), "clip", "video/mp4")) {
            NetworkResult.Failure(ApiError(OutgoingMediaSanitizer.MEDIA_REFUSED_MESSAGE, code = OutgoingMediaSanitizer.MEDIA_REFUSED_CODE))
        }
        val photo = MediaUploadSender.send(MediaUploadItem(ByteArray(1), "photo", "image/jpeg")) {
            NetworkResult.Failure(ApiError(OutgoingMediaSanitizer.REFUSED_MESSAGE, code = OutgoingMediaSanitizer.REFUSED_CODE))
        }
        val offline = MediaUploadSender.send(MediaUploadItem(ByteArray(1), "clip", "video/mp4")) {
            NetworkResult.Failure(ApiError("offline"))
        }

        assertThat(refused).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_LOCATION_NOT_REMOVABLE))
        assertThat(photo).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_LOCATION_NOT_REMOVABLE))
        assertThat(offline).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `chaque fichier nettoyé reste lisible et décodable de bout en bout par ffmpeg`() = runTest {
        val ffmpeg = listOf("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg").firstOrNull { File(it).canExecute() }
        assumeTrue("ffmpeg absent : témoin d'intégrité joué seulement là où ffmpeg existe", ffmpeg != null)
        val fixtures = mapOf(
            "video_location.mp4" to "video/mp4", "video_location.mov" to "video/quicktime", "video_apple_keys.mov" to "video/quicktime",
            "voice_location.m4a" to "audio/mp4", "video_location.3gp" to "video/3gpp", "video_location.webm" to "video/webm",
            "video_chapters.webm" to "video/webm", "video_fragmented.mp4" to "video/mp4", "video_subtitles.mp4" to "video/mp4",
        )
        fixtures.forEach { (name, mime) ->
            val file = File.createTempFile("scrubbed", "-$name").apply { deleteOnExit(); writeBytes(sent(fixture(name), mime)) }
            val process = ProcessBuilder(ffmpeg, "-v", "error", "-xerror", "-i", file.path, "-f", "null", "-").redirectErrorStream(true).start()
            val output = process.inputStream.bufferedReader().readText()
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).isTrue()
            assertWithMessage("$name : $output").that(process.exitValue()).isEqualTo(0)
            assertWithMessage(name).that(output.trim()).isEmpty()
        }
    }
}
