package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationContext
import me.meeshy.sdk.model.NotificationReadScope
import me.meeshy.sdk.model.NotificationState
import org.junit.Test

/**
 * Kotlin mirror of `packages/shared/utils/notification-read-bulk.test.ts` (the two predicates'
 * shared source of truth) — every case here has a line-for-line counterpart there.
 */
class NotificationSyncEventsTest {

    private fun notification(
        id: String = "n1",
        type: String = "new_message",
        isRead: Boolean = false,
        conversationId: String? = null,
        postId: String? = null,
        friendRequestId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
        state = NotificationState(isRead = isRead, createdAt = "2026-08-17T00:00:00.000Z"),
        context = NotificationContext(
            conversationId = conversationId,
            postId = postId,
            friendRequestId = friendRequestId,
        ),
    )

    // --- notificationMatchesReadBulkScope ---

    @Test
    fun `all scope matches every notification`() {
        val scope = NotificationReadBulkScope(kind = "all")

        assertThat(notificationMatchesReadBulkScope(scope, notification())).isTrue()
    }

    @Test
    fun `context scope matches on the exact context key and value`() {
        val scope = NotificationReadBulkScope(kind = "context", contextKey = "conversationId", contextValue = "c1")

        assertThat(
            notificationMatchesReadBulkScope(scope, notification(conversationId = "c1"))
        ).isTrue()
        assertThat(
            notificationMatchesReadBulkScope(scope, notification(conversationId = "c2"))
        ).isFalse()
        assertThat(
            notificationMatchesReadBulkScope(scope, notification(conversationId = null))
        ).isFalse()
    }

    @Test
    fun `context scope reads the postId and friendRequestId keys too`() {
        assertThat(
            notificationMatchesReadBulkScope(
                NotificationReadBulkScope(kind = "context", contextKey = "postId", contextValue = "p1"),
                notification(postId = "p1"),
            )
        ).isTrue()
        assertThat(
            notificationMatchesReadBulkScope(
                NotificationReadBulkScope(kind = "context", contextKey = "friendRequestId", contextValue = "f1"),
                notification(friendRequestId = "f1"),
            )
        ).isTrue()
    }

    @Test
    fun `types scope matches only listed types`() {
        val scope = NotificationReadBulkScope(kind = "types", types = listOf("user_mentioned", "mention"))

        assertThat(
            notificationMatchesReadBulkScope(scope, notification(type = "user_mentioned"))
        ).isTrue()
        assertThat(
            notificationMatchesReadBulkScope(scope, notification(type = "new_message"))
        ).isFalse()
    }

    @Test
    fun `an unrecognized read-bulk kind matches nothing`() {
        val scope = NotificationReadBulkScope(kind = "future-server-kind")

        assertThat(notificationMatchesReadBulkScope(scope, notification())).isFalse()
    }

    // --- notificationMatchesDeletedBulkScope ---

    @Test
    fun `read scope matches only already-read notifications`() {
        val scope = NotificationDeletedBulkScope(kind = "read")

        assertThat(notificationMatchesDeletedBulkScope(scope, notification(isRead = true))).isTrue()
        assertThat(notificationMatchesDeletedBulkScope(scope, notification(isRead = false))).isFalse()
    }

    @Test
    fun `an unrecognized deleted-bulk kind matches nothing`() {
        val scope = NotificationDeletedBulkScope(kind = "future-server-kind")

        assertThat(notificationMatchesDeletedBulkScope(scope, notification(isRead = true))).isFalse()
    }

    // --- toReadScope / purgesReadRows (miroir de NotificationBulkScopeMapping iOS) ---

    @Test
    fun `bulk scope maps to the consumption scope`() {
        assertThat(NotificationReadBulkScope(kind = "all").toReadScope()).isEqualTo(NotificationReadScope.All)
        assertThat(
            NotificationReadBulkScope(kind = "context", contextKey = "conversationId", contextValue = "c1").toReadScope()
        ).isEqualTo(NotificationReadScope.Conversation("c1"))
        assertThat(
            NotificationReadBulkScope(kind = "context", contextKey = "postId", contextValue = "p1").toReadScope()
        ).isEqualTo(NotificationReadScope.Post("p1"))
        assertThat(
            NotificationReadBulkScope(kind = "types", types = listOf("a", "b")).toReadScope()
        ).isEqualTo(NotificationReadScope.Types(listOf("a", "b")))
    }

    @Test
    fun `an untranslatable bulk scope maps to null`() {
        assertThat(NotificationReadBulkScope(kind = "context", contextKey = "friendRequestId", contextValue = "f1").toReadScope()).isNull()
        assertThat(NotificationReadBulkScope(kind = "context", contextKey = "conversationId", contextValue = "").toReadScope()).isNull()
        assertThat(NotificationReadBulkScope(kind = "context", contextKey = "conversationId").toReadScope()).isNull()
        assertThat(NotificationReadBulkScope(kind = "types", types = emptyList()).toReadScope()).isNull()
        assertThat(NotificationReadBulkScope(kind = "types").toReadScope()).isNull()
        assertThat(NotificationReadBulkScope(kind = "nope").toReadScope()).isNull()
    }

    @Test
    fun `only the read kind purges read rows`() {
        assertThat(NotificationDeletedBulkScope(kind = "read").purgesReadRows()).isTrue()
        assertThat(NotificationDeletedBulkScope(kind = "all").purgesReadRows()).isFalse()
    }
}
