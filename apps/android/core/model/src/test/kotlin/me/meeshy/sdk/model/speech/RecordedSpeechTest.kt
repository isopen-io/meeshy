package me.meeshy.sdk.model.speech

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RecordedSpeechTest {
    private val quiet = 0.0
    private val voice = 0.3

    private fun frames(vararg runs: Pair<Double, Int>): List<Double> = runs.flatMap { (level, count) -> List(count) { level } }

    @Test
    fun `a sound is cut where its speaker pauses, each span keeping its pre-roll`() {
        val levels = frames(quiet to 50, voice to 50, quiet to 60, voice to 25)
        val spans = RecordedSpeech.spans(levels)
        assertThat(spans).hasSize(2)
        assertThat(spans[0].startMs).isEqualTo(50 * RecordedSpeech.FRAME_MS - UtteranceEndpointer.PRE_ROLL_MS)
        assertThat(spans[1].endMs).isEqualTo(185 * RecordedSpeech.FRAME_MS)
    }

    @Test
    fun `silence alone gives nothing to recognize`() {
        assertThat(RecordedSpeech.spans(frames(quiet to 200))).isEmpty()
    }

    @Test
    fun `the heard spans become one text with timed segments`() {
        val heard = listOf(
            RecordedSpeech.Heard(RecordedSpeech.Span(0, 2_000), "bom dia", 0.9),
            RecordedSpeech.Heard(RecordedSpeech.Span(3_000, 4_000), "  ", 0.0),
            RecordedSpeech.Heard(RecordedSpeech.Span(5_000, 6_500), "tudo bem", 0.7),
        )
        val transcription = RecordedSpeech.assemble("pt", heard)
        assertThat(transcription.text).isEqualTo("bom dia tudo bem")
        assertThat(transcription.language).isEqualTo("pt")
        assertThat(transcription.segments.map { it.startMs to it.durationMs }).containsExactly(0L to 2_000L, 5_000L to 1_500L).inOrder()
        assertThat(transcription.confidence).isWithin(1e-9).of(0.8)
    }

    @Test
    fun `a slice is the bytes of its span in sixteen-bit mono`() {
        val rate = 1_000
        val pcm = ByteArray(2 * rate) { it.toByte() }
        val slice = RecordedSpeech.slice(pcm, rate, RecordedSpeech.Span(500, 1_000))
        assertThat(slice.size).isEqualTo(1_000)
        assertThat(slice.first()).isEqualTo(pcm[1_000])
    }
}
