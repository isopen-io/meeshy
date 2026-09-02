package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Verifies [mayCurrentUserWrite] mirrors the gateway's rank check
 * (`conversationWriteAdmission.ts`) — the guard `StorySendTargets` and
 * `ForwardTargets` both filter on before offering a conversation as a target.
 */
class ConversationWriteAdmissionTest {

    private fun conversation(
        type: String = "group",
        active: Boolean? = true,
        announcement: Boolean = false,
        defaultWriteRole: String? = null,
        deletedForUserAt: String? = null,
        currentUserRole: String? = null,
        participants: List<ApiParticipant> = emptyList(),
    ) = ApiConversation(
        id = "c1",
        type = type,
        isActive = active,
        isAnnouncementChannel = announcement,
        defaultWriteRole = defaultWriteRole,
        currentUserRole = currentUserRole,
        participants = participants,
        preferences = ApiConversationPreferences(deletedForUserAt = deletedForUserAt),
    )

    @Test
    fun a_conversation_with_no_write_restriction_is_writable_by_everyone() {
        assertThat(conversation().mayCurrentUserWrite("u1")).isTrue()
    }

    @Test
    fun a_member_in_an_announcement_channel_cannot_write() {
        val conv = conversation(announcement = true, currentUserRole = "member")
        assertThat(conv.mayCurrentUserWrite("u1")).isFalse()
    }

    @Test
    fun an_admin_in_an_announcement_channel_can_write() {
        val conv = conversation(announcement = true, currentUserRole = "admin")
        assertThat(conv.mayCurrentUserWrite("u1")).isTrue()
    }

    @Test
    fun a_creator_in_an_announcement_channel_can_write() {
        val conv = conversation(announcement = true, currentUserRole = "creator")
        assertThat(conv.mayCurrentUserWrite("u1")).isTrue()
    }

    @Test
    fun defaultWriteRole_below_the_callers_rank_refuses() {
        val conv = conversation(defaultWriteRole = "moderator", currentUserRole = "member")
        assertThat(conv.mayCurrentUserWrite("u1")).isFalse()
    }

    @Test
    fun defaultWriteRole_at_or_below_the_callers_rank_admits() {
        val conv = conversation(defaultWriteRole = "moderator", currentUserRole = "moderator")
        assertThat(conv.mayCurrentUserWrite("u1")).isTrue()
    }

    @Test
    fun an_inactive_conversation_is_never_writable() {
        val conv = conversation(active = false)
        assertThat(conv.mayCurrentUserWrite("u1")).isFalse()
    }

    @Test
    fun a_conversation_soft_deleted_for_the_reader_is_never_writable() {
        val conv = conversation(deletedForUserAt = "2026-01-01T00:00:00Z")
        assertThat(conv.mayCurrentUserWrite("u1")).isFalse()
    }

    @Test
    fun a_direct_conversation_is_exempt_from_the_write_hierarchy() {
        val conv = conversation(type = "direct", defaultWriteRole = "admin", currentUserRole = "member")
        assertThat(conv.mayCurrentUserWrite("u1")).isTrue()
    }

    @Test
    fun a_global_conversation_is_exempt_from_the_write_hierarchy() {
        val conv = conversation(type = "global", announcement = true, currentUserRole = "member")
        assertThat(conv.mayCurrentUserWrite("u1")).isTrue()
    }

    @Test
    fun a_caller_absent_from_participants_and_without_a_server_role_defaults_to_member() {
        val conv = conversation(defaultWriteRole = "admin", currentUserRole = null, participants = emptyList())
        assertThat(conv.mayCurrentUserWrite("stranger")).isFalse()
    }

    @Test
    fun server_computed_currentUserRole_is_preferred_over_scanning_participants() {
        val conv = conversation(
            defaultWriteRole = "admin",
            currentUserRole = "admin",
            participants = listOf(ApiParticipant(id = "p1", userId = "u1", role = "member")),
        )
        assertThat(conv.mayCurrentUserWrite("u1")).isTrue()
    }
}
