package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.theme.accentHex
import org.junit.Test

class StorySendTargetsTest {

    private fun group(
        id: String,
        title: String? = null,
        avatar: String? = null,
        members: Int = 2,
        active: Boolean? = null,
        announcement: Boolean = false,
        defaultWriteRole: String? = null,
        currentUserRole: String? = null,
        deletedForUserAt: String? = null,
    ) = ApiConversation(
        id = id,
        type = "group",
        title = title,
        avatar = avatar,
        isActive = active,
        isAnnouncementChannel = announcement,
        defaultWriteRole = defaultWriteRole,
        currentUserRole = currentUserRole,
        participants = (1..members).map { ApiParticipant(id = "$id-p$it", userId = "$id-u$it") },
        preferences = ApiConversationPreferences(deletedForUserAt = deletedForUserAt),
    )

    @Test
    fun no_conversations_yields_no_targets() {
        assertThat(StorySendTargets.of(emptyList(), query = "")).isEmpty()
    }

    @Test
    fun every_conversation_the_caller_may_write_into_is_a_target_on_a_blank_query() {
        val targets = StorySendTargets.of(
            listOf(group("c1", "Alpha"), group("c2", "Beta")),
            query = "",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c1", "c2").inOrder()
    }

    @Test
    fun a_query_matches_the_title_case_insensitively() {
        val targets = StorySendTargets.of(
            listOf(group("c1", "Alpha Squad"), group("c2", "Beta")),
            query = "alpha",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c1")
    }

    @Test
    fun input_order_is_preserved() {
        val targets = StorySendTargets.of(
            listOf(group("c3", "Gamma"), group("c2", "Beta"), group("c4", "Alpha")),
            query = "",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c3", "c2", "c4").inOrder()
    }

    @Test
    fun a_member_in_an_announcement_channel_is_not_offered_as_a_target() {
        val targets = StorySendTargets.of(
            listOf(group("c1", "Announcements", announcement = true, currentUserRole = "member")),
            query = "",
            currentUserId = "u1",
        )
        assertThat(targets).isEmpty()
    }

    @Test
    fun an_admin_in_an_announcement_channel_is_offered_as_a_target() {
        val targets = StorySendTargets.of(
            listOf(group("c1", "Announcements", announcement = true, currentUserRole = "admin")),
            query = "",
            currentUserId = "u1",
        )
        assertThat(targets.map { it.conversationId }).containsExactly("c1")
    }

    @Test
    fun an_inactive_conversation_is_not_offered_as_a_target() {
        val targets = StorySendTargets.of(
            listOf(group("c1", "Gone", active = false)),
            query = "",
        )
        assertThat(targets).isEmpty()
    }

    @Test
    fun a_conversation_soft_deleted_for_the_reader_is_not_offered_as_a_target() {
        val targets = StorySendTargets.of(
            listOf(group("c1", "Hidden", deletedForUserAt = "2026-01-01T00:00:00Z")),
            query = "",
        )
        assertThat(targets).isEmpty()
    }

    @Test
    fun a_blank_avatar_degrades_to_null_and_a_present_one_is_carried() {
        val targets = StorySendTargets.of(
            listOf(group("c1", "Alpha", avatar = "  "), group("c2", "Beta", avatar = "https://a/x.png")),
            query = "",
        )
        assertThat(targets.first { it.conversationId == "c1" }.avatar).isNull()
        assertThat(targets.first { it.conversationId == "c2" }.avatar).isEqualTo("https://a/x.png")
    }

    @Test
    fun the_target_carries_the_deterministic_conversation_accent_and_member_count() {
        val conv = group("c1", "Alpha", members = 5)
        val target = StorySendTargets.of(listOf(conv), query = "").single()

        assertThat(target.accentHex).isEqualTo(conv.accentHex())
        assertThat(target.memberCount).isEqualTo(5)
        assertThat(target.type).isEqualTo("group")
    }
}
