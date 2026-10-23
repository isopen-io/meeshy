package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.PostLikeRequest
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test
import java.io.IOException

class PostRepositoryReactTest {

    private val api: PostApi = mockk(relaxed = true)
    private val outbox: OutboxRepository = mockk(relaxed = true)

    private suspend fun repo(vararg cached: ApiPost): PostRepository {
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(success = true, data = cached.toList())
        return PostRepository(api, mockk<TranslationApi>(relaxed = true), outbox).also { it.refresh() }
    }

    @Test
    fun react_withAnotherEmoji_postsTheLikeCarryingTheEmoji() = runTest {
        coEvery { api.likeWithEmoji(any(), any()) } returns ApiResponse(success = true, data = Unit)

        val result = repo().react("p1", "🔥")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 1) { api.likeWithEmoji("p1", PostLikeRequest("🔥")) }
        coVerify(exactly = 0) { api.like(any()) }
    }

    @Test
    fun react_withTheHeart_keepsTheBodylessLikeUnchanged() = runTest {
        coEvery { api.like(any()) } returns ApiResponse(success = true, data = Unit)

        repo().react("p1", "❤️")

        coVerify(exactly = 1) { api.like("p1") }
        coVerify(exactly = 0) { api.likeWithEmoji(any(), any()) }
    }

    @Test
    fun react_withAnotherEmoji_neverTouchesTheLikedStateNorTheHeartCount() = runTest {
        coEvery { api.likeWithEmoji(any(), any()) } returns ApiResponse(success = true, data = Unit)
        val repository = repo(ApiPost(id = "p1", likeCount = 4, isLikedByMe = false))

        repository.react("p1", "😂")

        val cached = repository.cachedPost("p1")
        assertThat(cached?.isLikedByMe).isFalse()
        assertThat(cached?.likeCount).isEqualTo(4)
    }

    @Test
    fun react_aNetworkFailureIsReportedAndLeavesNoLocalState() = runTest {
        coEvery { api.likeWithEmoji(any(), any()) } throws IOException("offline")
        val repository = repo(ApiPost(id = "p1", likeCount = 4, isLikedByMe = false))

        val result = repository.react("p1", "😂")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(repository.cachedPost("p1")?.likeCount).isEqualTo(4)
    }
}
