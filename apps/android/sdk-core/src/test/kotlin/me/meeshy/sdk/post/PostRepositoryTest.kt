package me.meeshy.sdk.post

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.PostApi
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class PostRepositoryTest {

    private val api: PostApi = mockk(relaxed = true)

    private fun ok(post: ApiPost) = ApiResponse(success = true, data = listOf(post))
    private fun okUnit() = ApiResponse(success = true, data = Unit)

    private fun page(posts: List<ApiPost>, nextCursor: String?, hasMore: Boolean) =
        ApiResponse(
            success = true,
            data = posts,
            pagination = Pagination(nextCursor = nextCursor, hasMore = hasMore),
        )

    private fun List<ApiPost>.post(id: String) = first { it.id == id }

    private fun CacheResult<List<ApiPost>>.posts(): List<ApiPost> =
        (this as? CacheResult.Fresh)?.value ?: (this as CacheResult.Stale).value

    private suspend fun seed(post: ApiPost): PostRepository {
        coEvery { api.getFeed(any(), any()) } returns ok(post)
        val repo = PostRepository(api)
        repo.refresh()
        return repo
    }

    @Test
    fun toggleLike_likesOptimistically_andCallsApi() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", likeCount = 2, isLikedByMe = false))
        coEvery { api.like("p1") } returns okUnit()

        repo.feedStream().test {
            // initial fresh state from the seeded cache
            assertThat((awaitItem() as CacheResult.Fresh).value.post("p1").isLikedByMe).isFalse()

            repo.toggleLike("p1")

            val after = awaitItem()
            val liked = ((after as? CacheResult.Fresh)?.value ?: (after as CacheResult.Stale).value).post("p1")
            assertThat(liked.isLikedByMe).isTrue()
            assertThat(liked.likeCount).isEqualTo(3)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.like("p1") }
    }

    @Test
    fun toggleLike_unlikesWhenAlreadyLiked() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", likeCount = 5, isLikedByMe = true))
        coEvery { api.unlike("p1") } returns okUnit()

        repo.toggleLike("p1")

        repo.feedStream().test {
            val item = awaitItem()
            val post = ((item as? CacheResult.Fresh)?.value ?: (item as CacheResult.Stale).value).post("p1")
            assertThat(post.isLikedByMe).isFalse()
            assertThat(post.likeCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.unlike("p1") }
    }

    @Test
    fun toggleLike_rollsBackOnFailure() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", likeCount = 2, isLikedByMe = false))
        coEvery { api.like("p1") } throws IOException("offline")

        repo.toggleLike("p1")

        repo.feedStream().test {
            val item = awaitItem()
            val post = ((item as? CacheResult.Fresh)?.value ?: (item as CacheResult.Stale).value).post("p1")
            // rolled back to the pre-toggle values
            assertThat(post.isLikedByMe).isFalse()
            assertThat(post.likeCount).isEqualTo(2)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun toggleBookmark_bookmarksOptimistically_andCallsApi() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", bookmarkCount = 2, isBookmarkedByMe = false))
        coEvery { api.bookmark("p1") } returns okUnit()

        repo.feedStream().test {
            assertThat((awaitItem() as CacheResult.Fresh).value.post("p1").isBookmarkedByMe).isFalse()

            repo.toggleBookmark("p1")

            val after = awaitItem()
            val bookmarked = ((after as? CacheResult.Fresh)?.value ?: (after as CacheResult.Stale).value).post("p1")
            assertThat(bookmarked.isBookmarkedByMe).isTrue()
            assertThat(bookmarked.bookmarkCount).isEqualTo(3)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.bookmark("p1") }
    }

    @Test
    fun toggleBookmark_removesWhenAlreadyBookmarked() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", bookmarkCount = 5, isBookmarkedByMe = true))
        coEvery { api.removeBookmark("p1") } returns okUnit()

        repo.toggleBookmark("p1")

        repo.feedStream().test {
            val item = awaitItem()
            val post = ((item as? CacheResult.Fresh)?.value ?: (item as CacheResult.Stale).value).post("p1")
            assertThat(post.isBookmarkedByMe).isFalse()
            assertThat(post.bookmarkCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }
        coVerify(exactly = 1) { api.removeBookmark("p1") }
    }

    @Test
    fun toggleBookmark_rollsBackOnFailure() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", bookmarkCount = 2, isBookmarkedByMe = false))
        coEvery { api.bookmark("p1") } throws IOException("offline")

        val accepted = repo.toggleBookmark("p1")

        assertThat(accepted).isFalse()
        repo.feedStream().test {
            val item = awaitItem()
            val post = ((item as? CacheResult.Fresh)?.value ?: (item as CacheResult.Stale).value).post("p1")
            assertThat(post.isBookmarkedByMe).isFalse()
            assertThat(post.bookmarkCount).isEqualTo(2)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun toggleBookmark_returnsFalseForUnknownPost() = runTest {
        val repo = seed(ApiPost(id = "p1", content = "hi", bookmarkCount = 2, isBookmarkedByMe = false))

        val accepted = repo.toggleBookmark("missing")

        assertThat(accepted).isFalse()
        coVerify(exactly = 0) { api.bookmark(any()) }
    }

    @Test
    fun feedHasMore_reflectsFirstPagePagination() = runTest {
        coEvery { api.getFeed(null, any()) } returns
            page(listOf(ApiPost(id = "p1", content = "a")), nextCursor = "c1", hasMore = true)
        val repo = PostRepository(api)

        repo.refresh()

        assertThat(repo.feedHasMore.value).isTrue()
    }

    @Test
    fun loadMore_appendsDedupedNextPage_andStopsWhenExhausted() = runTest {
        coEvery { api.getFeed(null, any()) } returns
            page(listOf(ApiPost(id = "p1", content = "a")), nextCursor = "c1", hasMore = true)
        coEvery { api.getFeed("c1", any()) } returns
            page(
                listOf(ApiPost(id = "p1", content = "a"), ApiPost(id = "p2", content = "b")),
                nextCursor = null,
                hasMore = false,
            )
        val repo = PostRepository(api)
        repo.refresh()

        val moreRemains = repo.loadMore()

        assertThat(moreRemains).isFalse()
        assertThat(repo.feedHasMore.value).isFalse()
        repo.feedStream().test {
            assertThat(awaitItem().posts().map { it.id }).containsExactly("p1", "p2").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun loadMore_isNoOp_whenNoCursorRemains() = runTest {
        coEvery { api.getFeed(null, any()) } returns
            page(listOf(ApiPost(id = "p1", content = "a")), nextCursor = null, hasMore = false)
        val repo = PostRepository(api)
        repo.refresh()

        assertThat(repo.loadMore()).isFalse()

        coVerify(exactly = 1) { api.getFeed(any(), any()) }
    }
}
