package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CreationEncryptionMode
import me.meeshy.sdk.model.CreationEncryptionUnavailability
import me.meeshy.sdk.model.directConversationRequest
import me.meeshy.sdk.net.api.UserSearchResult
import org.junit.Test

class NewConversationLogicTest {

    @Test
    fun nobody_picked_and_no_group_asked_is_no_conversation_yet() {
        assertThat(NewConversationLogic.shape(0, groupRequested = false)).isEqualTo(NewConversationShape.NONE)
        assertThat(NewConversationLogic.canCreate(0, groupRequested = false, rawTitle = "Mes notes")).isFalse()
    }

    @Test
    fun one_selected_is_a_direct_conversation() {
        assertThat(NewConversationLogic.shape(1, groupRequested = false)).isEqualTo(NewConversationShape.DIRECT)
        assertThat(NewConversationLogic.conversationType(1)).isEqualTo(NewConversationLogic.TYPE_DIRECT)
        assertThat(NewConversationLogic.canCreate(1, groupRequested = false, rawTitle = "")).isTrue()
    }

    @Test
    fun two_or_more_selected_is_a_group() {
        assertThat(NewConversationLogic.shape(2, groupRequested = false)).isEqualTo(NewConversationShape.GROUP)
        assertThat(NewConversationLogic.conversationType(2)).isEqualTo(NewConversationLogic.TYPE_GROUP)
        assertThat(NewConversationLogic.conversationType(5)).isEqualTo(NewConversationLogic.TYPE_GROUP)
    }

    @Test
    fun the_new_group_switch_makes_a_group_even_of_one_peer_or_of_nobody() {
        assertThat(NewConversationLogic.shape(0, groupRequested = true)).isEqualTo(NewConversationShape.GROUP)
        assertThat(NewConversationLogic.shape(1, groupRequested = true)).isEqualTo(NewConversationShape.GROUP)
        assertThat(NewConversationLogic.conversationType(1, groupRequested = true)).isEqualTo(NewConversationLogic.TYPE_GROUP)
    }

    @Test
    fun every_group_needs_its_title_like_ios() {
        assertThat(NewConversationLogic.canCreate(0, groupRequested = true, rawTitle = "   ")).isFalse()
        assertThat(NewConversationLogic.canCreate(0, groupRequested = true, rawTitle = "Mes notes")).isTrue()
        assertThat(NewConversationLogic.canCreate(3, groupRequested = false, rawTitle = "")).isFalse()
        assertThat(NewConversationLogic.canCreate(3, groupRequested = false, rawTitle = "Team")).isTrue()
    }

    @Test
    fun a_group_of_myself_alone_leaves_as_a_titled_group_without_invitees() {
        val request = NewConversationLogic.request(emptyList(), rawTitle = "  Mes notes  ", groupRequested = true, CreationEncryptionMode.SERVER)

        assertThat(request.type).isEqualTo(NewConversationLogic.TYPE_GROUP)
        assertThat(request.title).isEqualTo("Mes notes")
        assertThat(request.participantIds).isEmpty()
    }

    @Test
    fun one_peer_with_the_group_switch_leaves_as_a_titled_group() {
        val request = NewConversationLogic.request(listOf("u1"), rawTitle = "Audit", groupRequested = true, CreationEncryptionMode.SERVER)

        assertThat(request.type).isEqualTo(NewConversationLogic.TYPE_GROUP)
        assertThat(request.title).isEqualTo("Audit")
        assertThat(request.participantIds).containsExactly("u1")
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
        assertThat(NewConversationLogic.request(listOf("u1"), rawTitle = "Ignoré", groupRequested = false, CreationEncryptionMode.SERVER))
            .isEqualTo(directConversationRequest("u1").copy(encryptionMode = "server"))
    }

    @Test
    fun the_creation_screen_sends_the_checked_mode_while_the_shared_direct_request_sends_none() {
        assertThat(NewConversationLogic.request(listOf("u1"), rawTitle = "", groupRequested = false, CreationEncryptionMode.HYBRID).encryptionMode)
            .isEqualTo("hybrid")
        assertThat(NewConversationLogic.request(listOf("u1", "u2"), rawTitle = "", groupRequested = false, CreationEncryptionMode.SERVER).encryptionMode)
            .isEqualTo("server")
        assertThat(directConversationRequest("u1").encryptionMode).isNull()
    }

    @Test
    fun this_phone_offers_end_to_end_for_a_direct_conversation() {
        val offer = NewConversationLogic.encryptionOffer(platformRole = "ADMIN", selectedCount = 1)

        assertThat(NewConversationLogic.END_TO_END_SUPPORTED).isTrue()
        assertThat(offer.choices.last().mode).isEqualTo(CreationEncryptionMode.E2EE)
        assertThat(offer.choices.last().available).isTrue()
        assertThat(offer.defaultMode).isEqualTo(CreationEncryptionMode.E2EE)
    }

    @Test
    fun a_group_offers_end_to_end_as_soon_for_groups() {
        val offer = NewConversationLogic.encryptionOffer(platformRole = "ADMIN", selectedCount = 2)

        assertThat(offer.choices.last().unavailability).isEqualTo(CreationEncryptionUnavailability.GROUPS_NOT_YET)
    }

    @Test
    fun a_picked_mode_that_is_no_longer_available_falls_back_to_the_default() {
        val offer = NewConversationLogic.encryptionOffer(platformRole = "ADMIN", selectedCount = 2)

        assertThat(NewConversationLogic.resolvedEncryptionMode(offer, CreationEncryptionMode.HYBRID)).isEqualTo(CreationEncryptionMode.HYBRID)
        assertThat(NewConversationLogic.resolvedEncryptionMode(offer, CreationEncryptionMode.E2EE)).isEqualTo(CreationEncryptionMode.SERVER)
        assertThat(NewConversationLogic.resolvedEncryptionMode(offer, null)).isEqualTo(CreationEncryptionMode.SERVER)
    }

    @Test
    fun the_direct_request_has_no_title_and_only_the_peer() {
        val request = NewConversationLogic.request(listOf("u1"), rawTitle = "", groupRequested = false, CreationEncryptionMode.SERVER)

        assertThat(request.type).isEqualTo(NewConversationLogic.TYPE_DIRECT)
        assertThat(request.title).isNull()
        assertThat(request.participantIds).containsExactly("u1")
    }

    @Test
    fun several_peers_are_created_as_a_titled_group() {
        val request = NewConversationLogic.request(listOf("u1", "u2"), rawTitle = "  Team  ", groupRequested = false, CreationEncryptionMode.SERVER)

        assertThat(request.type).isEqualTo(NewConversationLogic.TYPE_GROUP)
        assertThat(request.title).isEqualTo("Team")
        assertThat(request.participantIds).containsExactly("u1", "u2").inOrder()
    }

    @Test
    fun a_group_without_a_typed_title_has_none() {
        assertThat(NewConversationLogic.request(listOf("u1", "u2"), rawTitle = "  ", groupRequested = false, CreationEncryptionMode.SERVER).title).isNull()
    }

    @Test
    fun a_row_carries_the_activity_date_the_gateway_served_so_its_dot_can_decay() {
        val rows = NewConversationLogic.rows(
            listOf(
                UserSearchResult(id = "u1", username = "alice", isOnline = false, lastActiveAt = "2026-10-29T10:00:00Z"),
                UserSearchResult(id = "u2", username = "bob"),
            ),
            selectedIds = emptySet(),
        )

        assertThat(rows[0].servedPresence?.lastActiveAt).isEqualTo("2026-10-29T10:00:00Z")
        assertThat(rows[1].servedPresence?.state(0L)).isNotEqualTo(me.meeshy.sdk.model.PresenceState.ONLINE)
        assertThat(rows[1].lastActiveAt).isNull()
    }

    @Test
    fun `a blocked row is not selectable and a normal one is`() {
        val row = SelectableUser("a", "Ann", "ann", null, isOnline = false)
        assertThat(NewConversationLogic.isSelectable(row)).isTrue()
        assertThat(NewConversationLogic.isSelectable(row.copy(isBlocked = true))).isFalse()
    }

    @Test
    fun `the accessibility label composes name, handle and the blocked or online status`() {
        val row = SelectableUser("a", "Ann", "ann", null, isOnline = true)
        assertThat(NewConversationLogic.rowAccessibilityLabel(row, true, "Blocked", "online")).isEqualTo("Ann, @ann, online")
        assertThat(NewConversationLogic.rowAccessibilityLabel(row, false, "Blocked", "online")).isEqualTo("Ann, @ann")
        assertThat(NewConversationLogic.rowAccessibilityLabel(row.copy(isBlocked = true), true, "Blocked", "online"))
            .isEqualTo("Ann, @ann, Blocked")
    }
}
