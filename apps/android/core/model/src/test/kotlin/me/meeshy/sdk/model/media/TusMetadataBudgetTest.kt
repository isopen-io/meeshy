package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Base64

class TusMetadataBudgetTest {
    private fun segments(count: Int) = List(count) { TusTranscriptionSegment("mot numero $it", it * 100, it * 100 + 90) }
    private fun transcription(text: String = "bonjour", segments: List<TusTranscriptionSegment>? = null) =
        TusTranscription(text = text, language = "fr", confidence = 0.9, durationMs = 1200, segments = segments)

    private fun decode(value: String) = String(Base64.getDecoder().decode(value), Charsets.UTF_8)

    @Test
    fun `a short transcription travels whole as base64 JSON with sorted keys`() {
        val value = TusMetadataBudget.transcriptionValue(transcription(segments = segments(1)))!!

        assertThat(decode(value)).isEqualTo(
            """{"confidence":0.9,"durationMs":1200,"language":"fr","segments":[{"endMs":90,"startMs":0,"text":"mot numero 0"}],"text":"bonjour"}""",
        )
    }

    @Test
    fun `absent optional fields are left out of the JSON`() {
        val value = TusMetadataBudget.transcriptionValue(TusTranscription(text = "a", language = "en"))!!

        assertThat(decode(value)).isEqualTo("""{"language":"en","text":"a"}""")
    }

    @Test
    fun `segments yield first when the payload exceeds the ceiling`() {
        val value = TusMetadataBudget.transcriptionValue(transcription(segments = segments(400)))!!

        val json = decode(value)
        assertThat(json).doesNotContain("segments")
        assertThat(json).contains("bonjour")
        assertThat(json.toByteArray().size).isAtMost(TusMetadataBudget.MAX_ENCODED_BYTES)
    }

    @Test
    fun `a text too long even without segments does not travel`() {
        val value = TusMetadataBudget.transcriptionValue(transcription(text = "x".repeat(5_000)))

        assertThat(value).isNull()
    }

    @Test
    fun `the ceiling is measured in UTF-8 octets not in characters`() {
        val value = TusMetadataBudget.transcriptionValue(transcription(text = "é".repeat(2_500)))

        assertThat(value).isNull()
    }
}
