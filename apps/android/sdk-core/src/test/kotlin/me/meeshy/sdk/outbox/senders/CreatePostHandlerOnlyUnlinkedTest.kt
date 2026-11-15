package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.net.OnlyUnlinkedRefusal
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.post.PostComposerDraftStore
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/**
 * #14169 — le plafond des personnes choisies sans lien n'est pas un encombrement passager : la file d'envoi renonce
 * aussitôt, sans réessai, et garde le refus avec ses nombres pour le dire à l'auteur.
 */
class CreatePostHandlerOnlyUnlinkedTest {

    private val postApi = mockk<PostApi>()
    private val outboxRepository = mockk<OutboxRepository>(relaxed = true)

    private val post = CreatePostRequest(content = "bonjour", type = "POST", visibility = "ONLY", originalLanguage = "fr")
    private val story = CreateStoryRequest(content = "bonjour", mediaIds = listOf("upload-cmid"))

    private val postHandler = CreatePostHandler(
        postApi, outboxRepository, senderJson, mockk<PostRepository>(relaxed = true), mockk<PostComposerDraftStore>(relaxed = true),
    )
    private val storyHandler = PublishStoryHandler(
        postApi, outboxRepository, senderJson, mockk<StoryRepository>(relaxed = true), mockk<StoryDraftConfirmation>(relaxed = true),
    )

    private fun postRow() =
        outboxRow(OutboxKind.CREATE_POST, targetId = "cmid_post", cmid = "cmid_post", payload = encodedPayload(post))

    private fun storyRow() =
        outboxRow(OutboxKind.PUBLISH_STORY, targetId = "cmid_story", cmid = "cmid_story", payload = encodedPayload(story))

    private fun tooMany(body: String) = HttpException(Response.error<ApiPost>(429, body.toResponseBody()))

    private val capBody =
        """{"success":false,"error":"Too many","code":"ONLY_UNLINKED_RECIPIENTS_LIMIT","limit":50,"unlinked":3}"""

    @Test
    fun `un post refuse pour trop de choisis sans lien renonce et garde ses nombres`() = runTest {
        coEvery { postApi.create(post, "cmid_post") } throws tooMany(capBody)

        val result = postHandler.send(postRow())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(OnlyUnlinkedRefusal(limit = 50, unlinked = 3).reason))
        assertThat(OnlyUnlinkedRefusal.parse((result as SendResult.PermanentFailure).reason))
            .isEqualTo(OnlyUnlinkedRefusal(limit = 50, unlinked = 3))
    }

    @Test
    fun `une story refusee pour trop de choisis sans lien renonce aussi`() = runTest {
        coEvery { postApi.createStory(story) } throws tooMany(capBody)

        val result = storyHandler.send(storyRow())

        assertThat(OnlyUnlinkedRefusal.parse((result as SendResult.PermanentFailure).reason))
            .isEqualTo(OnlyUnlinkedRefusal(limit = 50, unlinked = 3))
    }

    @Test
    fun `un refus sans nombres se dit quand meme`() = runTest {
        coEvery { postApi.create(post, "cmid_post") } throws tooMany("""{"success":false,"code":"ONLY_UNLINKED_RECIPIENTS_LIMIT"}""")

        val result = postHandler.send(postRow())

        assertThat(OnlyUnlinkedRefusal.parse((result as SendResult.PermanentFailure).reason))
            .isEqualTo(OnlyUnlinkedRefusal(limit = null, unlinked = null))
    }

    @Test
    fun `un autre 429 reste un encombrement qui se rejoue`() = runTest {
        coEvery { postApi.create(post, "cmid_post") } throws tooMany("""{"success":false,"code":"RATE_LIMITED"}""")
        coEvery { postApi.createStory(story) } throws tooMany("{}")

        assertThat(postHandler.send(postRow())).isEqualTo(SendResult.TransientFailure)
        assertThat(storyHandler.send(storyRow())).isEqualTo(SendResult.TransientFailure)
    }
}
