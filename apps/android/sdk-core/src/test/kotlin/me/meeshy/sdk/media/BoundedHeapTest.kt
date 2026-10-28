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
        if (process.exitValue() != 0 && mode == BoundedHeapProbe.STREAM) println(output)
        return process.exitValue()
    }

    @Test
    fun `a 200 MB media is queued sealed, read back and sent within a 48 MB heap`() {
        assertThat(runUnderBoundedHeap(BoundedHeapProbe.STREAM, folder.newFolder())).isEqualTo(0)
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
    const val OUT_OF_MEMORY = 3
    private const val SIZE = 200L * 1024 * 1024

    @JvmStatic
    fun main(args: Array<String>) {
        val directory = File(args[1])
        val media = File(directory, "media.mp4").also { RandomAccessFile(it, "rw").use { raf -> raf.setLength(SIZE) } }
        val code = try {
            if (args[0] == WHOLE) whole(media) else stream(media, File(directory, "outbox"))
        } catch (_: OutOfMemoryError) {
            OUT_OF_MEMORY
        }
        exitProcess(code)
    }

    private fun whole(media: File): Int = if (MediaUploadItem.onDisk(media, "a.mp4", "video/mp4").bytes.size.toLong() == SIZE) 0 else 1

    private fun stream(media: File, outbox: File): Int {
        val files = MediaBlobFiles(outbox) { StreamingSeal.ephemeral() }
        files.write("big", MediaUploadItem.onDisk(media, "a.mp4", "video/mp4").source)
        val queued = MediaUploadItem(files.source("big") ?: return 1, "a.mp4", "video/mp4")
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
}
