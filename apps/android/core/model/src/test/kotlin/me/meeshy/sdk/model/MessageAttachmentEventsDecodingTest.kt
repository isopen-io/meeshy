package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Test

class MessageAttachmentEventsDecodingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    @Test
    fun `message attachment updated carries the whole piece and its address`() {
        val event = json.decodeFromString<MessageAttachmentUpdatedEvent>(
            """{"conversationId":"c1","messageId":"m1","attachmentId":"a1",
               "attachment":{"id":"a1","mimeType":"audio/mp4","fileUrl":"https://cdn/a1","processingState":"ready",
               "transcription":{"text":"bonjour","language":"fr"},"viewedCount":0}}""",
        )

        assertThat(event.concerns("c1")).isTrue()
        assertThat(event.concerns("c2")).isFalse()
        assertThat(event.servedAttachmentId).isEqualTo("a1")
        assertThat(event.attachment?.transcription?.text).isEqualTo("bonjour")
    }

    @Test
    fun `the piece id falls back on the piece itself when the top level one is absent`() {
        val event = json.decodeFromString<MessageAttachmentUpdatedEvent>(
            """{"conversationId":"c1","messageId":"m1","attachment":{"id":"a9","fileUrl":"https://cdn/a9"}}""",
        )

        assertThat(event.servedAttachmentId).isEqualTo("a9")
    }

    @Test
    fun `a half written piece does not cost the event`() {
        val event = json.decodeFromString<MessageAttachmentUpdatedEvent>(
            """{"conversationId":"c1","messageId":"m1","attachmentId":"a1","attachment":{"fileUrl":12}}""",
        )

        assertThat(event.attachment).isNull()
        assertThat(event.servedAttachmentId).isEqualTo("a1")
    }

    private fun ready(target: String?, conversationId: String?, messageId: String? = "m1") = AttachmentReadyEvent(
        attachmentId = "a1", target = target, messageId = messageId, conversationId = conversationId, processingState = "ready",
        attachment = json.parseToJsonElement("""{"id":"a1","fileUrl":"https://cdn/a1","thumbnailUrl":"https://cdn/t"}"""),
    )

    @Test
    fun `a ready attachment of a message is served as a piece`() {
        val event = ready("messageAttachment", "c1")

        assertThat(event.isMessageAttachment).isTrue()
        assertThat(event.servedAttachment(json)?.thumbnailUrl).isEqualTo("https://cdn/t")
    }

    @Test
    fun `the ready media of a post is not a message piece`() {
        assertThat(ready("postMedia", null, messageId = null).isMessageAttachment).isFalse()
        assertThat(ready("messageAttachment", null).isMessageAttachment).isFalse()
        assertThat(ready("messageAttachment", "c1", messageId = " ").isMessageAttachment).isFalse()
    }

    @Test
    fun `an unreadable or missing piece is null, never a throw`() {
        val broken = ready("messageAttachment", "c1").copy(attachment = JsonObject(mapOf("fileUrl" to kotlinx.serialization.json.JsonPrimitive(1))))
        val missing = ready("messageAttachment", "c1").copy(attachment = null)

        assertThat(broken.servedAttachment(json)).isNull()
        assertThat(missing.servedAttachment(json)).isNull()
    }
}
