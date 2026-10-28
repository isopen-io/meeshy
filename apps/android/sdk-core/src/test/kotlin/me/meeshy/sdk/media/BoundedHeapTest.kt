package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.crypto.primitives.StreamingSeal
import okio.Buffer
import okio.blackholeSink
import okio.buffer
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.TimeUnit
import kotlin.system.exitProcess

/**
 * #13551 — le critère de l'issue, mesuré : un média de 200 Mo se met en file (scellé), se relit et part en flux dans une
 * JVM dont le tas est plafonné à [HEAP], plus bas que la limite du S8. Le témoin de contrôle prouve que ce plafond mord :
 * le même fichier lu en un tableau n'y tient pas.
 */
class BoundedHeapTest {
    @get:Rule val folder = TemporaryFolder()

    private fun runUnderBoundedHeap(mode: String, directory: File): Int {
        val java = File(System.getProperty("java.home"), "bin/java").path
        val process = ProcessBuilder(java, "-Xmx$HEAP", "-cp", System.getProperty("java.class.path"), BoundedHeapProbe::class.java.name, mode, directory.path)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().readText()
        check(process.waitFor(5, TimeUnit.MINUTES)) { "probe hung" }
        if (process.exitValue() != 0 && mode != BoundedHeapProbe.WHOLE) println(output)
        return process.exitValue()
    }

    @Test
    fun `a 200 MB media is queued sealed, read back and sent within a 48 MB heap`() {
        assertThat(runUnderBoundedHeap(BoundedHeapProbe.STREAM, folder.newFolder())).isEqualTo(0)
    }

    @Test
    fun `a 200 MB video with its location is cleaned, re-verified and sent within a 48 MB heap`() {
        assertThat(runUnderBoundedHeap(BoundedHeapProbe.SANITIZE_VIDEO, folder.newFolder())).isEqualTo(0)
    }

    @Test
    fun `a 200 MB sound with its location is rebuilt without its tags, re-verified and sent within a 48 MB heap`() {
        assertThat(runUnderBoundedHeap(BoundedHeapProbe.SANITIZE_SOUND, folder.newFolder())).isEqualTo(0)
    }

    /** La mémoire ALLOUÉE (pas seulement tenue) par le nettoyage complet d'un média de 200 Mo : lecture, plan, copie, revérification. */
    @Test
    fun `cleaning a 200 MB video or sound allocates a few MB, whatever its size`() {
        listOf(BoundedHeapProbe::video to ("clip.mp4" to "video/mp4"), BoundedHeapProbe::sound to ("voice.wav" to "audio/wav")).forEach { (make, kind) ->
            val directory = folder.newFolder()
            val media = make(directory)
            val sanitizer = OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), kotlinx.coroutines.Dispatchers.Unconfined, File(directory, "scratch"))
            var outcome: me.meeshy.sdk.net.NetworkResult<MediaUploadItem>? = null

            val allocated = AllocationMeter.allocatedBy {
                outcome = kotlinx.coroutines.runBlocking(kotlinx.coroutines.Dispatchers.Unconfined) { sanitizer.sanitize(MediaUploadItem.onDisk(media, kind.first, kind.second)) }
            }

            assertThat(outcome).isInstanceOf(me.meeshy.sdk.net.NetworkResult.Success::class.java)
            assertThat(allocated).isLessThan(8L * 1024 * 1024)
        }
    }

    @Test
    fun `control - the same media read whole does not fit in that heap`() {
        assertThat(runUnderBoundedHeap(BoundedHeapProbe.WHOLE, folder.newFolder())).isEqualTo(BoundedHeapProbe.OUT_OF_MEMORY)
    }

    private companion object {
        const val HEAP = "48m"
    }
}

/** Le programme lancé sous tas plafonné : il sort à 0 quand tout a été envoyé, à [OUT_OF_MEMORY] quand le tas a manqué. */
internal object BoundedHeapProbe {
    const val STREAM = "stream"
    const val WHOLE = "whole"
    const val SANITIZE_VIDEO = "sanitize-video"
    const val SANITIZE_SOUND = "sanitize-sound"
    const val OUT_OF_MEMORY = 3
    private const val SIZE = 200L * 1024 * 1024

    @JvmStatic
    fun main(args: Array<String>) {
        val directory = File(args[1])
        val media = File(directory, "media.mp4").also { RandomAccessFile(it, "rw").use { raf -> raf.setLength(SIZE) } }
        val code = try {
            when (args[0]) {
                WHOLE -> whole(media)
                SANITIZE_VIDEO -> sanitized(video(directory), "clip.mp4", "video/mp4", directory)
                SANITIZE_SOUND -> sanitized(sound(directory), "voice.wav", "audio/wav", directory)
                else -> stream(media, File(directory, "outbox"))
            }
        } catch (_: OutOfMemoryError) {
            OUT_OF_MEMORY
        }
        exitProcess(code)
    }

    private fun whole(media: File): Int = if (MediaUploadItem.onDisk(media, "a.mp4", "video/mp4").bytes.size.toLong() == SIZE) 0 else 1

    private fun stream(media: File, outbox: File): Int {
        val files = MediaBlobFiles(outbox) { StreamingSeal.ephemeral() }
        files.write("big", MediaUploadItem.onDisk(media, "a.mp4", "video/mp4").source, ownerId = null)
        val queued = MediaUploadItem(files.source("big", ownerId = null) ?: return 1, "a.mp4", "video/mp4")
        var sent = 0L
        val counting = object : okio.Sink by blackholeSink() {
            override fun write(source: Buffer, byteCount: Long) {
                sent += byteCount
                source.skip(byteCount)
            }
        }
        counting.buffer().use { queued.requestBody(null).writeTo(it) }
        blackholeSink().buffer().use { queued.rangeBody(150L * 1024 * 1024, TusUploadRepository.DEFAULT_CHUNK_SIZE_BYTES, null).writeTo(it) }
        return if (sent == SIZE) 0 else 2
    }

    private val LOCATION = "+48.8566+002.3522/".toByteArray(Charsets.ISO_8859_1)

    private fun box(type: String, payload: ByteArray): ByteArray =
        java.nio.ByteBuffer.allocate(8 + payload.size).putInt(8 + payload.size).put(type.toByteArray(Charsets.ISO_8859_1)).put(payload).array()

    /** ftyp, puis un `mdat` de 200 Mo (taille 64 bits), puis `moov` APRÈS lui — le nettoyeur doit l'enjamber — portant un `©xyz`. */
    fun video(directory: File): File {
        val file = File(directory, "geotagged.mp4")
        val ftyp = box("ftyp", "isom".toByteArray() + ByteArray(4) + "isom".toByteArray())
        val mdatHeader = java.nio.ByteBuffer.allocate(16).putInt(1).put("mdat".toByteArray()).putLong(16 + SIZE).array()
        val moov = box("moov", box("mvhd", ByteArray(100)) + box("udta", box("\u00a9xyz", LOCATION)))
        RandomAccessFile(file, "rw").use { raf ->
            raf.write(ftyp)
            raf.write(mdatHeader)
            raf.seek(ftyp.size + 16 + SIZE)
            raf.write(moov)
        }
        return file
    }

    /** RIFF/WAVE : `fmt `, une `LIST/INFO` qui porte le lieu, puis `data` de 200 Mo — rebâti sans la `LIST`. */
    fun sound(directory: File): File {
        val file = File(directory, "geotagged.wav")
        fun le32(value: Long) = java.nio.ByteBuffer.allocate(4).order(java.nio.ByteOrder.LITTLE_ENDIAN).putInt(value.toInt()).array()
        val fmt = "fmt ".toByteArray() + le32(16) + ByteArray(16).also { it[0] = 1; it[2] = 1 }
        val info = "INFO".toByteArray() + "ICMT".toByteArray() + le32(LOCATION.size.toLong()) + LOCATION
        val list = "LIST".toByteArray() + le32(info.size.toLong()) + info
        val dataHeader = "data".toByteArray() + le32(SIZE)
        val riff = "RIFF".toByteArray() + le32(4L + fmt.size + list.size + dataHeader.size + SIZE) + "WAVE".toByteArray()
        RandomAccessFile(file, "rw").use { raf ->
            raf.write(riff + fmt + list + dataHeader)
            raf.setLength(raf.length() + SIZE)
        }
        return file
    }

    /** Nettoie le fichier, puis l'ENVOIE en flux : la sortie ne porte plus le lieu, et rien de cela n'a tenu le média en mémoire. */
    private fun sanitized(media: File, name: String, mime: String, directory: File): Int {
        val sanitizer = OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), kotlinx.coroutines.Dispatchers.Unconfined, File(directory, "scratch"))
        val original = MediaUploadItem.onDisk(media, name, mime)
        val result = kotlinx.coroutines.runBlocking { sanitizer.sanitize(original) }
        val clean = (result as? me.meeshy.sdk.net.NetworkResult.Success)?.data ?: return 4
        if (clean === original || clean.source !is MediaUploadSource.OnDisk) return 5
        if (MediaLocationSignatures.foundIn(SourceMediaBytes(clean.source))) return 6
        var sent = 0L
        val counting = object : okio.Sink by blackholeSink() {
            override fun write(source: Buffer, byteCount: Long) {
                sent += byteCount
                source.skip(byteCount)
            }
        }
        counting.buffer().use { clean.requestBody(null).writeTo(it) }
        if (sent != clean.sizeBytes || sent < SIZE) return 7
        sanitizer.release(clean, original)
        return if ((clean.source as MediaUploadSource.OnDisk).file.exists() || !media.exists()) 8 else 0
    }
}
