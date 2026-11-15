package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ReactionMarksEventsDecodeTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `an attachment reaction carries its author user id and the authoritative summary`() {
        val event = json.decodeFromString<AttachmentReactionUpdateEvent>(
            """{"attachmentId":"a1","messageId":"m1","conversationId":"c1","participantId":"p1","userId":"u1",
               "emoji":"❤️","action":"remove","reactionSummary":{"🔥":2},"timestamp":"t","extra":1}""",
        )

        assertThat(event.userId).isEqualTo("u1")
        assertThat(event.isRemoval).isTrue()
        assertThat(event.reactionSummary).containsExactly("🔥", 2)
    }

    @Test
    fun `an older gateway without user id or action still decodes as an addition`() {
        val event = json.decodeFromString<AttachmentReactionUpdateEvent>(
            """{"attachmentId":"a1","messageId":"m1","conversationId":"c1","emoji":"❤️"}""",
        )

        assertThat(event.userId).isNull()
        assertThat(event.isRemoval).isFalse()
    }

    @Test
    fun `a personal star decodes with and without its date`() {
        val on = json.decodeFromString<MessageStarredEvent>(
            """{"messageId":"m1","conversationId":"c1","starred":true,"starredAt":"2026-10-24T10:00:00Z"}""",
        )
        val off = json.decodeFromString<MessageStarredEvent>("""{"messageId":"m1","conversationId":"c1","starred":false}""")

        assertThat(on.starredAt).isNotNull()
        assertThat(off.starred).isFalse()
        assertThat(off.starredAt).isNull()
    }

    @Test
    fun `hidden and restored lists name the conversation of each message`() {
        val hidden = json.decodeFromString<MessageHiddenForMeEvent>(
            """{"userId":"me","messages":[{"messageId":"m1","conversationId":"c1"},{"messageId":"m2","conversationId":"c2"}]}""",
        )
        val restored = json.decodeFromString<MessageRestoredForMeEvent>(
            """{"userId":"me","messages":[{"messageId":"m1","conversationId":"c1"}],"restoredAt":"t"}""",
        )

        assertThat(hidden.messageIdsIn("c2")).containsExactly("m2")
        assertThat(restored.concerns("c1")).isTrue()
        assertThat(restored.concerns("c2")).isFalse()
    }
}
