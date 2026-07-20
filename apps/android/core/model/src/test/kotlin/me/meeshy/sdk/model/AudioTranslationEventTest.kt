package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Locks the wire contract of `audio:translation-ready`. The gateway emits the shared
 * `AudioTranslationEventData` shape — the translated audio nests under `translatedAudio`
 * with the target language at the top level `language` — so a flat model silently drops
 * every frame at decode time. These tests pin the nested mapping and the lenient defaults.
 */
class AudioTranslationEventTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `decodes the nested gateway payload into the flat-consumable event`() {
        val raw = """
            {
              "messageId": "m1",
              "attachmentId": "a1",
              "conversationId": "c1",
              "language": "es",
              "translatedAudio": {
                "id": "ta1",
                "targetLanguage": "es",
                "url": "https://cdn.meeshy.me/audio/es.mp3",
                "transcription": "hola a todos",
                "durationMs": 5200,
                "format": "mp3",
                "cloned": true,
                "quality": 0.87,
                "voiceModelId": "vm-9",
                "ttsModel": "xtts",
                "segments": [{ "text": "hola", "startTime": 0.0, "endTime": 1.0 }]
              },
              "processingTimeMs": 1234
            }
        """.trimIndent()

        val event = json.decodeFromString<AudioTranslationEvent>(raw)

        assertThat(event.messageId).isEqualTo("m1")
        assertThat(event.attachmentId).isEqualTo("a1")
        assertThat(event.conversationId).isEqualTo("c1")
        assertThat(event.language).isEqualTo("es")
        assertThat(event.translatedAudio.url).isEqualTo("https://cdn.meeshy.me/audio/es.mp3")
        assertThat(event.translatedAudio.transcription).isEqualTo("hola a todos")
        assertThat(event.translatedAudio.durationMs).isEqualTo(5200L)
        assertThat(event.translatedAudio.cloned).isTrue()
        assertThat(event.translatedAudio.quality).isEqualTo(0.87)
        assertThat(event.translatedAudio.voiceModelId).isEqualTo("vm-9")
        assertThat(event.translatedAudio.ttsModel).isEqualTo("xtts")
    }

    @Test
    fun `a frame missing the translated audio decodes to blank defaults rather than throwing`() {
        val event = json.decodeFromString<AudioTranslationEvent>(
            """{ "messageId": "m1", "conversationId": "c1" }""",
        )

        assertThat(event.language).isEmpty()
        assertThat(event.translatedAudio.url).isEmpty()
    }
}
