package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** #13857 — la passerelle sert `startMs`/`endMs` ; Android les lit en secondes, comme iOS `TranscriptionSegment.init(from:)`. */
class TranscriptionSegmentTimingDecodeTest {

    private val wire = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    private fun segment(json: String): TranscriptionSegment = wire.decodeFromString(TranscriptionSegment.serializer(), json)

    @Test
    fun `served milliseconds decode as seconds`() {
        val decoded = segment("""{"text":"Hi","startMs":0,"endMs":400}""")

        assertThat(decoded.startTime).isEqualTo(0.0)
        assertThat(decoded.endTime).isEqualTo(0.4)
    }

    @Test
    fun `fractional milliseconds keep their precision`() {
        val decoded = segment("""{"text":"là","startMs":1234,"endMs":2500.5}""")

        assertThat(decoded.startTime).isWithin(1e-9).of(1.234)
        assertThat(decoded.endTime).isWithin(1e-9).of(2.5005)
    }

    @Test
    fun `seconds remain accepted when no milliseconds are served`() {
        val decoded = segment("""{"text":"Hi","startTime":1.5,"endTime":2.0}""")

        assertThat(decoded.startTime).isEqualTo(1.5)
        assertThat(decoded.endTime).isEqualTo(2.0)
    }

    @Test
    fun `milliseconds win over seconds when both are served`() {
        val decoded = segment("""{"text":"Hi","startMs":3000,"endMs":3500,"startTime":9.0,"endTime":9.9}""")

        assertThat(decoded.startTime).isEqualTo(3.0)
        assertThat(decoded.endTime).isEqualTo(3.5)
    }

    @Test
    fun `each bound falls back on its own`() {
        val decoded = segment("""{"text":"Hi","startMs":200,"endTime":0.9}""")

        assertThat(decoded.startTime).isEqualTo(0.2)
        assertThat(decoded.endTime).isEqualTo(0.9)
    }

    @Test
    fun `a segment without timing keeps null bounds and its other fields`() {
        val decoded = segment("""{"text":"Hi","speakerId":"s1","voiceSimilarityScore":0.82}""")

        assertThat(decoded).isEqualTo(TranscriptionSegment(text = "Hi", speakerId = "s1", voiceSimilarityScore = 0.82))
    }

    @Test
    fun `a null millisecond bound falls back on seconds`() {
        val decoded = segment("""{"text":"Hi","startMs":null,"startTime":0.3,"endMs":null}""")

        assertThat(decoded.startTime).isEqualTo(0.3)
        assertThat(decoded.endTime).isNull()
    }

    @Test
    fun `an encoded segment decodes back to the same timing`() {
        val original = segment("""{"text":"Hi","startMs":400,"endMs":900,"speakerId":"s2"}""")

        val roundTripped = segment(wire.encodeToString(TranscriptionSegment.serializer(), original))

        assertThat(roundTripped).isEqualTo(original)
    }

    @Test
    fun `served attachment segments light the karaoke by their real timing`() {
        val attachment = wire.decodeFromString(
            ApiMessageAttachment.serializer(),
            """
            {"id":"a1","mimeType":"audio/m4a","transcription":{"text":"Hi there friend","language":"en","segments":[
              {"text":"Hi","startMs":0,"endMs":400,"speakerId":"s1"},
              {"text":"there","startMs":400,"endMs":1000,"speakerId":"s1"},
              {"text":"friend","startMs":3000,"endMs":3600,"speakerId":"s2"}
            ]}}
            """.trimIndent(),
        )
        val segments = attachment.transcription?.segments.orEmpty().map {
            MessageTranscriptionSegment(text = it.text, startTime = it.startTime, endTime = it.endTime, speakerId = it.speakerId)
        }

        val lit = TranscriptionKaraokeResolver.activeSegmentIndex(segments, currentTimeSeconds = 3.2, progress = 0.0, isPlaying = true)

        assertThat(lit).isEqualTo(2)
    }
}
