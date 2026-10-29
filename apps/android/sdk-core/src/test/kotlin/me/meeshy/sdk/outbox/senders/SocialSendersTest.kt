package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.Test
import java.io.IOException
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response

class SocialSendersTest {

    private val postApi = mockk<PostApi>()
    private val postRepository = mockk<PostRepository>(relaxed = true)
    private val outboxRepository = mockk<OutboxRepository>(relaxed = true)
    private val storyRepository = mockk<StoryRepository>(relaxed = true)
    private val draftConfirmation = mockk<StoryDraftConfirmation>(relaxed = true)

    private val story = CreateStoryRequest(content = "bonjour", mediaIds = listOf("upload-cmid"))

    private fun storyRow(request: CreateStoryRequest = story) =
        outboxRow(OutboxKind.PUBLISH_STORY, payload = encodedPayload(request))

    @Test
    fun `publish story posts the queued story and maps the outcome`() = runTest {
        val handler = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)

        coEvery { postApi.createStory(story) } returns accepted(ApiPost(id = "p1"))
        assertThat(handler.send(storyRow())).isEqualTo(SendResult.Success)

        coEvery { postApi.createStory(story) } returns refused()
        assertThat(handler.send(storyRow())).isEqualTo(SendResult.TransientFailure)

        coEvery { postApi.createStory(story) } throws IOException("offline")
        assertThat(handler.send(storyRow())).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `a published story re-addresses the rows that waited on its pending handle to its server id`() = runTest {
        val handler = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)
        val row = outboxRow(OutboxKind.PUBLISH_STORY, targetId = "pending_abc", payload = encodedPayload(story))
        coEvery { postApi.createStory(story) } returns accepted(ApiPost(id = "665f1c2e9b1d8a0012345678"))

        val result = handler.send(row)

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { outboxRepository.resolveLocalId("pending_abc", "665f1c2e9b1d8a0012345678") }
    }

    @Test
    fun `a story that could not be re-addressed is still delivered`() = runTest {
        val handler = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)
        coEvery { postApi.createStory(story) } returns accepted(ApiPost(id = "p1"))
        coEvery { outboxRepository.resolveLocalId(any(), any()) } throws IllegalStateException("db closed")

        assertThat(handler.send(storyRow())).isEqualTo(SendResult.Success)
    }

    @Test
    fun `a published story joins the tray cache at once, without waiting for a revalidation`() = runTest {
        val handler = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)
        val published = ApiPost(id = "665f1c2e9b1d8a0012345678", type = "STORY", author = ApiAuthor(id = "me", username = "me"))
        coEvery { postApi.createStory(story) } returns accepted(published)

        assertThat(handler.send(storyRow())).isEqualTo(SendResult.Success)

        coVerify(exactly = 1) { storyRepository.adoptPublished(published) }
    }

    @Test
    fun `a story the cache cannot adopt is still delivered`() = runTest {
        val handler = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)
        coEvery { postApi.createStory(story) } returns accepted(ApiPost(id = "p1"))
        coEvery { storyRepository.adoptPublished(any()) } throws IllegalStateException("db closed")

        assertThat(handler.send(storyRow())).isEqualTo(SendResult.Success)
    }

    @Test
    fun `only a confirmed story lets the composer draft that queued it settle`() = runTest {
        val handler = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)
        coEvery { postApi.createStory(story) } returns refused()
        handler.send(storyRow())
        coVerify(exactly = 0) { draftConfirmation.settle(any()) }

        coEvery { postApi.createStory(story) } returns accepted(ApiPost(id = "p1"))
        handler.send(storyRow())

        coVerify(exactly = 1) { draftConfirmation.settle("cmid-1") }
    }

    @Test
    fun `a story that failed to publish re-addresses nothing`() = runTest {
        val handler = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)
        coEvery { postApi.createStory(story) } returns refused()

        assertThat(handler.send(storyRow())).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { outboxRepository.resolveLocalId(any(), any()) }
        coVerify(exactly = 0) { storyRepository.adoptPublished(any()) }
    }

    @Test
    fun `publish story with an undecodable payload fails permanently without calling the gateway`() = runTest {
        val handler = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)

        val result = handler.send(outboxRow(OutboxKind.PUBLISH_STORY, payload = "oops"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { postApi.createStory(any()) }
    }

    @Test
    fun `publish story owns the graft that swaps an upload placeholder for the real media id`() {
        val grafted = PublishStoryHandler(postApi, outboxRepository, senderJson, storyRepository, draftConfirmation)
            .payloadGraft
            ?.invoke(encodedPayload(story), "upload-cmid", "media-42")

        val request = senderJson.decodeFromString<CreateStoryRequest>(grafted.orEmpty())
        assertThat(request.mediaIds).containsExactly("media-42")
    }

    @Test
    fun `like post maps an accepted call to success and any failure to retryable`() = runTest {
        val handler = LikePostHandler(postApi, postRepository)
        val row = outboxRow(OutboxKind.LIKE_POST, targetId = "p1")

        coEvery { postApi.like("p1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { postApi.like("p1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)

        coEvery { postApi.like("p1") } throws IOException("offline")
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { postRepository.rollbackLike(any(), any(), any()) }
    }

    private fun refusal(status: Int) = HttpException(Response.error<Unit>(status, "{}".toResponseBody()))

    private fun gatewayRefusal(status: Int, code: String) = HttpException(
        Response.error<Unit>(status, """{"success":false,"error":"refused","code":"$code"}""".toResponseBody()),
    )

    @Test
    fun `a like the server says it already applied is a success, never a failure that rolls the like back`() = runTest {
        val row = outboxRow(OutboxKind.LIKE_POST, targetId = "p1")
        val handler = LikePostHandler(postApi, postRepository)

        listOf(409, 410).forEach { status ->
            coEvery { postApi.like("p1") } throws refusal(status)
            assertThat(handler.send(row)).isEqualTo(SendResult.Success)
        }
        coEvery { postApi.like("p1") } throws refusal(500)
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `unlike, bookmark and unbookmark already in the asked state are successes too`() = runTest {
        val unlike = outboxRow(OutboxKind.UNLIKE_POST, targetId = "p1")
        val bookmark = outboxRow(OutboxKind.BOOKMARK_POST, targetId = "p1")
        val unbookmark = outboxRow(OutboxKind.UNBOOKMARK_POST, targetId = "p1")

        listOf(409, 410).forEach { status ->
            coEvery { postApi.unlike("p1") } throws refusal(status)
            coEvery { postApi.bookmark("p1") } throws refusal(status)
            coEvery { postApi.removeBookmark("p1") } throws refusal(status)
            assertThat(UnlikePostHandler(postApi, postRepository).send(unlike)).isEqualTo(SendResult.Success)
            assertThat(BookmarkPostHandler(postApi, postRepository).send(bookmark)).isEqualTo(SendResult.Success)
            assertThat(UnbookmarkPostHandler(postApi, postRepository).send(unbookmark)).isEqualTo(SendResult.Success)
        }
    }

    @Test
    fun `unlike post maps an accepted call to success and any failure to retryable`() = runTest {
        val handler = UnlikePostHandler(postApi, postRepository)
        val row = outboxRow(OutboxKind.UNLIKE_POST, targetId = "p1")

        coEvery { postApi.unlike("p1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { postApi.unlike("p1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `bookmark post maps an accepted call to success and any failure to retryable`() = runTest {
        val handler = BookmarkPostHandler(postApi, postRepository)
        val row = outboxRow(OutboxKind.BOOKMARK_POST, targetId = "p1")

        coEvery { postApi.bookmark("p1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { postApi.bookmark("p1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `unbookmark post maps an accepted call to success and any failure to retryable`() = runTest {
        val handler = UnbookmarkPostHandler(postApi, postRepository)
        val row = outboxRow(OutboxKind.UNBOOKMARK_POST, targetId = "p1")

        coEvery { postApi.removeBookmark("p1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { postApi.removeBookmark("p1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `a definitive refusal of a like, unlike, bookmark or unbookmark fails at once instead of being retried to exhaustion`() = runTest {
        listOf(400 to "VALIDATION_ERROR", 403 to "FORBIDDEN", 404 to "POST_NOT_FOUND", 422 to "UNPROCESSABLE").forEach { (status, code) ->
            coEvery { postApi.like("p1") } throws gatewayRefusal(status, code)
            coEvery { postApi.unlike("p1") } throws gatewayRefusal(status, code)
            coEvery { postApi.bookmark("p1") } throws gatewayRefusal(status, code)
            coEvery { postApi.removeBookmark("p1") } throws gatewayRefusal(status, code)

            listOf(
                LikePostHandler(postApi, postRepository) to OutboxKind.LIKE_POST,
                UnlikePostHandler(postApi, postRepository) to OutboxKind.UNLIKE_POST,
                BookmarkPostHandler(postApi, postRepository) to OutboxKind.BOOKMARK_POST,
                UnbookmarkPostHandler(postApi, postRepository) to OutboxKind.UNBOOKMARK_POST,
            ).forEach { (handler, kind) ->
                assertThat(handler.send(outboxRow(kind, targetId = "p1"))).isInstanceOf(SendResult.PermanentFailure::class.java)
            }
        }
    }

    @Test
    fun `a rate limit, a server error, an expired session and a network error stay transient`() = runTest {
        val handler = LikePostHandler(postApi, postRepository)
        val row = outboxRow(OutboxKind.LIKE_POST, targetId = "p1")

        listOf(401, 408, 429, 500, 502, 503).forEach { status ->
            coEvery { postApi.like("p1") } throws refusal(status)
            assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
        }
        coEvery { postApi.like("p1") } throws IOException("offline")
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `a delivered gesture settles its own trace, a failed one does not`() = runTest {
        val row = outboxRow(OutboxKind.LIKE_POST, targetId = "p1", cmid = "c-7")
        val handler = LikePostHandler(postApi, postRepository)

        coEvery { postApi.like("p1") } throws gatewayRefusal(404, "POST_NOT_FOUND")
        handler.send(row)
        verify(exactly = 0) { postRepository.settleGesture(any()) }

        coEvery { postApi.like("p1") } returns accepted(Unit)
        handler.send(row)
        verify(exactly = 1) { postRepository.settleGesture("c-7") }
    }
    @Test
    fun `a refusal that never reached the gateway, like the proxy's 404 while the gateway restarts, stays transient`() = runTest {
        val handler = LikePostHandler(postApi, postRepository)
        val row = outboxRow(OutboxKind.LIKE_POST, targetId = "p1")

        listOf(400, 403, 404, 422).forEach { status ->
            coEvery { postApi.like("p1") } throws HttpException(Response.error<Unit>(status, "404 page not found".toResponseBody()))
            assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
            coEvery { postApi.like("p1") } throws refusal(status)
            assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
        }
    }
}
