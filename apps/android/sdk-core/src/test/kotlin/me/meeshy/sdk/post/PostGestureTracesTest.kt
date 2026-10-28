package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import org.junit.Test

/** #13594 — UNE trace par ligne de la file d'envoi : plusieurs gestes en vol sur un même post, chaque refus vise SON geste. */
class PostGestureTracesTest {

    private val api: PostApi = mockk(relaxed = true)
    private val queued = mutableListOf<OutboxMutation>()
    private val outbox: OutboxRepository = mockk(relaxed = true) {
        coEvery { enqueue(any(), any()) } answers { firstArg<OutboxMutation>().also { queued += it }.cmid }
        coEvery { stateOf(any()) } returns OutboxState.PENDING
    }
    private val repository = PostRepository(api, mockk(relaxed = true), outbox)

    private suspend fun seed(post: ApiPost) {
        coEvery { api.getFeed(null, any()) } returns
            ApiResponse(success = true, data = listOf(post), pagination = Pagination(nextCursor = null, hasMore = false))
        repository.refresh()
    }

    private fun liked() = repository.cachedPost("p1")!!.isLikedByMe == true
    private fun count() = repository.cachedPost("p1")!!.likeCount

    @Test
    fun `each queued gesture is traced under its own row`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = false))
        repository.toggleLike("p1")
        repository.toggleLike("p1")

        assertThat(queued.map { it.cmid }.distinct()).hasSize(2)
    }

    @Test
    fun `a refused like followed by a queued unlike changes nothing, and the unlike's own refusal does not relight the heart`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = false))
        repository.toggleLike("p1")
        repository.toggleLike("p1")
        val (like, unlike) = queued.map { it.cmid }

        repository.rollbackLike("p1", liked = false, cmid = like)
        assertThat(liked()).isFalse()
        assertThat(count()).isEqualTo(10)

        repository.rollbackLike("p1", liked = true, cmid = unlike)
        assertThat(liked()).isFalse()
        assertThat(count()).isEqualTo(10)
    }

    @Test
    fun `a delivered like followed by a refused unlike gives the heart back, the server having kept the like`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = false))
        repository.toggleLike("p1")
        repository.toggleLike("p1")
        val (like, unlike) = queued.map { it.cmid }

        repository.settleGesture(like)
        repository.rollbackLike("p1", liked = true, cmid = unlike)

        assertThat(liked()).isTrue()
        assertThat(count()).isEqualTo(11)
    }

    @Test
    fun `a refused like whose unlike is still queued leaves the heart off, then a refused unlike keeps it off`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 3, isLikedByMe = false))
        repository.setLiked("p1", true)
        repository.setLiked("p1", false)
        repository.setLiked("p1", true)
        val (like1, unlike, like2) = queued.map { it.cmid }

        repository.rollbackLike("p1", liked = false, cmid = like1)
        repository.rollbackLike("p1", liked = true, cmid = unlike)
        assertThat(liked()).isTrue()

        repository.rollbackLike("p1", liked = false, cmid = like2)
        assertThat(liked()).isFalse()
        assertThat(count()).isEqualTo(3)
    }

    @Test
    fun `a gesture that the queue annihilated leaves no trace to roll back`() = runTest {
        coEvery { outbox.enqueue(any(), any()) } returns null
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = false))
        repository.toggleLike("p1")

        repository.rollbackLike("p1", liked = false)

        assertThat(liked()).isTrue()
    }

    @Test
    fun `a bookmark refusal reverts its own gesture only`() = runTest {
        seed(ApiPost(id = "p1", content = "a", bookmarkCount = 2, isBookmarkedByMe = false))
        repository.toggleBookmark("p1")
        repository.toggleBookmark("p1")
        val (bookmark, unbookmark) = queued.map { it.cmid }

        repository.settleGesture(bookmark)
        repository.rollbackBookmark("p1", bookmarked = true, cmid = unbookmark)

        val post = repository.cachedPost("p1")!!
        assertThat(post.isBookmarkedByMe).isTrue()
        assertThat(post.bookmarkCount).isEqualTo(3)
    }

    @Test
    fun `a pending opposite gesture cancelled by the queue does not stop the in-flight gesture's refusal from rolling back`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = false))
        coEvery { outbox.stateOf(any()) } returns OutboxState.INFLIGHT
        repository.toggleLike("p1")
        repository.toggleLike("p1")
        val (like, unlike) = queued.map { it.cmid }
        coEvery { outbox.enqueue(any(), any()) } returns null
        coEvery { outbox.stateOf(unlike) } returns null
        repository.toggleLike("p1")
        assertThat(liked()).isTrue()

        repository.rollbackLike("p1", liked = false, cmid = like)

        assertThat(liked()).isFalse()
        assertThat(count()).isEqualTo(10)
    }
}
