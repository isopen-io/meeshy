package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.directConversationRequest
import me.meeshy.sdk.net.api.UserSearchResult
import org.junit.Test

class NewConversationLogicTest {

    @Test
    fun one_selected_is_a_direct_conversation() {
        assertThat(NewConversationLogic.conversationType(1)).isEqualTo(NewConversationLogic.TYPE_DIRECT)
    }

    @Test
    fun two_or_more_selected_is_a_group() {
        assertThat(NewConversationLogic.conversationType(2)).isEqualTo(NewConversationLogic.TYPE_GROUP)
        assertThat(NewConversationLogic.conversationType(5)).isEqualTo(NewConversationLogic.TYPE_GROUP)
    }

    @Test
    fun cannot_create_with_no_participants() {
        assertThat(NewConversationLogic.canCreate(0)).isFalse()
        assertThat(NewConversationLogic.canCreate(1)).isTrue()
    }

    @Test
    fun direct_conversation_has_no_title_even_when_typed() {
        assertThat(NewConversationLogic.resolvedTitle("ignored", selectedCount = 1)).isNull()
    }

    @Test
    fun group_title_is_trimmed_and_kept() {
        assertThat(NewConversationLogic.resolvedTitle("  Team  ", selectedCount = 3)).isEqualTo("Team")
    }

    @Test
    fun blank_group_title_resolves_to_null() {
        assertThat(NewConversationLogic.resolvedTitle("   ", selectedCount = 3)).isNull()
    }

    @Test
    fun rows_flag_selected_users_and_prefer_display_name() {
        val results = listOf(
            UserSearchResult(id = "u1", username = "alice", displayName = "Alice A.", isOnline = true),
            UserSearchResult(id = "u2", username = "bob", displayName = null, isOnline = null),
        )

        val rows = NewConversationLogic.rows(results, selectedIds = setOf("u1"))

        assertThat(rows).hasSize(2)
        assertThat(rows[0].displayName).isEqualTo("Alice A.")
        assertThat(rows[0].isSelected).isTrue()
        assertThat(rows[0].isOnline).isTrue()
        assertThat(rows[1].displayName).isEqualTo("bob")
        assertThat(rows[1].isSelected).isFalse()
        assertThat(rows[1].isOnline).isFalse()
    }

    // #11615 — le résolveur unique : une seule forme de demande pour un direct.

    @Test
    fun a_single_peer_is_created_through_the_one_direct_request() {
        // Le titre saisi est ignoré : un direct n'a pas de titre propre.
        assertThat(NewConversationLogic.request(listOf("u1"), rawTitle = "Ignoré"))
            .isEqualTo(directConversationRequest("u1"))
    }

    @Test
    fun the_direct_request_has_no_title_and_only_the_peer() {
        val request = NewConversationLogic.request(listOf("u1"), rawTitle = "")

        assertThat(request.type).isEqualTo(NewConversationLogic.TYPE_DIRECT)
        assertThat(request.title).isNull()
        assertThat(request.participantIds).containsExactly("u1")
    }

    @Test
    fun several_peers_are_created_as_a_titled_group() {
        val request = NewConversationLogic.request(listOf("u1", "u2"), rawTitle = "  Team  ")

        assertThat(request.type).isEqualTo(NewConversationLogic.TYPE_GROUP)
        assertThat(request.title).isEqualTo("Team")
        assertThat(request.participantIds).containsExactly("u1", "u2").inOrder()
    }

    @Test
    fun a_group_without_a_typed_title_has_none() {
        assertThat(NewConversationLogic.request(listOf("u1", "u2"), rawTitle = "  ").title).isNull()
    }
}
