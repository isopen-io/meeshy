package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.post.PostComposerDraftStore
import me.meeshy.sdk.post.PostRepository
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class CreatePostHandlerTest {

    private val postApi = mockk<PostApi>()
    private val postRepository = mockk<PostRepository>(relaxed = true)
    private val outboxRepository = mockk<OutboxRepository>(relaxed = true)
    private val draftStore = mockk<PostComposerDraftStore>(relaxed = true)

    private val place = SharedPlace(latitude = 48.85, longitude = 2.35, name = "Paris")
    private val post = CreatePostRequest(
        content = "bonjour",
        type = "REEL",
        visibility = "FRIENDS",
        mediaIds = listOf("cmid_upload", "media-1"),
        location = place,
        mediaAlt = mapOf("cmid_upload" to "un chat"),
        originalLanguage = "fr",
    )
    private val serverId = "665f1c2e9b1d8a0012345678"

    private fun handler() = CreatePostHandler(postApi, outboxRepository, senderJson, postRepository, draftStore)

    private fun postRow(request: CreatePostRequest = post) =
        outboxRow(OutboxKind.CREATE_POST, targetId = "cmid_post", cmid = "cmid_post", payload = encodedPayload(request))

    private fun refusal(status: Int) = HttpException(Response.error<ApiPost>(status, "{}".toResponseBody()))

    @Test
    fun `a queued post is created under its own key so a replay never publishes it twice`() = runTest {
        coEvery { postApi.create(post, "cmid_post") } returns accepted(ApiPost(id = serverId))

        assertThat(handler().send(postRow())).isEqualTo(SendResult.Success)

        coVerify(exactly = 1) { postApi.create(post, "cmid_post") }
    }

    @Test
    fun `a created post takes its server id everywhere and joins the feed at once`() = runTest {
        val created = ApiPost(id = serverId, content = "bonjour")
        coEvery { postApi.create(post, "cmid_post") } returns accepted(created)

        handler().send(postRow())

        coVerify(exactly = 1) { outboxRepository.resolveLocalId("cmid_post", serverId) }
        coVerify(exactly = 1) { postRepository.adoptPublished(created) }
    }

    @Test
    fun `only a confirmed post lets its parked draft leave the device`() = runTest {
        coEvery { postApi.create(post, "cmid_post") } throws IOException("offline")
        handler().send(postRow())
        coEvery { postApi.create(post, "cmid_post") } throws refusal(415)
        handler().send(postRow())
        coVerify(exactly = 0) { draftStore.release(any()) }

        coEvery { postApi.create(post, "cmid_post") } returns accepted(ApiPost(id = serverId))
        handler().send(postRow())

        coVerify(exactly = 1) { draftStore.release("cmid_post") }
    }

    @Test
    fun `a post the feed cannot adopt is still delivered`() = runTest {
        coEvery { postApi.create(post, "cmid_post") } returns accepted(ApiPost(id = serverId))
        coEvery { postRepository.adoptPublished(any()) } throws IllegalStateException("closed")

        assertThat(handler().send(postRow())).isEqualTo(SendResult.Success)
    }

    @Test
    fun `offline, throttled, unauthorized or a server fault is retried`() = runTest {
        coEvery { postApi.create(post, "cmid_post") } throws IOException("offline")
        assertThat(handler().send(postRow())).isEqualTo(SendResult.TransientFailure)

        listOf(401, 408, 429, 500, 503).forEach { status ->
            coEvery { postApi.create(post, "cmid_post") } throws refusal(status)
            assertThat(handler().send(postRow())).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `a refusal the same payload would meet again fails at once and is kept for the author`() = runTest {
        listOf(400, 403, 413, 415, 422).forEach { status ->
            coEvery { postApi.create(post, "cmid_post") } throws refusal(status)

            val result = handler().send(postRow())

            assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
            assertThat((result as SendResult.PermanentFailure).unreadable).isFalse()
        }
        coVerify(exactly = 0) { outboxRepository.resolveLocalId(any(), any()) }
    }

    @Test
    fun `an undecodable post fails permanently without calling the gateway`() = runTest {
        val result = handler().send(outboxRow(OutboxKind.CREATE_POST, payload = "oops"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { postApi.create(any(), any()) }
    }

    @Test
    fun `the graft swaps an upload placeholder for the real media id without losing a post field`() {
        val grafted = handler().payloadGraft?.invoke(encodedPayload(post), "cmid_upload", "media-42")

        val request = senderJson.decodeFromString<CreatePostRequest>(grafted.orEmpty())
        assertThat(request.mediaIds).containsExactly("media-42", "media-1").inOrder()
        assertThat(request.mediaAlt).containsExactly("media-42", "un chat")
        assertThat(request.location).isEqualTo(place)
        assertThat(request.type).isEqualTo("REEL")
        assertThat(request.visibility).isEqualTo("FRIENDS")
    }

    @Test
    fun `the graft declines a post that does not carry the placeholder`() {
        assertThat(handler().payloadGraft?.invoke(encodedPayload(post), "cmid_other", "media-42")).isNull()
        assertThat(handler().payloadGraft?.invoke("oops", "cmid_upload", "media-42")).isNull()
    }
}
