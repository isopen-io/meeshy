package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommentSettingsRequest
import me.meeshy.sdk.net.api.CommentSettingsResult
import me.meeshy.sdk.net.api.PostApi
import org.junit.Test

class PostCommentSettingsRepositoryTest {

    private val api: PostApi = mockk()

    private fun feedHolding(vararg rows: ApiPost): Pair<PostRepository, MutableList<ApiPost>> {
        val folded = mutableListOf<ApiPost>()
        val current = rows.associateBy { it.id }.toMutableMap()
        val posts: PostRepository = mockk(relaxed = true)
        every { posts.cachedPost(any()) } answers { current[firstArg()] }
        coEvery { posts.applyPostUpdate(any()) } answers {
            val updated = firstArg<ApiPost>()
            current[updated.id] = updated
            folded += updated
            true
        }
        return posts to folded
    }

    @Test
    fun `closing comments flips the feed row before the network and keeps what the gateway applied`() = runTest {
        val (posts, folded) = feedHolding(ApiPost(id = "p1"))
        coEvery { api.updateCommentSettings("p1", CommentSettingsRequest(true)) } returns
            ApiResponse(success = true, data = CommentSettingsResult(postId = "p1", commentsDisabled = true))

        val result = PostCommentSettingsRepository(api, posts).setCommentsDisabled("p1", disabled = true)

        assertThat(result).isEqualTo(NetworkResult.Success(true))
        assertThat(folded.map { it.commentsDisabled }).containsExactly(true)
        assertThat(posts.cachedPost("p1")?.commentsDisabled).isTrue()
    }

    @Test
    fun `a refusal puts the feed row back`() = runTest {
        val (posts, folded) = feedHolding(ApiPost(id = "p1"))
        coEvery { api.updateCommentSettings("p1", any()) } returns ApiResponse(success = false, code = "FORBIDDEN", error = "Forbidden")

        val result = PostCommentSettingsRepository(api, posts).setCommentsDisabled("p1", disabled = true)

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("FORBIDDEN")
        assertThat(folded.map { it.commentsDisabled }).containsExactly(true, false).inOrder()
        assertThat(posts.cachedPost("p1")?.commentsDisabled).isFalse()
    }

    @Test
    fun `a post the feed does not hold still reaches the gateway, nothing is folded`() = runTest {
        val (posts, _) = feedHolding()
        coEvery { api.updateCommentSettings("p9", any()) } returns
            ApiResponse(success = true, data = CommentSettingsResult(postId = "p9", commentsDisabled = false))

        val result = PostCommentSettingsRepository(api, posts).setCommentsDisabled("p9", disabled = false)

        assertThat(result).isEqualTo(NetworkResult.Success(false))
        coVerify(exactly = 0) { posts.applyPostUpdate(any()) }
    }
}
