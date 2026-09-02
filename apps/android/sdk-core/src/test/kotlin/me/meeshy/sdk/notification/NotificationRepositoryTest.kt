package me.meeshy.sdk.notification

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MarkReadResponse
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test
import java.io.IOException

/**
 * Cache-first notification stream (feature-parity §M) — mirrors PostRepositoryTest's
 * established pattern for [me.meeshy.sdk.post.PostRepository.feedStream].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationRepositoryTest {

    private val api: NotificationApi = mockk(relaxed = true)

    private fun notification(id: String, isRead: Boolean = false) = ApiNotification(
        id = id,
        state = NotificationState(isRead = isRead, createdAt = "2026-08-17T00:00:00.000Z"),
    )

    private fun List<ApiNotification>.get(id: String) = first { it.id == id }

    private fun CacheResult<List<ApiNotification>>.notifications(): List<ApiNotification> =
        (this as? CacheResult.Fresh)?.value ?: (this as CacheResult.Stale).value

    private suspend fun seed(vararg items: ApiNotification, unread: Int = items.count { !it.state.isRead }): NotificationRepository {
        coEvery { api.list(any(), any(), any()) } returns ApiResponse(success = true, data = items.toList())
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = unread)
        val repo = NotificationRepository(api)
        repo.refresh()
        return repo
    }

    @Test
    fun notificationsStream_emitsEmptyThenFreshOnFirstCollection() = runTest {
        coEvery { api.list(any(), any(), any()) } returns ApiResponse(success = true, data = listOf(notification("n1")))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 1)
        val repo = NotificationRepository(api)

        repo.notificationsStream().test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            val fresh = awaitItem()
            assertThat((fresh as CacheResult.Fresh).value.map { it.id }).containsExactly("n1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun refresh_populatesTheCacheAndTheUnreadCount() = runTest {
        val repo = seed(notification("n1", isRead = false), notification("n2", isRead = true), unread = 1)

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n1", "n2")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun clear_resetsTheCacheAndTheUnreadCountToTheirColdStartState() = runTest {
        val repo = seed(notification("n1", isRead = false), notification("n2", isRead = true), unread = 1)
        assertThat(repo.unreadCountStream.value).isEqualTo(1)

        repo.clear()

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
        assertThat(repo.hasMoreStream.value).isFalse()
        repo.notificationsStream().test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun prependLive_addsTheFreshNotificationAndBumpsUnreadCount() = runTest {
        val repo = seed(notification("old"), unread = 0)

        repo.prependLive(notification("fresh", isRead = false))

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("fresh", "old").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun prependLive_thatArrivesAlreadyReadDoesNotBumpUnreadCount() = runTest {
        val repo = seed(unread = 0)

        repo.prependLive(notification("fresh", isRead = true))

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    @Test
    fun prependLive_withADuplicateIdIsANoOp() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)

        repo.prependLive(notification("n1", isRead = false))

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications()).hasSize(1)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun markAsRead_flipsOptimisticallyAndDecrementsUnreadCount() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)
        coEvery { api.markAsRead("n1") } returns ApiResponse(success = true, data = notification("n1", isRead = true))

        repo.markAsRead("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().get("n1").state.isRead).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.markAsRead("n1") }
    }

    @Test
    fun markAsRead_rollsBackOnFailure() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)
        coEvery { api.markAsRead("n1") } throws IOException("offline")

        repo.markAsRead("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().get("n1").state.isRead).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun markAllAsRead_flipsEveryEntryOptimisticallyAndZeroesUnreadCount() = runTest {
        val repo = seed(notification("n1", isRead = false), notification("n2", isRead = false), unread = 2)
        coEvery { api.markAllAsRead() } returns MarkReadResponse(success = true, count = 2)

        repo.markAllAsRead()

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
        repo.notificationsStream().test {
            val items = awaitItem().notifications()
            assertThat(items.all { it.state.isRead }).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    // --- Delete (feature-parity §M — swipe-to-delete, port of iOS NotificationRowView's
    // trailing swipe / NotificationListViewModel.deleteNotification) ---

    @Test
    fun delete_removesOptimisticallyAndDecrementsUnreadCountForAnUnreadNotification() = runTest {
        val repo = seed(notification("n1", isRead = false), notification("n2", isRead = true), unread = 1)
        coEvery { api.delete("n1") } returns ApiResponse(success = true, data = Unit)

        repo.delete("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n2")
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.delete("n1") }
    }

    @Test
    fun delete_removesOptimisticallyWithoutTouchingUnreadCountForAnAlreadyReadNotification() = runTest {
        val repo = seed(notification("n1", isRead = true), notification("n2", isRead = false), unread = 1)
        coEvery { api.delete("n1") } returns ApiResponse(success = true, data = Unit)

        repo.delete("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n2")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun delete_rollsBackOnFailure() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)
        coEvery { api.delete("n1") } throws IOException("offline")

        repo.delete("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun markAllAsRead_rollsBackOnFailure() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)
        coEvery { api.markAllAsRead() } throws IOException("offline")

        repo.markAllAsRead()

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().get("n1").state.isRead).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    // --- Pagination (feature-parity §M "still open" — port of iOS NotificationListViewModel.loadMore) ---

    @Test
    fun loadMore_appendsTheNextPageAfterTheCurrentCache() = runTest {
        coEvery { api.list(0, any(), any()) } returns
            ApiResponse(success = true, data = listOf(notification("n1")), pagination = Pagination(hasMore = true))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 1)
        val repo = NotificationRepository(api)
        repo.refresh()
        coEvery { api.list(1, any(), any()) } returns
            ApiResponse(success = true, data = listOf(notification("n2")), pagination = Pagination(hasMore = false))

        repo.loadMore()

        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n1", "n2").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.list(1, any(), any()) }
    }

    @Test
    fun loadMore_dedupesAlreadyKnownNotifications() = runTest {
        coEvery { api.list(0, any(), any()) } returns
            ApiResponse(success = true, data = listOf(notification("n1")), pagination = Pagination(hasMore = true))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 1)
        val repo = NotificationRepository(api)
        repo.refresh()
        coEvery { api.list(1, any(), any()) } returns
            ApiResponse(success = true, data = listOf(notification("n1")), pagination = Pagination(hasMore = false))

        repo.loadMore()

        repo.notificationsStream().test {
            assertThat(awaitItem().notifications()).hasSize(1)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun loadMore_setsHasMoreFalseWhenTheServerSaysSo() = runTest {
        coEvery { api.list(0, any(), any()) } returns
            ApiResponse(success = true, data = listOf(notification("n1")), pagination = Pagination(hasMore = true))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 1)
        val repo = NotificationRepository(api)
        repo.refresh()
        assertThat(repo.hasMoreStream.value).isTrue()
        coEvery { api.list(1, any(), any()) } returns
            ApiResponse(success = true, data = emptyList(), pagination = Pagination(hasMore = false))

        repo.loadMore()

        assertThat(repo.hasMoreStream.value).isFalse()
    }

    @Test
    fun loadMore_isANoOpBeforeAnyPageHasLoaded() = runTest {
        val repo = NotificationRepository(api)

        repo.loadMore()

        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test
    fun loadMore_isANoOpWhenTheServerReportedNoFurtherPages() = runTest {
        val repo = seed(notification("n1"), unread = 0) // seed()'s stub carries no pagination -> hasMore false

        repo.loadMore()

        coVerify(exactly = 1) { api.list(any(), any(), any()) } // only the initial refresh() call
    }

    @Test
    fun loadMore_leavesTheCacheAndHasMoreUnchangedOnFailure() = runTest {
        coEvery { api.list(0, any(), any()) } returns
            ApiResponse(success = true, data = listOf(notification("n1")), pagination = Pagination(hasMore = true))
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 1)
        val repo = NotificationRepository(api)
        repo.refresh()
        coEvery { api.list(1, any(), any()) } throws IOException("offline")

        repo.loadMore()

        assertThat(repo.hasMoreStream.value).isTrue()
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n1")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
