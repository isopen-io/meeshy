package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.outbox.DeleteCommentPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.ToggleLikeCommentPayload
import me.meeshy.sdk.post.CommentGestureQueue
import me.meeshy.sdk.post.CommentGestureRollback
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class SocialKindsSendersTest {

    private val postApi = mockk<PostApi>()
    private val storyApi = mockk<StoryApi>()
    private val gestures = mockk<CommentGestureQueue>(relaxed = true)

    private fun refusal(status: Int, code: String? = null): HttpException {
        val body = if (code == null) "<html>proxy</html>" else """{"success":false,"error":"no","code":"$code"}"""
        return HttpException(Response.error<ApiResponse<Unit>>(status, body.toResponseBody()))
    }

    private fun likeRow(liked: Boolean) = outboxRow(
        OutboxKind.TOGGLE_LIKE_COMMENT,
        targetId = "c1",
        payload = encodedPayload(ToggleLikeCommentPayload(postId = "p1", liked = liked)),
    )

    private fun deleteRow() = outboxRow(OutboxKind.DELETE_COMMENT, targetId = "c1", payload = encodedPayload(DeleteCommentPayload("p1")))

    @Test
    fun `a queued heart is replayed in the state the author wanted`() = runTest {
        coEvery { postApi.likeComment("p1", "c1") } returns accepted(Unit)
        coEvery { postApi.unlikeComment("p1", "c1") } returns accepted(Unit)
        val handler = ToggleLikeCommentHandler(postApi, senderJson, gestures)

        assertThat(handler.send(likeRow(liked = true))).isEqualTo(SendResult.Success)
        assertThat(handler.send(likeRow(liked = false))).isEqualTo(SendResult.Success)

        coVerify(exactly = 1) { postApi.likeComment("p1", "c1") }
        coVerify(exactly = 1) { postApi.unlikeComment("p1", "c1") }
    }

    @Test
    fun `a heart already applied is a success, a refusal of the gateway is final, offline is replayed`() = runTest {
        val handler = ToggleLikeCommentHandler(postApi, senderJson, gestures)

        coEvery { postApi.likeComment(any(), any()) } throws refusal(409, "REACTION_LIMIT_REACHED")
        assertThat(handler.send(likeRow(true))).isEqualTo(SendResult.Success)

        coEvery { postApi.likeComment(any(), any()) } throws refusal(404, "COMMENT_NOT_FOUND")
        assertThat(handler.send(likeRow(true))).isInstanceOf(SendResult.PermanentFailure::class.java)

        coEvery { postApi.likeComment(any(), any()) } throws IOException("offline")
        assertThat(handler.send(likeRow(true))).isNotInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `a heart that gave up tells the screen to take it back`() = runTest {
        ToggleLikeCommentHandler(postApi, senderJson, gestures).onExhausted(likeRow(liked = true))

        verify { gestures.rolledBack(CommentGestureRollback.Like("c1", liked = true)) }
    }

    @Test
    fun `a comment already gone counts as deleted, a refusal brings it back`() = runTest {
        val handler = DeleteCommentHandler(postApi, senderJson, gestures)

        coEvery { postApi.deleteComment("p1", "c1") } returns accepted(Unit)
        assertThat(handler.send(deleteRow())).isEqualTo(SendResult.Success)

        coEvery { postApi.deleteComment("p1", "c1") } throws refusal(404, "COMMENT_NOT_FOUND")
        assertThat(handler.send(deleteRow())).isEqualTo(SendResult.Success)

        coEvery { postApi.deleteComment("p1", "c1") } throws refusal(403, "FORBIDDEN")
        assertThat(handler.send(deleteRow())).isInstanceOf(SendResult.PermanentFailure::class.java)

        coEvery { postApi.deleteComment("p1", "c1") } throws refusal(404)
        assertThat(handler.send(deleteRow())).isNotInstanceOf(SendResult.PermanentFailure::class.java)

        handler.onExhausted(deleteRow())
        verify { gestures.rolledBack(CommentGestureRollback.Delete("c1")) }
    }

    @Test
    fun `a story view is replayed offline and dropped when the story is gone`() = runTest {
        val handler = MarkStoryViewedHandler(storyApi)
        val row = outboxRow(OutboxKind.MARK_STORY_VIEWED, targetId = "s1")

        coEvery { storyApi.markViewed("s1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { storyApi.markViewed("s1") } throws refusal(404, "POST_NOT_FOUND")
        assertThat(handler.send(row)).isInstanceOf(SendResult.PermanentFailure::class.java)

        coEvery { storyApi.markViewed("s1") } throws IOException("offline")
        assertThat(handler.send(row)).isNotInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `a private story repost without gateway route is kept with its reason, never replayed blindly`() = runTest {
        val result = RepostStoryHandler().send(outboxRow(OutboxKind.REPOST_STORY, targetId = "s1"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
