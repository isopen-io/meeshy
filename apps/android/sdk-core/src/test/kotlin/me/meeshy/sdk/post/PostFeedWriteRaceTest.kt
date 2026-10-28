package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.withAccountTicket
import org.junit.Test

/** #13584 — les écritures locales du fil lisent la ligne COURANTE au moment d'écrire et restent sous le compte du geste. */
class PostFeedWriteRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val api: PostApi = mockk(relaxed = true)
    private val repository = PostRepository(api, mockk(relaxed = true), mockk(relaxed = true), fence = fence)

    private fun page(posts: List<ApiPost>, hasMore: Boolean) =
        ApiResponse(success = true, data = posts, pagination = Pagination(nextCursor = "c", hasMore = hasMore))

    private suspend fun seed(vararg posts: ApiPost) {
        coEvery { api.getFeed(null, any()) } returns page(posts.toList(), hasMore = true)
        repository.refresh()
    }

    @Test
    fun `a like set while the next page loads survives the page`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 0))
        val answer = CompletableDeferred<ApiResponse<List<ApiPost>>>()
        coEvery { api.getFeed("c", any()) } coAnswers { answer.await() }
        val loading = async { repository.loadMore() }
        runCurrent()

        repository.toggleLike("p1")
        answer.complete(page(listOf(ApiPost(id = "p2", content = "b")), hasMore = false))
        loading.await()

        assertThat(repository.cachedPost("p1")!!.isLikedByMe).isTrue()
        assertThat(repository.cachedPost("p2")).isNotNull()
    }

    @Test
    fun `a post edit received while the next page loads survives the page`() = runTest {
        seed(ApiPost(id = "p1", content = "avant"))
        val answer = CompletableDeferred<ApiResponse<List<ApiPost>>>()
        coEvery { api.getFeed("c", any()) } coAnswers { answer.await() }
        val loading = async { repository.loadMore() }
        runCurrent()

        repository.applyPostUpdate(ApiPost(id = "p1", content = "après"))
        answer.complete(page(listOf(ApiPost(id = "p2", content = "b")), hasMore = false))
        loading.await()

        assertThat(repository.cachedPost("p1")!!.content).isEqualTo("après")
    }

    @Test
    fun `a like tapped by A and written after B was adopted is not written`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 0))
        val ticketOfA = fence.ticket()

        owner.id = null
        transition.bumpGeneration()
        fence.close { repository.clear() }
        owner.id = "B"
        transition.bumpGeneration()
        coEvery { api.getFeed(null, any()) } returns page(listOf(ApiPost(id = "p1", content = "a", likeCount = 0)), hasMore = true)
        repository.refresh()

        val done = withAccountTicket(ticketOfA) { repository.toggleLike("p1") }

        assertThat(done).isFalse()
        assertThat(repository.cachedPost("p1")!!.isLikedByMe).isNotEqualTo(true)
    }

    @Test
    fun `a rollback of A's like landing after B was adopted does not touch B's copy`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 1, isLikedByMe = true))
        val ticketOfA = fence.ticket()

        owner.id = null
        transition.bumpGeneration()
        fence.close { repository.clear() }
        owner.id = "B"
        transition.bumpGeneration()
        coEvery { api.getFeed(null, any()) } returns
            page(listOf(ApiPost(id = "p1", content = "a", likeCount = 1, isLikedByMe = true)), hasMore = true)
        repository.refresh()

        withAccountTicket(ticketOfA) { repository.rollbackLike("p1", liked = false) }

        assertThat(repository.cachedPost("p1")!!.isLikedByMe).isTrue()
        assertThat(repository.cachedPost("p1")!!.likeCount).isEqualTo(1)
    }

    @Test
    fun `likes and bookmarks written concurrently off the main thread are all kept`() = runTest {
        seed(*(1..40).map { ApiPost(id = "p$it", content = "c", likeCount = 0) }.toTypedArray())

        withContext(Dispatchers.Default) {
            (1..40).map { n ->
                async {
                    repository.toggleLike("p$n")
                    repository.toggleBookmark("p$n")
                }
            }.awaitAll()
        }

        (1..40).forEach {
            val post = repository.cachedPost("p$it")!!
            assertThat(post.isLikedByMe).isTrue()
            assertThat(post.isBookmarkedByMe).isTrue()
        }
    }
}
