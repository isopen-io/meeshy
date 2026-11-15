package me.meeshy.sdk.call.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le micro du film : un AudioRecord à part, daté sur l'horloge des images, qui ne retient jamais l'appel. */
class CallMontageAudioSourceTest {

    private class FakeInput(private val reads: List<Int>, private val starts: Boolean = true) : CallMontagePcmInput {
        private val queue = ArrayDeque(reads)
        var stopped = false
        var released = false

        override fun start() = starts

        override fun read(buffer: ByteArray): Int = queue.removeFirstOrNull() ?: -1

        override fun stop() {
            stopped = true
        }

        override fun release() {
            released = true
        }
    }

    private fun microphone(input: CallMontagePcmInput?, nowNanos: () -> Long = { 1_000_000_000L }) = CallMontageMicrophone(
        clock = CallMontageClock(monotonicNanos = nowNanos),
        inputs = { input },
        launcher = { it.run() },
    )

    @Test
    fun `chaque tampon lu part date sur l'horloge commune`() {
        val chunks = mutableListOf<CallMontageAudioChunk>()
        val source = microphone(FakeInput(listOf(8_820, 8_820)))

        assertThat(source.start { chunks += it }).isTrue()

        assertThat(chunks).hasSize(2)
        assertThat(chunks[0].pcm.size).isEqualTo(8_820)
        assertThat(chunks[0].startUs).isEqualTo(900_000L)
        assertThat(chunks[1].startUs).isEqualTo(1_000_000L)
        assertThat(chunks[0].format).isEqualTo(CallMontageMicrophone.DEFAULT_FORMAT)
    }

    @Test
    fun `un micro refuse laisse le film muet sans exception`() {
        assertThat(microphone(null).start { }).isFalse()
    }

    @Test
    fun `un micro qui ne demarre pas est relache`() {
        val input = FakeInput(emptyList(), starts = false)
        assertThat(microphone(input).start { }).isFalse()
        assertThat(input.released).isTrue()
    }

    @Test
    fun `arreter ferme et relache l'entree`() {
        val input = FakeInput(emptyList())
        val source = microphone(input)
        source.start { }
        source.stop()
        assertThat(input.stopped).isTrue()
        assertThat(input.released).isTrue()
    }

    @Test
    fun `un auditeur qui echoue ne coupe pas la capture`() {
        val seen = mutableListOf<Long>()
        val source = microphone(FakeInput(listOf(882, 882)))
        source.start { chunk ->
            seen += chunk.startUs
            error("boom")
        }
        assertThat(seen).hasSize(2)
    }
}
