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
import me.meeshy.sdk.net.api.PostApi
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class PostRepositoryTest {

    private val api: PostApi = mockk(relaxed = true)

    private fun ok(post: ApiPost) = ApiResponse(success = true, data = listOf(post))
    private fun okUnit() = ApiResponse(success = true, data = Unit)

    private fun List<ApiPost>.post(id: String) = first { it.id == id }

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
}
