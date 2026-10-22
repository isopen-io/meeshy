package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.post.PostRepository
import org.junit.Test
import java.io.IOException

class SocialSendersTest {

    private val postApi = mockk<PostApi>()
    private val postRepository = mockk<PostRepository>(relaxed = true)

    private val story = CreateStoryRequest(content = "bonjour", mediaIds = listOf("upload-cmid"))

    private fun storyRow(request: CreateStoryRequest = story) =
        outboxRow(OutboxKind.PUBLISH_STORY, payload = encodedPayload(request))

    @Test
    fun `publish story posts the queued story and maps the outcome`() = runTest {
        val handler = PublishStoryHandler(postApi, senderJson)

        coEvery { postApi.createStory(story) } returns accepted(ApiPost(id = "p1"))
        assertThat(handler.send(storyRow())).isEqualTo(SendResult.Success)

        coEvery { postApi.createStory(story) } returns refused()
        assertThat(handler.send(storyRow())).isEqualTo(SendResult.TransientFailure)

        coEvery { postApi.createStory(story) } throws IOException("offline")
        assertThat(handler.send(storyRow())).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `publish story with an undecodable payload fails permanently without calling the gateway`() = runTest {
        val handler = PublishStoryHandler(postApi, senderJson)

        val result = handler.send(outboxRow(OutboxKind.PUBLISH_STORY, payload = "oops"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { postApi.createStory(any()) }
    }

    @Test
    fun `publish story owns the graft that swaps an upload placeholder for the real media id`() {
        val grafted = PublishStoryHandler(postApi, senderJson)
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
        verify(exactly = 0) { postRepository.rollbackLike(any(), any()) }
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
}
