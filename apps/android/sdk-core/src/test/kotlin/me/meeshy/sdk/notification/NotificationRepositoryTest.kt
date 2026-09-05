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
import me.meeshy.sdk.model.NotificationContext
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

    private fun notification(
        id: String,
        isRead: Boolean = false,
        type: String = "new_message",
        conversationId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
        state = NotificationState(isRead = isRead, createdAt = "2026-08-17T00:00:00.000Z"),
        context = conversationId?.let { NotificationContext(conversationId = it) },
    )

    private fun List<ApiNotification>.get(id: String) = first { it.id == id }

    private fun CacheResult<List<ApiNotification>>.notifications(): List<ApiNotification> =
        (this as? CacheResult.Fresh)?.value ?: (this as CacheResult.Stale).value

    private suspend fun seed(vararg items: ApiNotification, unread: Int = items.count { !it.state.isRead }): NotificationRepository {
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = items.toList())
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = unread)
        val repo = NotificationRepository(api)
        repo.refresh()
        return repo
    }

    @Test
    fun notificationsStream_emitsEmptyThenFreshOnFirstCollection() = runTest {
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = true, data = listOf(notification("n1")))
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

    // --- Targeted rollback (realtime-data correctif) — a whole-snapshot rollback would clobber
    // any server-confirmed arrival landing on the shared cache while the failing call is in
    // flight; these pin the rollback to the single id/predicate the failed call itself owns. ---

    @Test
    fun markAsRead_rollbackDoesNotClobberANotificationThatArrivedWhileTheCallWasInFlight() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)
        coEvery { api.markAsRead("n1") } coAnswers {
            repo.prependLive(notification("n11", isRead = false))
            throw IOException("offline")
        }

        repo.markAsRead("n1")

        repo.notificationsStream().test {
            val items = awaitItem().notifications()
            assertThat(items.map { it.id }).containsExactly("n11", "n1")
            assertThat(items.get("n1").state.isRead).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(repo.unreadCountStream.value).isEqualTo(2)
    }

    @Test
    fun delete_rollbackDoesNotResurrectARowDeletedByAnotherDeviceWhileTheCallWasInFlight() = runTest {
        val repo = seed(notification("n1", isRead = false), notification("n2", isRead = false), unread = 2)
        coEvery { api.delete("n1") } coAnswers {
            repo.applyDeleted("n2")
            throw IOException("offline")
        }

        repo.delete("n1")

        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun markAllAsRead_rollbackDoesNotRevertARowDeletedWhileTheCallWasInFlight() = runTest {
        val repo = seed(notification("n1", isRead = false), notification("n2", isRead = false), unread = 2)
        coEvery { api.markAllAsRead() } coAnswers {
            repo.applyDeleted("n2")
            throw IOException("offline")
        }

        repo.markAllAsRead()

        repo.notificationsStream().test {
            val items = awaitItem().notifications()
            assertThat(items.map { it.id }).containsExactly("n1")
            assertThat(items.get("n1").state.isRead).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
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

    // --- Notification sync family (issue notif-sync) — realtime apply* from the socket ---

    @Test
    fun applyRead_flipsTheRowAndDecrementsUnreadCount() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)

        repo.applyRead("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().get("n1").state.isRead).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun applyRead_onAnAlreadyReadRowIsANoOp() = runTest {
        // Covers the echo of this device's OWN markAsRead: the optimistic mutation already
        // landed, so the socket echo must not double-decrement unreadCountStream.
        val repo = seed(notification("n1", isRead = true), unread = 0)

        repo.applyRead("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    @Test
    fun applyRead_forAnIdOutsideTheCacheIsANoOp() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)

        repo.applyRead("missing")

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun applyReadBulk_withAnAllScopeMarksEveryUnreadRow() = runTest {
        val repo = seed(notification("n1", isRead = false), notification("n2", isRead = false), unread = 2)

        repo.applyReadBulk(NotificationReadBulkScope(kind = "all"))

        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().all { it.state.isRead }).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun applyReadBulk_withAContextScopeMarksOnlyTheMatchingConversation() = runTest {
        val repo = seed(
            notification("n1", isRead = false, conversationId = "c1"),
            notification("n2", isRead = false, conversationId = "c2"),
            unread = 2,
        )

        repo.applyReadBulk(NotificationReadBulkScope(kind = "context", contextKey = "conversationId", contextValue = "c1"))

        repo.notificationsStream().test {
            val items = awaitItem().notifications()
            assertThat(items.get("n1").state.isRead).isTrue()
            assertThat(items.get("n2").state.isRead).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun applyReadBulk_neverTouchesUnreadCountStream() = runTest {
        // The cache is a PARTIAL (paginated) view — decrementing from a bulk predicate would
        // make the badge drift. notification:counts, emitted right after, is authoritative.
        val repo = seed(notification("n1", isRead = false), unread = 1)

        repo.applyReadBulk(NotificationReadBulkScope(kind = "all"))

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun applyDeleted_removesTheRowAndDecrementsUnreadCountForAnUnreadNotification() = runTest {
        val repo = seed(notification("n1", isRead = false), notification("n2", isRead = true), unread = 1)

        repo.applyDeleted("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n2")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun applyDeleted_forAnAlreadyReadNotificationLeavesUnreadCountUntouched() = runTest {
        val repo = seed(notification("n1", isRead = true), unread = 0)

        repo.applyDeleted("n1")

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    @Test
    fun applyDeleted_forAnIdOutsideTheCacheIsANoOp() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)

        repo.applyDeleted("missing")

        assertThat(repo.unreadCountStream.value).isEqualTo(1)
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun applyDeletedBulk_removesOnlyAlreadyReadRows() = runTest {
        val repo = seed(notification("n1", isRead = true), notification("n2", isRead = false), unread = 1)

        repo.applyDeletedBulk(NotificationDeletedBulkScope(kind = "read"))

        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id }).containsExactly("n2")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun applyDeletedBulk_neverTouchesUnreadCountStream() = runTest {
        // A consequence of the predicate, not a precaution: every purged row was already read,
        // so it was never counted in unread.
        val repo = seed(notification("n1", isRead = true), unread = 0)

        repo.applyDeletedBulk(NotificationDeletedBulkScope(kind = "read"))

        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    @Test
    fun applyCounts_setsUnreadCountStreamToTheServerValue() = runTest {
        val repo = seed(notification("n1", isRead = false), unread = 1)

        repo.applyCounts(unread = 7)

        assertThat(repo.unreadCountStream.value).isEqualTo(7)
    }

    /**
     * LA PAIRE DU SERVEUR, portée côté client (#4901) — la jumelle de
     * `NotificationCursorPaginationTests` (iOS) : la même collection VIVANTE
     * mutée entre deux pages. Au CURSEUR, l'union est propre — l'ancre servie
     * est empruntée VERBATIM, aucune ligne sautée ni dupliquée. Au RANG
     * (gateway antérieur, aucun `nextCursor` servi), l'insertion en tête fait
     * resservir n3 — et ce doublon est CONSERVÉ : c'est le SIGNAL que le
     * `filterNot` supprimait en le supprimant.
     */
    @Test
    fun loadMore_empruntesLeCurseurServiVerbatim_etLUnionEstPropre() = runTest {
        val premierePage = listOf(notification("n1"), notification("n2"), notification("n3"))
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(
            success = true,
            data = premierePage,
            pagination = Pagination(limit = 3, hasMore = true, nextCursor = "ancre-n3"),
        )
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 3)
        val repo = NotificationRepository(api)
        repo.refresh()

        // La collection VIT : n0 s'insère en tête entre les deux pages.
        coEvery { api.list(any(), any(), any(), "ancre-n3") } returns ApiResponse(
            success = true,
            data = listOf(notification("n4"), notification("n5")),
            pagination = Pagination(limit = 3, hasMore = false, nextCursor = "ancre-n5"),
        )
        repo.prependLive(notification("n0"))
        repo.loadMore()

        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id })
                .containsExactly("n0", "n1", "n2", "n3", "n4", "n5")
            cancelAndIgnoreRemainingEvents()
        }
        // L'ancre est passée VERBATIM à l'API — le mock qui ignorerait le
        // `where` ne testerait pas la requête.
        coVerify(exactly = 1) { api.list(null, any(), any(), "ancre-n3") }
    }

    @Test
    fun loadMore_sansCurseurServi_repliAuRang_etLeDoublonResteVisible() = runTest {
        val premierePage = listOf(notification("n1"), notification("n2"), notification("n3"))
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(
            success = true,
            data = premierePage,
            pagination = Pagination(limit = 3, hasMore = true, nextCursor = null),
        )
        coEvery { api.unreadCount() } returns UnreadCountResponse(success = true, count = 3)
        val repo = NotificationRepository(api)
        repo.refresh()

        // n0 s'insère en tête ; la tranche par RANG (offset = 4) resservira n3.
        repo.prependLive(notification("n0"))
        coEvery { api.list(4, any(), any(), null) } returns ApiResponse(
            success = true,
            data = listOf(notification("n3"), notification("n4")),
            pagination = Pagination(limit = 3, hasMore = false, nextCursor = null),
        )
        repo.loadMore()

        // Le doublon n3 est LÀ, visible — le signal d'une tranche par rang sur
        // une collection vivante. Le masquer (filterNot) cachait la ligne
        // PERDUE du cas symétrique (une suppression entre deux pages).
        repo.notificationsStream().test {
            assertThat(awaitItem().notifications().map { it.id })
                .containsExactly("n0", "n1", "n2", "n3", "n3", "n4")
            cancelAndIgnoreRemainingEvents()
        }
    }

}
