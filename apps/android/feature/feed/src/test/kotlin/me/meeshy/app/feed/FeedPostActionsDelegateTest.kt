package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.report.ReportRepository
import org.junit.Test

/** #14827 — suppression, signalement et épinglage du menu d'une carte : retour immédiat, retour arrière à l'index. */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedPostActionsDelegateTest {

    private class Fixture(arrivals: List<ApiPost>) {
        val posts: PostRepository = mockk(relaxed = true)
        val reports: ReportRepository = mockk(relaxed = true)
        val head = MutableStateFlow(FeedRealtimeHead(posts = arrivals, newPostsCount = arrivals.size))
        val notices = mutableListOf<FeedNotice>()
        val delegate = FeedPostActionsDelegate(
            posts = posts,
            reports = reports,
            scope = TestScope(UnconfinedTestDispatcher()),
            head = head,
            notify = { notices += it },
        )
    }

    private fun post(id: String) = ApiPost(id = id, content = "Post $id")

    private fun fixture(vararg ids: String) = Fixture(ids.map(::post))

    @Test
    fun `delete retires the card before the network answers`() {
        val f = fixture("a", "b")
        val gate = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { f.posts.delete("a") } coAnswers { gate.await() }

        f.delegate.delete("a")

        assertThat(f.head.value.posts.map { it.id }).containsExactly("b")
        assertThat(f.head.value.removedIds).contains("a")
        assertThat(f.notices).isEmpty()
    }

    @Test
    fun `a delete the server accepted says so and refreshes`() {
        val f = fixture("a")
        coEvery { f.posts.delete("a") } returns NetworkResult.Success(Unit)

        f.delegate.delete("a")

        assertThat(f.notices).containsExactly(FeedNotice.DELETED)
        coVerify(exactly = 1) { f.posts.refresh() }
    }

    @Test
    fun `a refused delete puts the card back at its original index and says so`() {
        val f = fixture("a", "b", "c")
        coEvery { f.posts.delete("b") } returns NetworkResult.Failure(ApiError("down"))

        f.delegate.delete("b")

        assertThat(f.head.value.posts.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(f.head.value.removedIds).doesNotContain("b")
        assertThat(f.head.value.newPostsCount).isEqualTo(3)
        assertThat(f.notices).containsExactly(FeedNotice.DELETE_FAILED)
        coVerify(exactly = 0) { f.posts.refresh() }
    }

    @Test
    fun `a delete that throws is a failure, not a crash`() {
        val f = fixture("a")
        coEvery { f.posts.delete("a") } throws IllegalStateException("boom")

        f.delegate.delete("a")

        assertThat(f.notices).containsExactly(FeedNotice.DELETE_FAILED)
        assertThat(f.head.value.posts.map { it.id }).containsExactly("a")
    }

    @Test
    fun `report sends the chosen reason then confirms`() {
        val f = fixture()
        coEvery { f.reports.reportPost("p1", ReportReason.HARASSMENT, null) } returns NetworkResult.Success(Unit)

        f.delegate.report("p1", ReportReason.HARASSMENT)

        coVerify(exactly = 1) { f.reports.reportPost("p1", ReportReason.HARASSMENT, null) }
        assertThat(f.notices).containsExactly(FeedNotice.REPORTED)
    }

    @Test
    fun `a report the server refuses is told as a failure`() {
        val f = fixture()
        coEvery { f.reports.reportPost(any(), any(), any()) } returns NetworkResult.Failure(ApiError("x"))

        f.delegate.report("p1", ReportReason.SPAM)

        assertThat(f.notices).containsExactly(FeedNotice.REPORT_FAILED)
    }

    @Test
    fun `pin confirms with the pinned notice and refreshes so isPinned climbs back`() {
        val f = fixture()
        coEvery { f.posts.pinPost("p1") } returns NetworkResult.Success(Unit)

        f.delegate.pin("p1")

        assertThat(f.notices).containsExactly(FeedNotice.PINNED)
        coVerify(exactly = 1) { f.posts.refresh() }
    }

    @Test
    fun `a refused pin says so and does not refresh`() {
        val f = fixture()
        coEvery { f.posts.pinPost("p1") } returns NetworkResult.Failure(ApiError("x"))

        f.delegate.pin("p1")

        assertThat(f.notices).containsExactly(FeedNotice.PIN_FAILED)
        coVerify(exactly = 0) { f.posts.refresh() }
    }

    @Test
    fun `restoring a cache post only lifts its tombstone`() {
        val head = FeedRealtimeReducer.remove(FeedRealtimeHead(), "x")

        val restored = FeedRealtimeReducer.restore(head, "x", post = null, index = -1)

        assertThat(restored.removedIds).isEmpty()
        assertThat(restored.posts).isEmpty()
    }
}
