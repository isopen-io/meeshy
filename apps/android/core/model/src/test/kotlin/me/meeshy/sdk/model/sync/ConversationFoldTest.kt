package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationObsoletedSocketEvent
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.UnreadUpdateEvent
import org.junit.Test

class ConversationFoldTest {

    private fun group() = ApiConversation(
        id = "c1", type = "group", title = "Team", description = "kept", avatar = "a.png", unreadCount = 4,
    )

    @Test
    fun `an updated frame changes only the fields it carries`() {
        val row = ConversationFold.updated(
            group(), ConversationUpdatedSocketEvent(conversationId = "c1", title = "Renamed"), "me", "Vous",
        )
        assertThat(row.title).isEqualTo("Renamed")
        assertThat(row.description).isEqualTo("kept")
        assertThat(row.avatar).isEqualTo("a.png")
    }

    @Test
    fun `an empty updated frame returns the row untouched`() {
        val row = group()
        assertThat(ConversationFold.updated(row, ConversationUpdatedSocketEvent(conversationId = "c1"), "me", "Vous"))
            .isEqualTo(row)
    }

    @Test
    fun `unread-updated applies the server snapshot, never below zero`() {
        assertThat(ConversationFold.unread(group(), UnreadUpdateEvent("c1", unreadCount = 0)).unreadCount).isEqualTo(0)
        assertThat(ConversationFold.unread(group(), UnreadUpdateEvent("c1", unreadCount = -3)).unreadCount).isEqualTo(0)
        assertThat(ConversationFold.unread(group(), UnreadUpdateEvent("c1", unreadCount = 9)).unreadCount).isEqualTo(9)
    }

    @Test
    fun `deleted, closed and obsoleted name the row to remove, a blank id nothing`() {
        assertThat(ConversationFold.removedBy(ConversationDeletedSocketEvent("c1"))).isEqualTo("c1")
        assertThat(ConversationFold.removedBy(ConversationClosedSocketEvent("c1", closedBy = "u"))).isEqualTo("c1")
        assertThat(ConversationFold.removedBy(ConversationObsoletedSocketEvent("c1"))).isEqualTo("c1")
        assertThat(ConversationFold.removedBy(ConversationDeletedSocketEvent(" "))).isNull()
        assertThat(ConversationFold.removedBy(ConversationClosedSocketEvent("", closedBy = "u"))).isNull()
        assertThat(ConversationFold.removedBy(ConversationObsoletedSocketEvent(""))).isNull()
    }

    @Test
    fun `restored names the conversation to read back by id`() {
        assertThat(ConversationFold.restoredBy(ConversationRestoredSocketEvent("c1"))).isEqualTo("c1")
        assertThat(ConversationFold.restoredBy(ConversationRestoredSocketEvent(""))).isNull()
    }
}
