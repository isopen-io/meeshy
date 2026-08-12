package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Verifies the conversation list filtering pipeline mirrors iOS
 * `ConversationListViewModel.filterConversations` semantics exactly.
 */
class ConversationFiltersTest {

    private fun conversation(
        id: String = "c",
        type: String = "direct",
        title: String? = null,
        unread: Int = 0,
        announcement: Boolean = false,
        active: Boolean? = null,
        archived: Boolean = false,
        deletedAt: String? = null,
        reaction: String? = null,
        customName: String? = null,
        participants: List<ApiParticipant> = emptyList(),
    ) = ApiConversation(
        id = id,
        type = type,
        title = title,
        unreadCount = unread,
        isAnnouncementChannel = announcement,
        isActive = active,
        participants = participants,
        preferences = ApiConversationPreferences(
            isArchived = archived,
            deletedForUserAt = deletedAt,
            reaction = reaction,
            customName = customName,
        ),
    )

    private fun List<ApiConversation>.ids(
        filter: ConversationFilter,
        search: String = "",
        currentUserId: String? = null,
    ): List<String> = ConversationFilters.apply(this, filter, search, currentUserId).map { it.id }

    @Test
    fun all_filter_shows_active_non_archived_conversations() {
        val convs = listOf(
            conversation(id = "a"),
            conversation(id = "b", archived = true),
        )
        assertThat(convs.ids(ConversationFilter.ALL)).containsExactly("a")
    }

    @Test
    fun soft_deleted_conversations_are_hidden_from_every_filter() {
        val deleted = conversation(id = "d", deletedAt = "2026-01-01T00:00:00Z", archived = true)
        val convs = listOf(deleted)
        assertThat(convs.ids(ConversationFilter.ALL)).isEmpty()
        assertThat(convs.ids(ConversationFilter.ARCHIVED)).isEmpty()
    }

    @Test
    fun archived_filter_shows_only_archived() {
        val convs = listOf(
            conversation(id = "a"),
            conversation(id = "b", archived = true),
        )
        assertThat(convs.ids(ConversationFilter.ARCHIVED)).containsExactly("b")
    }

    @Test
    fun unread_filter_excludes_archived_and_read() {
        val convs = listOf(
            conversation(id = "a", unread = 3),
            conversation(id = "b", unread = 0),
            conversation(id = "c", unread = 5, archived = true),
        )
        assertThat(convs.ids(ConversationFilter.UNREAD)).containsExactly("a")
    }

    @Test
    fun type_filters_partition_by_conversation_type() {
        val convs = listOf(
            conversation(id = "direct", type = "direct"),
            conversation(id = "group", type = "group"),
            conversation(id = "public", type = "public"),
            conversation(id = "community", type = "community"),
            conversation(id = "global", type = "global"),
        )
        assertThat(convs.ids(ConversationFilter.PERSONAL)).containsExactly("direct")
        assertThat(convs.ids(ConversationFilter.PRIVATE)).containsExactly("group")
        assertThat(convs.ids(ConversationFilter.OPEN)).containsExactly("public", "community")
        assertThat(convs.ids(ConversationFilter.GLOBAL)).containsExactly("global")
    }

    @Test
    fun channels_filter_matches_announcement_channels() {
        val convs = listOf(
            conversation(id = "chan", type = "group", announcement = true),
            conversation(id = "plain", type = "group"),
        )
        assertThat(convs.ids(ConversationFilter.CHANNELS)).containsExactly("chan")
    }

    @Test
    fun favorites_filter_matches_conversations_with_a_reaction() {
        val convs = listOf(
            conversation(id = "fav", reaction = "⭐️"),
            conversation(id = "plain"),
        )
        assertThat(convs.ids(ConversationFilter.FAVORITES)).containsExactly("fav")
    }

    @Test
    fun inactive_conversations_are_hidden_from_non_archived_filters() {
        val convs = listOf(conversation(id = "ended", active = false))
        assertThat(convs.ids(ConversationFilter.ALL)).isEmpty()
    }

    @Test
    fun search_matches_title_case_insensitively() {
        val convs = listOf(
            conversation(id = "team", title = "Design Team"),
            conversation(id = "ops", title = "Operations"),
        )
        assertThat(convs.ids(ConversationFilter.ALL, search = "design")).containsExactly("team")
    }

    @Test
    fun search_matches_direct_conversation_by_participant_name() {
        val convs = listOf(
            conversation(
                id = "dm",
                type = "direct",
                participants = listOf(
                    ApiParticipant(id = "p1", userId = "me", displayName = "Me"),
                    ApiParticipant(id = "p2", userId = "u2", displayName = "Alice Martin"),
                ),
            ),
        )
        assertThat(convs.ids(ConversationFilter.ALL, search = "alice", currentUserId = "me"))
            .containsExactly("dm")
    }

    @Test
    fun search_prefers_custom_name_override() {
        val convs = listOf(
            conversation(id = "c", title = "Original", customName = "My Nickname"),
        )
        assertThat(convs.ids(ConversationFilter.ALL, search = "nickname")).containsExactly("c")
        assertThat(convs.ids(ConversationFilter.ALL, search = "original")).isEmpty()
    }
}
