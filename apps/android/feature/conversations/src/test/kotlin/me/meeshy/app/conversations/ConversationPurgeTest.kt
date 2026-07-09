package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import org.junit.Test

class ConversationPurgeTest {

    @Test
    fun a_deleted_conversation_yields_its_id_to_purge() {
        val id = ConversationPurge.onConversationDeleted(
            ConversationDeletedSocketEvent(conversationId = "c1"),
        )

        assertThat(id).isEqualTo("c1")
    }

    @Test
    fun a_deleted_event_with_a_blank_id_is_inert() {
        val id = ConversationPurge.onConversationDeleted(
            ConversationDeletedSocketEvent(conversationId = "   "),
        )

        assertThat(id).isNull()
    }

    @Test
    fun the_current_user_leaving_yields_the_conversation_to_purge() {
        val id = ConversationPurge.onParticipantLeft(
            ParticipantLeftEvent(conversationId = "c1", userId = "me"),
            currentUserId = "me",
        )

        assertThat(id).isEqualTo("c1")
    }

    @Test
    fun another_participant_leaving_is_inert_for_me() {
        val id = ConversationPurge.onParticipantLeft(
            ParticipantLeftEvent(conversationId = "c1", userId = "someone-else"),
            currentUserId = "me",
        )

        assertThat(id).isNull()
    }

    @Test
    fun a_left_event_with_no_known_current_user_is_inert() {
        val id = ConversationPurge.onParticipantLeft(
            ParticipantLeftEvent(conversationId = "c1", userId = "me"),
            currentUserId = null,
        )

        assertThat(id).isNull()
    }

    @Test
    fun a_left_event_with_a_blank_current_user_is_inert() {
        val id = ConversationPurge.onParticipantLeft(
            ParticipantLeftEvent(conversationId = "c1", userId = ""),
            currentUserId = "   ",
        )

        assertThat(id).isNull()
    }

    @Test
    fun the_current_user_leaving_a_blank_conversation_is_inert() {
        val id = ConversationPurge.onParticipantLeft(
            ParticipantLeftEvent(conversationId = "  ", userId = "me"),
            currentUserId = "me",
        )

        assertThat(id).isNull()
    }
}
