package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NotificationCachePatch
import me.meeshy.sdk.model.NotificationState
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.UnreadCountResponse
import me.meeshy.sdk.net.api.NotificationApi
import org.junit.Test

/**
 * #18915 (F7) — the « all » list has several writers: the socket (arrivals, reads, deletions), the gestures, the
 * re-read and the next page. Each composes its write from the list it reads; when one reads and writes outside the
 * section the others hold, the other's write between the two is lost. Every writer composes from the LIVE list, in
 * the same section.
 */
class NotificationRepositoryWriterRaceTest {

    private fun row(id: String, read: Boolean = false) =
        ApiNotification(id = id, state = NotificationState(isRead = read, createdAt = "2026-11-17T09:00:00.000Z"))

    /** Starts [write] on its own thread and returns once it is done, or waiting for the list another writer holds. */
    private fun writtenAside(write: () -> Unit): Thread = thread { write() }.also { writer ->
        while (writer.state !in SETTLED) Thread.onSpinWait()
    }

    @Test
    fun `a deletion from the socket landing while a read is posed on the list is not lost`() {
        val repo = NotificationRepository(mockk(relaxed = true))
        repo.replaceAll(items = listOf(row("n1"), row("n2")))
        val posing = CountDownLatch(1)
        val release = CountDownLatch(1)
        val read = thread {
            repo.patchEverywhere { list ->
                posing.countDown()
                release.await(5, TimeUnit.SECONDS)
                NotificationCachePatch.markingRead(list, "n1")
            }
        }
        posing.await(5, TimeUnit.SECONDS)

        val deletion = writtenAside { repo.applyDeleted("n2") }
        release.countDown()
        read.join(5_000)
        deletion.join(5_000)

        val landed = repo.cachedItems(NotificationScope.All).orEmpty()
        assertThat(landed.map { it.id to it.state.isRead }).containsExactly("n1" to true)
    }

    @Test
    fun `a notification arriving while the next page loads stays at the head of the list`() = runTest {
        val asked = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api: NotificationApi = mockk(relaxed = true) {
            coEvery { list(any(), any(), any(), "after-n2") } coAnswers {
                asked.complete(Unit)
                release.await()
                ApiResponse(success = true, data = listOf(row("n3")), pagination = Pagination(hasMore = false))
            }
        }
        val repo = NotificationRepository(api)
        repo.replaceAll(items = listOf(row("n1"), row("n2")), hasMore = true, nextCursor = "after-n2")

        val paging = async { repo.loadMore() }
        asked.await()
        repo.prependLive(row("n0"))
        release.complete(Unit)
        paging.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id })
            .containsExactly("n0", "n1", "n2", "n3").inOrder()
        assertThat(repo.hasMoreStream.value).isFalse()
    }

    /** The next page of the account that left continues ITS list: it lands nothing over the next account's. */
    @Test
    fun `a next page of the account that left lands nothing over the next account's list`() = runTest {
        val asked = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api: NotificationApi = mockk(relaxed = true) {
            coEvery { list(any(), any(), any(), "after-a2") } coAnswers {
                asked.complete(Unit)
                release.await()
                ApiResponse(success = true, data = listOf(row("a3")), pagination = Pagination(hasMore = false))
            }
        }
        val repo = NotificationRepository(api)
        repo.replaceAll(items = listOf(row("a1"), row("a2")), hasMore = true, nextCursor = "after-a2")

        val paging = async { repo.loadMore() }
        asked.await()
        repo.clear()
        repo.replaceAll(items = listOf(row("b1")), hasMore = true, nextCursor = "after-b1")
        release.complete(Unit)
        paging.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("b1")
        assertThat(repo.hasMoreStream.value).isTrue()
    }

    /**
     * A re-read replaced the list while the next page was in flight: that page continued a list that is gone. Laid at
     * the tail of the new one, it left a hole (n3, n4) until the following re-read. It lands nothing: the next scroll
     * asks from the new list's end.
     */
    @Test
    fun `a next page asked before a re-read replaced the list leaves no hole in it`() = runTest {
        val asked = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api: NotificationApi = mockk(relaxed = true) {
            coEvery { list(any(), any(), any(), "after-n4") } coAnswers {
                asked.complete(Unit)
                release.await()
                ApiResponse(success = true, data = listOf(row("n5"), row("n6")), pagination = Pagination(hasMore = true, nextCursor = "after-n6"))
            }
            coEvery { list(0, any(), null, null) } returns
                ApiResponse(success = true, data = listOf(row("n1"), row("n2")), pagination = Pagination(hasMore = true, nextCursor = "after-n2"))
            coEvery { unreadCount() } returns UnreadCountResponse(success = true, count = 0)
        }
        val repo = NotificationRepository(api)
        repo.replaceAll(items = listOf(row("n1"), row("n2"), row("n3"), row("n4")), hasMore = true, nextCursor = "after-n4")

        val paging = async { repo.loadMore() }
        asked.await()
        repo.refresh()
        release.complete(Unit)
        paging.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("n1", "n2").inOrder()
        assertThat(repo.hasMoreStream.value).isTrue()
    }

    /** The same hole by rank (a gateway that serves no cursor): the page continued a list four rows long. */
    @Test
    fun `by rank, a next page asked before a re-read replaced the list leaves no hole in it`() = runTest {
        val asked = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val api: NotificationApi = mockk(relaxed = true) {
            coEvery { list(4, any(), any(), null) } coAnswers {
                asked.complete(Unit)
                release.await()
                ApiResponse(success = true, data = listOf(row("n5"), row("n6")), pagination = Pagination(hasMore = true))
            }
            coEvery { list(0, any(), null, null) } returns
                ApiResponse(success = true, data = listOf(row("n1"), row("n2")), pagination = Pagination(hasMore = true))
            coEvery { unreadCount() } returns UnreadCountResponse(success = true, count = 0)
        }
        val repo = NotificationRepository(api)
        repo.replaceAll(items = listOf(row("n1"), row("n2"), row("n3"), row("n4")), hasMore = true)

        val paging = async { repo.loadMore() }
        asked.await()
        repo.refresh()
        release.complete(Unit)
        paging.await()

        assertThat(repo.cachedItems(NotificationScope.All).orEmpty().map { it.id }).containsExactly("n1", "n2").inOrder()
    }

    private companion object {
        val SETTLED = setOf(Thread.State.BLOCKED, Thread.State.WAITING, Thread.State.TERMINATED)
    }
}
