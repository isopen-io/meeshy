package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Audit #13551 — les fixtures de lieu pèsent toutes moins d'un bloc de [SourceMediaBytes] (64 Kio) : la parité « tableau
 * = flux » n'y passait jamais une frontière de bloc ni une éviction du cache. Ici, la même fixture est GONFLÉE (charge
 * utile allongée de zéros, tailles recalculées) pour que les boîtes et chunks porteurs de lieu tombent À CHEVAL sur une
 * frontière, à chaque décalage de -24 à +24 octets autour d'elle et au-delà de quatre blocs (éviction) ; les deux chemins
 * doivent rendre les mêmes octets, et aucun lieu ne doit partir.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StreamingBlockBoundaryParityTest {

    private val sanitizer = OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), Dispatchers.Unconfined)

    private fun fixture(name: String): ByteArray =
        requireNotNull(javaClass.classLoader?.getResourceAsStream("media-location/$name")) { name }.use { it.readBytes() }

    private val markers = listOf("loci", "©xyz", "ISO6709", "+48.8566", "bext", "LIST")

    private fun leaks(bytes: ByteArray): List<String> = String(bytes, Charsets.ISO_8859_1).let { text -> markers.filter { it in text } }

    /** The top-level box [type] of an ISO file, its payload grown by [extra] zeros at its end, its size rewritten. */
    private fun ByteArray.growIsoBox(type: String, extra: Int): ByteArray {
        var at = 0
        while (at + 8 <= size) {
            val boxSize = ByteBuffer.wrap(this, at, 4).int
            if (String(this, at + 4, 4, Charsets.ISO_8859_1) == type) {
                val end = at + boxSize
                return (copyOfRange(0, end) + ByteArray(extra) + copyOfRange(end, size)).also {
                    ByteBuffer.wrap(it, at, 4).putInt(boxSize + extra)
                }
            }
            at += boxSize
        }
        error("no $type box")
    }

    /** The RIFF chunk [id], its payload grown by [extra] (even) zeros, its size and the RIFF size rewritten. */
    private fun ByteArray.growRiffChunk(id: String, extra: Int): ByteArray {
        var at = 12
        while (at + 8 <= size) {
            val chunk = ByteBuffer.wrap(this, at + 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
            if (String(this, at, 4, Charsets.ISO_8859_1) == id) {
                val end = at + 8 + chunk
                return (copyOfRange(0, end) + ByteArray(extra) + copyOfRange(end, size)).also {
                    val le = ByteBuffer.wrap(it).order(ByteOrder.LITTLE_ENDIAN)
                    le.putInt(at + 4, chunk + extra)
                    le.putInt(4, it.size - 8)
                }
            }
            at += 8 + chunk + (chunk and 1)
        }
        error("no $id chunk")
    }

    private fun offsetsAround(tail: Int): List<Int> {
        val block = SourceMediaBytes.BLOCK_BYTES
        val distances = listOf(block, 3 * block, 5 * block + block / 2)
        return distances.flatMap { boundary -> (-24..24).map { boundary - tail + it } }.filter { it >= 0 }
    }

    private suspend fun assertParityAndNoLeak(label: String, bytes: ByteArray, mime: String) {
        val result = sanitizer.sanitizeOnBothPaths(bytes, "clip", mime)
        assertWithMessage("$label refused").that(result).isInstanceOf(NetworkResult.Success::class.java)
        assertWithMessage("$label leaks").that(leaks((result as NetworkResult.Success).data.bytes)).isEmpty()
    }

    @Test
    fun `an ISO film whose moov straddles a block boundary at every offset is cleaned the same on both paths`() = runTest {
        listOf(
            "video_location.mov" to "video/quicktime",
            "video_apple_keys.mov" to "video/quicktime",
            "voice_location.m4a" to "audio/mp4",
            "video_location.3gp" to "video/3gpp",
        ).forEach { (name, mime) ->
            val original = fixture(name)
            val moov = String(original, Charsets.ISO_8859_1).indexOf("moov") - 4
            offsetsAround(moov).forEach { extra ->
                assertParityAndNoLeak("$name +$extra", original.growIsoBox("mdat", extra), mime)
            }
        }
    }

    @Test
    fun `a WAV whose LIST chunk straddles a block boundary at every offset is cleaned the same on both paths`() = runTest {
        val original = fixture("audio_tagged.wav")
        val list = String(original, Charsets.ISO_8859_1).indexOf("LIST")
        offsetsAround(list).filter { it % 2 == 0 }.forEach { extra ->
            assertParityAndNoLeak("wav +$extra", original.growRiffChunk("fmt ", 0).growRiffChunk("bext", extra).let { it }, "audio/wav")
        }
    }
}
