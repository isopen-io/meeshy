package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountClosedException
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.withAccountTicket
import org.junit.Test

/** #13584 — une page suivante ne se coud que sur le fil dont elle prolonge le curseur ; un geste d'un compte fermé ne se rabat sur rien. */
class PostFeedPaginationRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val api: PostApi = mockk(relaxed = true)
    private val repository = PostRepository(api, mockk(relaxed = true), mockk(relaxed = true), fence = fence)

    private fun page(posts: List<ApiPost>, next: String, hasMore: Boolean = true) =
        ApiResponse(success = true, data = posts, pagination = Pagination(nextCursor = next, hasMore = hasMore))

    private fun posts(vararg ids: String) = ids.map { ApiPost(id = it, content = it) }

    @Test
    fun `a next page requested before a refresh is not stitched onto the refreshed feed, which would hide the posts between`() = runTest {
        coEvery { api.getFeed(null, any()) } returns page(posts("p1", "p2", "p3"), next = "after-p3")
        repository.refresh()
        val answer = CompletableDeferred<ApiResponse<List<ApiPost>>>()
        coEvery { api.getFeed("after-p3", any()) } coAnswers { answer.await() }
        val loading = async { repository.loadMore() }
        runCurrent()

        coEvery { api.getFeed(null, any()) } returns page(posts("n1", "p1", "p2"), next = "after-p2")
        repository.refresh()
        answer.complete(page(posts("p4", "p5"), next = "after-p5"))
        loading.await()

        val ids = repository.feedCacheSnapshot!!.map { it.id }
        assertThat(ids.contains("p4") && !ids.contains("p3")).isFalse()
        coEvery { api.getFeed("after-p2", any()) } returns page(posts("p3", "p4"), next = "after-p4")
        repository.loadMore()
        coVerify { api.getFeed("after-p2", any()) }
    }

    @Test
    fun `a like tapped by an account closed since is refused loudly, so no caller falls back to an unfenced request`() = runTest {
        coEvery { api.getFeed(null, any()) } returns page(posts("p1"), next = "c")
        repository.refresh()
        val ticketOfA = fence.ticket()
        owner.id = null
        transition.bumpGeneration()
        fence.close { repository.clear() }
        owner.id = "B"
        transition.bumpGeneration()
        repository.refresh()

        val like = runCatching { withAccountTicket(ticketOfA) { repository.toggleLike("p1") } }
        val bookmark = runCatching { withAccountTicket(ticketOfA) { repository.toggleBookmark("p1") } }

        assertThat(like.exceptionOrNull()).isInstanceOf(AccountClosedException::class.java)
        assertThat(bookmark.exceptionOrNull()).isInstanceOf(AccountClosedException::class.java)
        assertThat(repository.cachedPost("p1")!!.isLikedByMe).isNotEqualTo(true)
        assertThat(repository.cachedPost("p1")!!.isBookmarkedByMe).isNotEqualTo(true)
    }
}
