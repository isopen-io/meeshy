package me.meeshy.sdk.notification

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MarkReadResponse
import me.meeshy.sdk.model.NotificationContext
import me.meeshy.sdk.model.NotificationReadScope
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class NotificationConsumptionServiceTest {

    private class Clock(var now: Long = 1_000_000) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private class Fixture(
        val api: NotificationApi,
        val repo: NotificationRepository,
        val events: NotificationConsumptionEvents,
        val clock: Clock,
        val service: NotificationConsumptionService,
    ) {
        fun rows(): Map<String, Boolean> =
            repo.cachedItems(NotificationScope.All).orEmpty().associate { it.id to it.state.isRead }
    }

    private fun notification(
        id: String,
        isRead: Boolean = false,
        type: String = "new_message",
        conversationId: String? = null,
        postId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
        state = NotificationState(isRead = isRead, createdAt = "2026-10-22T00:00:00.000Z"),
        context = NotificationContext(conversationId = conversationId, postId = postId),
    )

    private suspend fun fixture(vararg items: ApiNotification, serverUnread: Int? = null): Fixture {
        val api: NotificationApi = mockk(relaxed = true)
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = items.toList())
        coEvery { api.unreadCount() } returns
            UnreadCountResponse(success = true, count = serverUnread ?: items.count { !it.state.isRead })
        val repo = NotificationRepository(api).also { it.refresh() }
        val events = NotificationConsumptionEvents()
        val clock = Clock()
        return Fixture(api, repo, events, clock, NotificationConsumptionService(repo, api, events, clock))
    }

    @Test
    fun `opening a conversation marks its rows read and settles the badge before confirming`() = runTest {
        val f = fixture(
            notification("a1", conversationId = "A"),
            notification("a2", conversationId = "A"),
            notification("b1", conversationId = "B"),
        )
        coEvery { f.api.markConversationAsRead("A") } returns MarkReadResponse(success = true, count = 2)

        f.events.conversationNotificationsRead.test {
            val consumed = f.service.consume(NotificationReadScope.Conversation("A"))

            assertThat(consumed).isTrue()
            assertThat(awaitItem()).isEqualTo("A")
        }
        assertThat(f.rows()).containsExactly("a1", true, "a2", true, "b1", false)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
        coVerify(exactly = 1) { f.api.markConversationAsRead("A") }
    }

    @Test
    fun `the local state is applied while the server call is still running`() = runTest {
        val f = fixture(notification("a1", conversationId = "A"))
        var seenDuringCall: Map<String, Boolean>? = null
        coEvery { f.api.markConversationAsRead("A") } coAnswers {
            seenDuringCall = f.rows()
            MarkReadResponse(success = true, count = 1)
        }

        f.service.consume(NotificationReadScope.Conversation("A"))

        assertThat(seenDuringCall).containsExactly("a1", true)
    }

    @Test
    fun `a second open inside five seconds sends no second request`() = runTest {
        val f = fixture(notification("a1", conversationId = "A"))
        coEvery { f.api.markConversationAsRead("A") } returns MarkReadResponse(success = true, count = 1)

        f.service.consume(NotificationReadScope.Conversation("A"))
        f.repo.prependLive(notification("a2", conversationId = "A"))
        f.clock.now += 4_999
        f.service.consume(NotificationReadScope.Conversation("A"))

        coVerify(exactly = 1) { f.api.markConversationAsRead("A") }
        assertThat(f.rows()["a2"]).isTrue()
    }

    @Test
    fun `an open after the window sends a new request`() = runTest {
        val f = fixture(notification("a1", conversationId = "A"))
        coEvery { f.api.markConversationAsRead("A") } returns MarkReadResponse(success = true, count = 1)

        f.service.consume(NotificationReadScope.Conversation("A"))
        f.repo.prependLive(notification("a2", conversationId = "A"))
        f.clock.now += 5_000
        f.service.consume(NotificationReadScope.Conversation("A"))

        coVerify(exactly = 2) { f.api.markConversationAsRead("A") }
    }

    @Test
    fun `no request leaves when the cache knows no unread row for the conversation`() = runTest {
        val f = fixture(
            notification("a1", isRead = true, conversationId = "A"),
            notification("b1", conversationId = "B"),
        )

        f.service.consume(NotificationReadScope.Conversation("A"))

        coVerify(exactly = 0) { f.api.markConversationAsRead(any()) }
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `an empty cache stays unknown so the request still leaves`() = runTest {
        val f = fixture()
        coEvery { f.api.markPostAsRead("P") } returns MarkReadResponse(success = true, count = 0)

        f.service.consume(NotificationReadScope.Post("P"))

        coVerify(exactly = 1) { f.api.markPostAsRead("P") }
    }

    @Test
    fun `a post is stamped once per window`() = runTest {
        val f = fixture(notification("p1", postId = "P"))
        coEvery { f.api.markPostAsRead("P") } returns MarkReadResponse(success = true, count = 1)

        f.service.consume(NotificationReadScope.Post("P"))
        f.service.consume(NotificationReadScope.Post("P"))

        coVerify(exactly = 1) { f.api.markPostAsRead("P") }
    }

    @Test
    fun `a refused conversation call rolls back only its own rows and fixes the badge by the reverted delta`() = runTest {
        val f = fixture(
            notification("a1", conversationId = "A"),
            notification("a2", isRead = true, conversationId = "A"),
            notification("b1", conversationId = "B"),
        )
        coEvery { f.api.markConversationAsRead("A") } coAnswers {
            f.repo.applyRead("b1")
            throw IOException("offline")
        }

        f.events.notificationReadRolledBack.test {
            val consumed = f.service.consume(NotificationReadScope.Conversation("A"))

            assertThat(consumed).isFalse()
            assertThat(awaitItem()).isEqualTo(NotificationReadScope.Conversation("A"))
        }
        assertThat(f.rows()).containsExactly("a1", false, "a2", true, "b1", true)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `a failure leaves the key retryable at once`() = runTest {
        val f = fixture(notification("a1", conversationId = "A"))
        coEvery { f.api.markConversationAsRead("A") } throws IOException("offline")
        f.service.consume(NotificationReadScope.Conversation("A"))
        coEvery { f.api.markConversationAsRead("A") } returns MarkReadResponse(success = true, count = 1)

        f.service.consume(NotificationReadScope.Conversation("A"))

        coVerify(exactly = 2) { f.api.markConversationAsRead("A") }
        assertThat(f.rows()["a1"]).isTrue()
    }

    @Test
    fun `a single notification is read first then confirmed and a refusal gives the point back`() = runTest {
        val f = fixture(notification("n1"), notification("n2"))
        coEvery { f.api.markAsRead("n1") } throws IOException("offline")

        f.events.notificationReadRolledBack.test {
            assertThat(f.service.consume(NotificationReadScope.Single("n1"))).isFalse()
            assertThat(awaitItem()).isEqualTo(NotificationReadScope.Single("n1"))
        }

        assertThat(f.rows()).containsExactly("n1", false, "n2", false)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(2)
    }

    @Test
    fun `the echo of an own read does not decrement twice but a foreign echo does`() = runTest {
        val f = fixture(notification("n1"), notification("n2"), serverUnread = 5)
        coEvery { f.api.markAsRead("n1") } returns ApiResponse(success = true, data = notification("n1", isRead = true))

        f.service.consume(NotificationReadScope.Single("n1"))
        assertThat(f.repo.unreadCountStream.value).isEqualTo(4)

        f.service.onSocketRead("n1")
        assertThat(f.repo.unreadCountStream.value).isEqualTo(4)

        f.service.onSocketRead("n2")
        assertThat(f.repo.unreadCountStream.value).isEqualTo(3)
        assertThat(f.rows()).containsExactly("n1", true, "n2", true)
    }

    @Test
    fun `an own echo is foreign again once thirty seconds have passed`() = runTest {
        val f = fixture(notification("n1"), serverUnread = 3)
        coEvery { f.api.markAsRead("n1") } returns ApiResponse(success = true, data = notification("n1", isRead = true))
        f.service.consume(NotificationReadScope.Single("n1"))
        f.repo.prependLive(notification("n1"))
        f.repo.patch { rows -> rows.map { it.copy(state = it.state.copy(isRead = false)) } }
        f.clock.now += 30_000

        f.service.onSocketRead("n1")

        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `reading everything patches the cache and republishes`() = runTest {
        val f = fixture(notification("n1"), notification("n2"))
        coEvery { f.api.markAllAsRead() } returns MarkReadResponse(success = true, count = 2)

        f.events.allNotificationsRead.test {
            assertThat(f.service.consume(NotificationReadScope.All)).isTrue()
            awaitItem()
        }

        assertThat(f.rows()).containsExactly("n1", true, "n2", true)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(0)
    }

    @Test
    fun `a refused read all restores only the rows it flipped`() = runTest {
        val f = fixture(notification("n1"), notification("n2", isRead = true))
        coEvery { f.api.markAllAsRead() } throws IOException("offline")

        f.service.consume(NotificationReadScope.All)

        assertThat(f.rows()).containsExactly("n1", false, "n2", true)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `a category is read by types and published`() = runTest {
        val f = fixture(
            notification("f1", type = "friend_request"),
            notification("m1", type = "new_message"),
        )
        coEvery { f.api.markTypesAsRead(any()) } returns MarkReadResponse(success = true, count = 1)

        f.events.typeNotificationsRead.test {
            assertThat(f.service.consume(NotificationReadScope.Types(listOf("friend_request")))).isTrue()
            assertThat(awaitItem()).containsExactly("friend_request")
        }

        assertThat(f.rows()).containsExactly("f1", true, "m1", false)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `a refused category call restores its rows`() = runTest {
        val f = fixture(notification("f1", type = "friend_request"))
        coEvery { f.api.markTypesAsRead(any()) } throws IOException("offline")

        f.service.consume(NotificationReadScope.Types(listOf("friend_request")))

        assertThat(f.rows()).containsExactly("f1", false)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `an empty scope sends nothing`() = runTest {
        val f = fixture(notification("n1"))

        assertThat(f.service.consume(NotificationReadScope.Conversation(""))).isFalse()
        assertThat(f.service.consume(NotificationReadScope.Types(emptyList()))).isFalse()

        coVerify(exactly = 0) { f.api.markConversationAsRead(any()) }
        coVerify(exactly = 0) { f.api.markTypesAsRead(any()) }
    }

    @Test
    fun `a bulk read from another device applies and republishes`() = runTest {
        val f = fixture(notification("a1", conversationId = "A"), notification("b1", conversationId = "B"))
        val scope = NotificationReadBulkScope(kind = "context", contextKey = "conversationId", contextValue = "A")

        f.events.conversationNotificationsRead.test {
            f.service.onSocketReadBulk(scope)
            assertThat(awaitItem()).isEqualTo("A")
        }

        assertThat(f.rows()).containsExactly("a1", true, "b1", false)
    }

    @Test
    fun `a bulk scope this client cannot translate is ignored`() = runTest {
        val f = fixture(notification("a1", conversationId = "A"))

        f.events.allNotificationsRead.test {
            f.service.onSocketReadBulk(NotificationReadBulkScope(kind = "weird"))
            expectNoEvents()
        }

        assertThat(f.rows()).containsExactly("a1", false)
    }

    @Test
    fun `a deleted bulk of kind read purges the read rows`() = runTest {
        val f = fixture(notification("n1", isRead = true), notification("n2"))

        f.service.onSocketDeletedBulk(NotificationDeletedBulkScope(kind = "read"))
        f.service.onSocketDeletedBulk(NotificationDeletedBulkScope(kind = "other"))

        assertThat(f.rows()).containsExactly("n2", false)
    }

    @Test
    fun `a deleted notification is removed and published`() = runTest {
        val f = fixture(notification("n1"), notification("n2"))

        f.events.notificationWasDeleted.test {
            f.service.onSocketDeleted("n1")
            assertThat(awaitItem()).isEqualTo("n1")
        }

        assertThat(f.rows()).containsExactly("n2", false)
        assertThat(f.repo.unreadCountStream.value).isEqualTo(1)
    }
}
