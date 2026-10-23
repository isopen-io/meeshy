package me.meeshy.sdk.waveform

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.waveform.PcmEncoding
import org.junit.Assert.assertThrows
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CancellationException

/** La mesure d'un flux décodé, avec une source factice : ce que `MediaCodec` livrerait, bloc par bloc. */
class WaveformStreamMeasurerTest {

    private class ScriptedSource(
        private val chunks: List<PcmChunk>,
        private val frames: (Int) -> Long,
    ) : PcmSource {
        var estimatedAt: Int? = null
        var closed = false
        private var next = 0

        override fun estimatedFrames(sampleRate: Int): Long {
            estimatedAt = sampleRate
            return frames(sampleRate)
        }

        override fun nextChunk(): PcmChunk? = chunks.getOrNull(next++)

        override fun close() {
            closed = true
        }
    }

    private fun pcm16(channels: Int, rate: Int, vararg samples: Short): PcmChunk {
        val buffer = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        samples.forEach { buffer.putShort(it) }
        return PcmChunk(buffer.array(), buffer.capacity(), channels, rate, PcmEncoding.PCM_16BIT)
    }

    private fun noCancellation() = Unit

    @Test
    fun `le releve suit les blocs decodes`() {
        val half = Short.MAX_VALUE / 2
        val source = ScriptedSource(
            chunks = listOf(
                pcm16(1, 8_000, 0, 0, 0, 0),
                pcm16(1, 8_000, half.toShort(), half.toShort(), half.toShort(), half.toShort()),
            ),
            frames = { 8 },
        )

        val measured = WaveformStreamMeasurer.measure(source, count = 2, checkActive = ::noCancellation)

        assertThat(measured).usingTolerance(1e-3).containsExactly(0f, 0.5f).inOrder()
    }

    @Test
    fun `l'estimation se calcule a la frequence reelle du premier bloc`() {
        val source = ScriptedSource(listOf(pcm16(2, 48_000, 100, 100)), frames = { rate -> rate.toLong() })

        WaveformStreamMeasurer.measure(source, count = 4, checkActive = ::noCancellation)

        assertThat(source.estimatedAt).isEqualTo(48_000)
    }

    @Test
    fun `le stereo est moyenne trame par trame`() {
        val loud = Short.MAX_VALUE
        val source = ScriptedSource(listOf(pcm16(2, 8_000, loud, (-loud).toShort(), loud, 0)), frames = { 2 })

        val measured = WaveformStreamMeasurer.measure(source, count = 2, checkActive = ::noCancellation)

        assertThat(measured).usingTolerance(1e-3).containsExactly(0f, 0.5f).inOrder()
    }

    @Test
    fun `une source vide ou un nombre nul rendent un releve vide`() {
        assertThat(WaveformStreamMeasurer.measure(ScriptedSource(emptyList()) { 10 }, 4, ::noCancellation)).isEmpty()
        assertThat(WaveformStreamMeasurer.measure(ScriptedSource(listOf(pcm16(1, 8_000, 1, 2))) { 2 }, 0, ::noCancellation)).isEmpty()
    }

    @Test
    fun `l'annulation est verifiee avant chaque bloc`() {
        val source = ScriptedSource(List(5) { pcm16(1, 8_000, 1, 2, 3, 4) }) { 20 }
        var checks = 0

        assertThrows(CancellationException::class.java) {
            WaveformStreamMeasurer.measure(source, count = 4) {
                if (++checks > 2) throw CancellationException("bulle quittee")
            }
        }

        assertThat(checks).isEqualTo(3)
    }
}
