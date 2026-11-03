package me.meeshy.sdk.post

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.senders.LikePostHandler
import me.meeshy.sdk.outbox.senders.outboxRow
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** #14749 — un j'aime ou un favori perdu pour de bon se dit au lecteur, avec la raison de la passerelle. */
class PostGestureRefusalTest {

    private val api: PostApi = mockk(relaxed = true)
    private val repository = PostRepository(api, mockk(relaxed = true), mockk(relaxed = true))

    private suspend fun seed(post: ApiPost) {
        coEvery { api.getFeed(null, any()) } returns
            ApiResponse(success = true, data = listOf(post), pagination = Pagination(nextCursor = null, hasMore = false))
        repository.refresh()
    }

    @Test
    fun `a refused like is announced after the heart is turned back off`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 2, isLikedByMe = false))
        repository.toggleLike("p1")

        repository.gestureRefusals.test {
            repository.rollbackLike("p1", liked = false, reason = "Refused: HTTP 404 POST_NOT_FOUND")

            assertThat(awaitItem()).isEqualTo(GestureRefusal("p1", PostGesture.LIKE, "Refused: HTTP 404 POST_NOT_FOUND"))
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(repository.cachedPost("p1")!!.isLikedByMe).isFalse()
    }

    @Test
    fun `a refused bookmark is announced as a bookmark refusal`() = runTest {
        seed(ApiPost(id = "p1", content = "a", bookmarkCount = 1, isBookmarkedByMe = false))
        repository.toggleBookmark("p1")

        repository.gestureRefusals.test {
            repository.rollbackBookmark("p1", bookmarked = false)

            assertThat(awaitItem()).isEqualTo(GestureRefusal("p1", PostGesture.BOOKMARK, null))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a rollback with nothing left to undo announces nothing`() = runTest {
        seed(ApiPost(id = "p1", content = "a", likeCount = 2, isLikedByMe = false))

        repository.gestureRefusals.test {
            repository.rollbackLike("p1", liked = false)

            expectNoEvents()
        }
    }

    @Test
    fun `the daily reaction limit is a definitive refusal that carries its code`() = runTest {
        val handler = LikePostHandler(api, mockk(relaxed = true))
        coEvery { api.like("p1") } throws HttpException(
            Response.error<Unit>(429, """{"success":false,"error":"limit","code":"DAILY_REACTION_LIMIT"}""".toResponseBody()),
        )

        val result = handler.send(outboxRow(OutboxKind.LIKE_POST, targetId = "p1"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat((result as SendResult.PermanentFailure).reason).contains("DAILY_REACTION_LIMIT")
    }
}
