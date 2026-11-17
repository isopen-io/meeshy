package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test

/**
 * #18915 (AND-05) — the silent re-read (foreground, reconnection, gap) runs outside the stream's `transformLatest`, so
 * nothing cancels it when the list moves under it. Its page, built BEFORE an arrival or a read made while it was in
 * flight, used to replace the list and the count wholesale: the mention that just arrived vanished from the bell, the
 * notification just read came back unread. What the server no longer serves is still replaced
 * (`NotificationRepositoryResyncTest`).
 */
class NotificationRepositoryFlightTest {

    private fun row(id: String, read: Boolean = false) =
        ApiNotification(id = id, state = NotificationState(isRead = read, createdAt = "2026-11-17T09:00:00.000Z"))

    /** A page the gateway holds until the test releases it, and the moment it was asked for. */
    private class HeldPage {
        val asked = CompletableDeferred<Unit>()
        val release = CompletableDeferred<List<ApiNotification>>()
    }

    private fun api(page: HeldPage, unread: Int): NotificationApi = mockk(relaxed = true) {
        coEvery { list(any(), any(), any(), any()) } coAnswers {
            page.asked.complete(Unit)
            ApiResponse(success = true, data = page.release.await())
        }
        coEvery { unreadCount() } returns UnreadCountResponse(success = true, count = unread)
        coEvery { markAsRead(any()) } answers { ApiResponse(success = true, data = row(firstArg(), read = true)) }
    }

    @Test
    fun `a notification arriving while the re-read waits for its page stays in the list and in the count`() = runTest {
        val page = HeldPage()
        val repo = NotificationRepository(api(page, unread = 1))
        repo.replaceAll(items = listOf(row("n1")))
        repo.setUnreadCount(1)

        val resync = async { repo.resync() }
        page.asked.await()
        repo.prependLive(row("n2"))
        page.release.complete(listOf(row("n1")))
        val failure = resync.await()

        assertThat(failure).isNull()
        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("n2", "n1").inOrder()
        assertThat(repo.unreadCountStream.value).isEqualTo(2)
    }

    @Test
    fun `a notification read while the re-read waits for its page stays read`() = runTest {
        val page = HeldPage()
        val repo = NotificationRepository(api(page, unread = 1))
        repo.replaceAll(items = listOf(row("n1"), row("n0", read = true)))
        repo.setUnreadCount(1)

        val resync = async { repo.resync() }
        page.asked.await()
        repo.markAsRead("n1")
        page.release.complete(listOf(row("n1"), row("n0", read = true)))
        resync.await()

        val landed = repo.cachedItems(NotificationScope.All).orEmpty()
        assertThat(landed.map { it.id to it.state.isRead }).containsExactly("n1" to true, "n0" to true).inOrder()
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    /** `notification:counts` during the flight (#18908): the server's newer count stays over the one the page serves. */
    @Test
    fun `a count the server pushes while the re-read waits for its page stays over the one it serves`() = runTest {
        val page = HeldPage()
        val repo = NotificationRepository(api(page, unread = 3))
        repo.replaceAll(items = listOf(row("n1")))
        repo.setUnreadCount(1)

        val resync = async { repo.resync() }
        page.asked.await()
        repo.applyCounts(5)
        page.release.complete(listOf(row("n1")))
        resync.await()

        assertThat(repo.unreadCountStream.value).isEqualTo(5)
    }

    /** The list fails, the count was read before an arrival during the flight (#18908): the live count already holds it. */
    @Test
    fun `a failed re-read leaves the count a live arrival moved during its flight`() = runTest {
        val page = HeldPage()
        val repo = NotificationRepository(api(page, unread = 1))
        repo.replaceAll(items = listOf(row("n1")))
        repo.setUnreadCount(1)

        val resync = async { repo.resync() }
        page.asked.await()
        repo.prependLive(row("n2"))
        page.release.completeExceptionally(IOException("offline"))
        resync.await()

        assertThat(repo.unreadCountStream.value).isEqualTo(2)
    }

    /** A deletion the socket brought while the re-read waited came back with the page built before it. */
    @Test
    fun `a notification deleted from the socket while the re-read waits for its page stays deleted`() = runTest {
        val page = HeldPage()
        val repo = NotificationRepository(api(page, unread = 2))
        repo.replaceAll(items = listOf(row("n1"), row("n2")))
        repo.setUnreadCount(2)

        val resync = async { repo.resync() }
        page.asked.await()
        repo.applyDeleted("n2")
        page.release.complete(listOf(row("n1"), row("n2")))
        resync.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("n1")
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }

    @Test
    fun `a notification I delete while the re-read waits for its page stays deleted`() = runTest {
        val page = HeldPage()
        val api = api(page, unread = 2)
        coEvery { api.delete("n2") } returns ApiResponse(success = true, data = Unit)
        val repo = NotificationRepository(api)
        repo.replaceAll(items = listOf(row("n1"), row("n2")))
        repo.setUnreadCount(2)

        val resync = async { repo.resync() }
        page.asked.await()
        repo.delete("n2")
        page.release.complete(listOf(row("n1"), row("n2")))
        resync.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("n1")
        assertThat(repo.unreadCountStream.value).isEqualTo(1)
    }

    /** The boundary of the two above: a deletion refused and rolled back during the flight keeps the row it served. */
    @Test
    fun `a deletion refused while the re-read waits for its page keeps the row`() = runTest {
        val page = HeldPage()
        val api = api(page, unread = 2)
        coEvery { api.delete("n2") } throws IOException("offline")
        val repo = NotificationRepository(api)
        repo.replaceAll(items = listOf(row("n1"), row("n2")))
        repo.setUnreadCount(2)

        val resync = async { repo.resync() }
        page.asked.await()
        repo.delete("n2")
        page.release.complete(listOf(row("n1"), row("n2")))
        resync.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("n1", "n2").inOrder()
        assertThat(repo.unreadCountStream.value).isEqualTo(2)
    }

    // — the account that left (#18915, F6): the repository is a singleton that outlives it —

    /**
     * A re-read A started before signing out lands after [NotificationRepository.clear], over the list B already holds:
     * neither A's page nor A's count may land there — B's own re-read brings B's.
     */
    @Test
    fun `a re-read of the account that left lands nothing over the next account's list`() = runTest {
        val page = HeldPage()
        val repo = NotificationRepository(api(page, unread = 5))
        repo.replaceAll(items = listOf(row("a1")))
        repo.setUnreadCount(1)

        val resyncOfA = async { repo.resync() }
        page.asked.await()
        repo.clear()
        repo.replaceAll(items = listOf(row("b1", read = true)))
        page.release.complete(listOf(row("a1"), row("a2")))
        resyncOfA.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("b1")
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    @Test
    fun `a failed re-read of the account that left leaves the next account's count alone`() = runTest {
        val page = HeldPage()
        val repo = NotificationRepository(api(page, unread = 7))
        repo.replaceAll(items = listOf(row("a1")))
        repo.setUnreadCount(1)

        val resyncOfA = async { repo.resync() }
        page.asked.await()
        repo.clear()
        repo.setUnreadCount(2)
        page.release.completeExceptionally(IOException("offline"))
        resyncOfA.await()

        assertThat(repo.unreadCountStream.value).isEqualTo(2)
    }

    /**
     * A deletion A asked before signing out is refused after [NotificationRepository.clear]: its rollback used to rebuild
     * a one-row list of A's notification — persisted, then shown to B at the next cold start — and to give A's unread
     * back to B's count. Nothing of it lands.
     */
    @Test
    fun `a deletion of the account that left refused after clear puts nothing back`() = runTest {
        val asked = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api: NotificationApi = mockk(relaxed = true) {
            coEvery { delete("a1") } coAnswers {
                asked.complete(Unit)
                release.await()
                throw IOException("offline")
            }
        }
        val repo = NotificationRepository(api)
        repo.replaceAll(items = listOf(row("a1"), row("a2")))
        repo.setUnreadCount(2)

        val deleting = async { repo.delete("a1") }
        asked.await()
        repo.clear()
        release.complete(Unit)
        deleting.await()

        assertThat(repo.cachedItems(NotificationScope.All)).isNull()
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }

    /**
     * The first frame reads A's list from the disk; A signs out while that read waits. Landing after
     * [NotificationRepository.clear], it used to pose A's list and A's count for B — and to mark the repository hydrated,
     * so B never read its own disk. Nothing of it lands.
     */
    @Test
    fun `a disk read of the account that left lands nothing after clear`() = runTest {
        val reading = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val store = object : NotificationCacheStore {
            override suspend fun read(): PersistedNotifications? {
                reading.complete(Unit)
                release.await()
                return PersistedNotifications(listOf(row("a1")), nextCursor = null, hasMore = false, unreadCount = 3, syncedAt = null)
            }

            override suspend fun write(snapshot: PersistedNotifications, stillValid: () -> Boolean) = Unit
        }
        val repo = NotificationRepository(mockk(relaxed = true), store = store)

        val opening = async { repo.notificationsStream().first() }
        reading.await()
        repo.clear()
        release.complete(Unit)
        opening.await()

        assertThat(repo.cachedItems(NotificationScope.All)).isNull()
        assertThat(repo.unreadCountStream.value).isEqualTo(0)
    }
}
