package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationReadScopeTest {

    private fun notification(
        id: String = "n1",
        type: String = "new_message",
        isRead: Boolean = false,
        conversationId: String? = null,
        postId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
        state = NotificationState(isRead = isRead, createdAt = "2026-10-22T00:00:00.000Z"),
        context = NotificationContext(conversationId = conversationId, postId = postId),
    )

    @Test
    fun `a single scope matches only its own id`() {
        assertThat(NotificationReadScope.Single("n1").matches(notification(id = "n1"))).isTrue()
        assertThat(NotificationReadScope.Single("n1").matches(notification(id = "n2"))).isFalse()
    }

    @Test
    fun `a conversation scope matches the context conversation and never the post`() {
        val scope = NotificationReadScope.Conversation("c1")

        assertThat(scope.matches(notification(conversationId = "c1"))).isTrue()
        assertThat(scope.matches(notification(conversationId = "c2"))).isFalse()
        assertThat(scope.matches(notification(postId = "c1"))).isFalse()
    }

    @Test
    fun `a post scope matches the context post and never the conversation`() {
        val scope = NotificationReadScope.Post("p1")

        assertThat(scope.matches(notification(postId = "p1"))).isTrue()
        assertThat(scope.matches(notification(conversationId = "p1"))).isFalse()
    }

    @Test
    fun `a types scope matches the listed raw types`() {
        val scope = NotificationReadScope.Types(listOf("friend_request", "contact_request"))

        assertThat(scope.matches(notification(type = "friend_request"))).isTrue()
        assertThat(scope.matches(notification(type = "new_message"))).isFalse()
    }

    @Test
    fun `the all scope matches every row`() {
        assertThat(NotificationReadScope.All.matches(notification())).isTrue()
    }

    @Test
    fun `unreadMatching keeps only unread covered rows`() {
        val rows = listOf(
            notification(id = "a", conversationId = "c1"),
            notification(id = "b", conversationId = "c1", isRead = true),
            notification(id = "c", conversationId = "c2"),
        )

        val hit = NotificationReadScope.unreadMatching(NotificationReadScope.Conversation("c1"), rows)

        assertThat(hit.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a scope aiming at nothing is empty`() {
        assertThat(NotificationReadScope.Single(" ").isEmpty).isTrue()
        assertThat(NotificationReadScope.Conversation("").isEmpty).isTrue()
        assertThat(NotificationReadScope.Post("").isEmpty).isTrue()
        assertThat(NotificationReadScope.Types(listOf("", " ")).isEmpty).isTrue()
        assertThat(NotificationReadScope.Types(emptyList()).isEmpty).isTrue()
        assertThat(NotificationReadScope.All.isEmpty).isFalse()
        assertThat(NotificationReadScope.Single("n1").isEmpty).isFalse()
    }

    @Test
    fun `ledger keys never collide between kinds`() {
        val keys = listOf(
            NotificationReadScope.Single("x"),
            NotificationReadScope.Conversation("x"),
            NotificationReadScope.Post("x"),
            NotificationReadScope.Types(listOf("x")),
            NotificationReadScope.All,
        ).map { it.ledgerKey }

        assertThat(keys.toSet()).hasSize(5)
        assertThat(NotificationReadScope.Single("x").ledgerKey).isEqualTo("x")
    }

    @Test
    fun `types ledger key ignores the order`() {
        assertThat(NotificationReadScope.Types(listOf("b", "a")).ledgerKey)
            .isEqualTo(NotificationReadScope.Types(listOf("a", "b")).ledgerKey)
    }
}
