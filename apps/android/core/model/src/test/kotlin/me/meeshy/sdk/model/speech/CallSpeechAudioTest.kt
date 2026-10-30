package me.meeshy.sdk.model.speech

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13718 — the samples WebRTC already captures, made fit for the on-device recognizer and cut into utterances. */
class CallSpeechAudioTest {
    private fun pcm(vararg samples: Int): ByteArray =
        ByteArray(samples.size * 2).also { bytes ->
            samples.forEachIndexed { i, s ->
                bytes[2 * i] = (s and 0xFF).toByte()
                bytes[2 * i + 1] = ((s shr 8) and 0xFF).toByte()
            }
        }

    private fun samplesOf(bytes: ByteArray): List<Int> =
        (0 until bytes.size / 2).map { i -> ((bytes[2 * i + 1].toInt() shl 8) or (bytes[2 * i].toInt() and 0xFF)).toShort().toInt() }

    @Test
    fun `48 kHz is brought to 16 kHz by averaging, a rate that does not divide stays as it is`() {
        assertThat(RecognizerPcm.outputSampleRate(48_000)).isEqualTo(16_000)
        assertThat(RecognizerPcm.outputSampleRate(16_000)).isEqualTo(16_000)
        assertThat(RecognizerPcm.outputSampleRate(44_100)).isEqualTo(44_100)

        val converted = RecognizerPcm.toRecognizer(pcm(300, 600, 900, -300, -600, -900), sampleRate = 48_000, channelCount = 1)

        assertThat(samplesOf(converted)).containsExactly(600, -600).inOrder()
    }

    @Test
    fun `stereo is mixed down to mono`() {
        val converted = RecognizerPcm.toRecognizer(pcm(1_000, 3_000, -2_000, 0), sampleRate = 16_000, channelCount = 2)

        assertThat(samplesOf(converted)).containsExactly(2_000, -1_000).inOrder()
    }

    @Test
    fun `the level of a frame is its normalized RMS, and a frame's duration follows its rate`() {
        assertThat(RecognizerPcm.level(pcm(0, 0, 0, 0))).isEqualTo(0.0)
        assertThat(RecognizerPcm.level(pcm(16_384, -16_384))).isWithin(1e-3).of(0.5)
        assertThat(RecognizerPcm.durationMs(ByteArray(320), sampleRate = 16_000)).isEqualTo(10)
    }

    private fun UtteranceEndpointer.feedAll(level: Double, frames: Int): Pair<UtteranceEndpointer, List<UtteranceCut>> =
        (1..frames).fold(this to emptyList()) { (state, cuts), _ ->
            val (next, cut) = state.feed(level, durationMs = 10)
            next to cuts + cut
        }

    @Test
    fun `speech opens an utterance and a long enough silence closes it`() {
        val (speaking, opening) = UtteranceEndpointer().feedAll(level = 0.2, frames = 3)
        val silenceFrames = (UtteranceEndpointer.END_SILENCE_MS / 10).toInt()
        val (closed, closing) = speaking.feedAll(level = 0.0, frames = silenceFrames)

        assertThat(opening).containsExactly(UtteranceCut.Opens, UtteranceCut.Continues, UtteranceCut.Continues).inOrder()
        assertThat(closing.dropLast(1).toSet()).containsExactly(UtteranceCut.Continues)
        assertThat(closing.last()).isEqualTo(UtteranceCut.Closes)
        assertThat(closed.isSpeaking).isFalse()
    }

    @Test
    fun `silence before speech stays idle, and a short pause keeps the utterance open`() {
        val (idle, quiet) = UtteranceEndpointer().feedAll(level = 0.001, frames = 200)
        val (speaking, _) = idle.feedAll(level = 0.2, frames = 1)
        val (paused, _) = speaking.feedAll(level = 0.0, frames = 40)
        val (_, resumed) = paused.feedAll(level = 0.2, frames = 1)

        assertThat(quiet.toSet()).containsExactly(UtteranceCut.Idle)
        assertThat(resumed).containsExactly(UtteranceCut.Continues)
    }

    @Test
    fun `an utterance never outlives its ceiling, even without a pause`() {
        val frames = (UtteranceEndpointer.MAX_UTTERANCE_MS / 10).toInt()
        val (_, cuts) = UtteranceEndpointer().feedAll(level = 0.3, frames = frames)

        assertThat(cuts.last()).isEqualTo(UtteranceCut.Closes)
        assertThat(cuts.count { it == UtteranceCut.Closes }).isEqualTo(1)
    }
}
