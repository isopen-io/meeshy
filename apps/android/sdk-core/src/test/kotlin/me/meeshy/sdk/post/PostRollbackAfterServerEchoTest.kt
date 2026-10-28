package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.PostApi
import org.junit.Test

/** #13588 — un retour arrière ne défait jamais une valeur que le serveur a confirmée entre le geste et l'échec. */
class PostRollbackAfterServerEchoTest {

    private val api: PostApi = mockk(relaxed = true)
    private val repository = PostRepository(api, mockk(relaxed = true), mockk(relaxed = true))

    private suspend fun seed(post: ApiPost) {
        coEvery { api.getFeed(null, any()) } returns
            ApiResponse(success = true, data = listOf(post), pagination = Pagination(nextCursor = null, hasMore = false))
        repository.refresh()
    }

    @Test
    fun `a like rollback after the server echoed its own count keeps that count and turns the heart off`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = false))
        repository.toggleLike("p1")

        repository.applyPostUpdate(ApiPost(id = "p1", content = "a", likeCount = 10))
        repository.rollbackLike("p1", liked = false)

        val post = repository.cachedPost("p1")!!
        assertThat(post.likeCount).isEqualTo(10)
        assertThat(post.isLikedByMe).isFalse()
    }

    @Test
    fun `an unlike rollback after the server echoed its own count keeps that count and turns the heart back on`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = true))
        repository.toggleLike("p1")

        repository.applyPostUpdate(ApiPost(id = "p1", content = "a", likeCount = 12))
        repository.rollbackLike("p1", liked = true)

        val post = repository.cachedPost("p1")!!
        assertThat(post.likeCount).isEqualTo(12)
        assertThat(post.isLikedByMe).isTrue()
    }

    @Test
    fun `a bookmark rollback after the server echoed its own count keeps that count and clears the bookmark`() = runTest {
        seed(ApiPost(id = "p1", content = "a", bookmarkCount = 4, isBookmarkedByMe = false))
        repository.toggleBookmark("p1")

        repository.applyPostUpdate(ApiPost(id = "p1", content = "a", bookmarkCount = 4))
        repository.rollbackBookmark("p1", bookmarked = false)

        val post = repository.cachedPost("p1")!!
        assertThat(post.bookmarkCount).isEqualTo(4)
        assertThat(post.isBookmarkedByMe).isFalse()
    }

    @Test
    fun `a like the server already shows on a refreshed row is not undone by a late exhaustion`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = false))
        repository.toggleLike("p1")

        seed(ApiPost(id = "p1", content = "a", likeCount = 11, isLikedByMe = true))
        repository.rollbackLike("p1", liked = false)

        val post = repository.cachedPost("p1")!!
        assertThat(post.likeCount).isEqualTo(11)
        assertThat(post.isLikedByMe).isTrue()
    }

    @Test
    fun `a rollback with no optimistic flip on record leaves a row loaded from the server alone`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 3, isLikedByMe = true))

        repository.rollbackLike("p1", liked = false)

        assertThat(repository.cachedPost("p1")!!.likeCount).isEqualTo(3)
        assertThat(repository.cachedPost("p1")!!.isLikedByMe).isTrue()
    }

    @Test
    fun `an untouched optimistic flip still rolls back exactly`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 10, isLikedByMe = false))
        repository.toggleLike("p1")

        repository.rollbackLike("p1", liked = false)

        val post = repository.cachedPost("p1")!!
        assertThat(post.likeCount).isEqualTo(10)
        assertThat(post.isLikedByMe).isFalse()
    }
}
