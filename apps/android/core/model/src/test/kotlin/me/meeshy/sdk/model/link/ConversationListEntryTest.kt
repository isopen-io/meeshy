package me.meeshy.sdk.model.link

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationFilter
import org.junit.Test

class ConversationListEntryTest {
    private fun conversation(
        id: String,
        lastAt: String? = null,
        archived: Boolean = false,
        deleted: Boolean = false,
        active: Boolean? = null,
    ) = ApiConversation(
        id = id,
        isActive = active,
        lastMessage = lastAt?.let { ApiConversationLastMessage(id = "m$id", createdAt = it) },
        userPreferences = listOf(
            ApiConversationPreferences(isArchived = archived, deletedForUserAt = if (deleted) "2026-01-01T00:00:00.000Z" else null),
        ),
    )

    @Test
    fun `the recent conversation is the one with the latest message`() {
        val list = listOf(
            conversation("a", "2026-10-01T10:00:00.000Z"),
            conversation("b", "2026-10-03T10:00:00.000Z"),
            conversation("c", "2026-10-02T10:00:00.000Z"),
        )
        assertThat(ConversationListEntry.recentConversationId(list)).isEqualTo("b")
    }

    @Test
    fun `archived, deleted and closed conversations are never elected`() {
        val list = listOf(
            conversation("old", "2026-10-01T10:00:00.000Z"),
            conversation("archived", "2026-10-09T10:00:00.000Z", archived = true),
            conversation("deleted", "2026-10-08T10:00:00.000Z", deleted = true),
            conversation("closed", "2026-10-07T10:00:00.000Z", active = false),
        )
        assertThat(ConversationListEntry.recentConversationId(list)).isEqualTo("old")
    }

    @Test
    fun `nothing is elected from an empty or fully hidden list`() {
        assertThat(ConversationListEntry.recentConversationId(emptyList())).isNull()
        assertThat(ConversationListEntry.recentConversationId(listOf(conversation("x", archived = true)))).isNull()
    }

    @Test
    fun `unread opens the list on the unread chip filter`() {
        assertThat(ConversationListEntry.unreadFilter).isEqualTo(ConversationFilter.UNREAD)
    }
}
