package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class MessageLifecycleEventsDecodeTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Test
    fun `message cited-post-withdrawn tolere deletedAt absent`() {
        val event = json.decodeFromString(MessageCitedPostWithdrawnEvent.serializer(), """{"postId":"p1","conversationId":"c1"}""")
        assertThat(event.postId).isEqualTo("p1")
        assertThat(event.conversationId).isEqualTo("c1")
        assertThat(event.deletedAt).isNull()
    }

    @Test
    fun `message pending-delivered tolere count et conversationIds absents`() {
        val event = json.decodeFromString(PendingMessagesDeliveredEvent.serializer(), "{}")
        assertThat(event.count).isEqualTo(0)
        assertThat(event.conversationIds).isEmpty()
        assertThat(event.concerns("c1")).isFalse()
    }

    @Test
    fun `message pending-delivered nomme les fils touches`() {
        val event = json.decodeFromString(PendingMessagesDeliveredEvent.serializer(), """{"count":3,"conversationIds":["c1","c2"]}""")
        assertThat(event.concerns("c2")).isTrue()
    }

    @Test
    fun `attachment-status updated tolere les champs de progression absents`() {
        val event = json.decodeFromString(
            AttachmentStatusUpdatedEvent.serializer(),
            """{"attachmentId":"a1","messageId":"m1","conversationId":"c1"}""",
        )
        assertThat(event.userId).isNull()
        assertThat(event.action).isNull()
        assertThat(event.playPositionMs).isNull()
        assertThat(event.percentage).isNull()
    }

    @Test
    fun `mention created ne garde que les deux identifiants requis`() {
        val event = json.decodeFromString(MentionCreatedEvent.serializer(), """{"messageId":"m1","conversationId":"c1"}""")
        assertThat(event.senderId).isNull()
        assertThat(event.content).isNull()
        assertThat(event.timestamp).isNull()
    }

    @Test
    fun `mention created sans message est refusee`() {
        val decoded = runCatching { json.decodeFromString(MentionCreatedEvent.serializer(), """{"conversationId":"c1"}""") }
        assertThat(decoded.isFailure).isTrue()
    }
}
