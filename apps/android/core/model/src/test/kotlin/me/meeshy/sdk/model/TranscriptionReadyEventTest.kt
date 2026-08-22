package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Locks the wire contract of `audio:transcription-ready` — the SAME defect
 * [AudioTranslationEventTest] pins for its sibling event, one data class further
 * down the same file, left uncorrected.
 *
 * The gateway emits the shared `TranscriptionReadyEventData` shape
 * (`packages/shared/types/socketio-events.ts`, and `MeeshySocketIOManager`'s
 * `transcriptionData` literal): the transcript NESTS under `transcription`, with
 * only `messageId` / `attachmentId` / `conversationId` / `processingTimeMs` at
 * the top level. iOS models it that way (`TranscriptionReadyEvent.transcription:
 * TranscriptionData`); Android modelled `text` / `language` / `confidence` /
 * `durationMs` flat, so `text` — a non-null field with no default — was always
 * absent and every frame threw at decode time into the `runCatching` in
 * `MessageSocketManager.listen`, which logs and drops.
 *
 * Two silences stacked, which is why neither was ever noticed: the event never
 * arrived at all (it was subscribed under a name the gateway does not emit), and
 * had it arrived, it would have been dropped here.
 */
class TranscriptionReadyEventTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `decodes the nested gateway payload`() {
        val raw = """
            {
              "messageId": "m1",
              "attachmentId": "a1",
              "conversationId": "c1",
              "transcription": {
                "id": "t1",
                "text": "bonjour tout le monde",
                "language": "fr",
                "confidence": 0.94,
                "durationMs": 4200,
                "source": "whisper",
                "speakerCount": 2,
                "segments": [{ "text": "bonjour", "startTime": 0.0, "endTime": 1.0 }]
              },
              "processingTimeMs": 880
            }
        """.trimIndent()

        val event = json.decodeFromString<TranscriptionReadyEvent>(raw)

        assertThat(event.messageId).isEqualTo("m1")
        assertThat(event.attachmentId).isEqualTo("a1")
        assertThat(event.conversationId).isEqualTo("c1")
        assertThat(event.transcription.text).isEqualTo("bonjour tout le monde")
        assertThat(event.transcription.language).isEqualTo("fr")
        assertThat(event.transcription.confidence).isEqualTo(0.94)
        assertThat(event.transcription.durationMs).isEqualTo(4200L)
        assertThat(event.processingTimeMs).isEqualTo(880L)
    }

    @Test
    fun `a frame missing the transcript decodes to blank defaults rather than throwing`() {
        val event = json.decodeFromString<TranscriptionReadyEvent>(
            """{ "messageId": "m1", "conversationId": "c1" }""",
        )

        assertThat(event.transcription.text).isEmpty()
        assertThat(event.transcription.language).isNull()
        assertThat(event.attachmentId).isNull()
    }
}
