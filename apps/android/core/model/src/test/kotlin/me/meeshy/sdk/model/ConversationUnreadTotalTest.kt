package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [totalUnreadCount] is the single source of truth for "how many unread messages
 * across all conversations" — reused by the in-app dashboard preview
 * (`DashboardScreen.dashboardUnreadTotal`) and the home-screen widget's unread
 * badge (`:app` `UnreadCountWidget`), so both surfaces can never drift.
 */
class ConversationUnreadTotalTest {

    private fun conversation(id: String, unread: Int) =
        ApiConversation(id = id, title = id, unreadCount = unread)

    @Test
    fun `totalUnreadCount is zero for an empty list`() {
        assertThat(emptyList<ApiConversation>().totalUnreadCount()).isEqualTo(0)
    }

    @Test
    fun `totalUnreadCount is the single conversation's count for a single-element list`() {
        assertThat(listOf(conversation("c1", unread = 5)).totalUnreadCount()).isEqualTo(5)
    }

    @Test
    fun `totalUnreadCount sums every conversation's unreadCount`() {
        val conversations = listOf(
            conversation("c1", unread = 3),
            conversation("c2", unread = 0),
            conversation("c3", unread = 7),
        )
        assertThat(conversations.totalUnreadCount()).isEqualTo(10)
    }

    @Test
    fun `totalUnreadCount ignores conversations with zero unread`() {
        val conversations = listOf(conversation("c1", unread = 0), conversation("c2", unread = 0))
        assertThat(conversations.totalUnreadCount()).isEqualTo(0)
    }
}
