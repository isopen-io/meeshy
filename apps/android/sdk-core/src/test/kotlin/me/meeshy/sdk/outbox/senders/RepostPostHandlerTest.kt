package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.RepostPostRequest
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.RepostPayload
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.story.StoryRepository
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class RepostPostHandlerTest {

    private val postApi = mockk<PostApi>()
    private val stories = mockk<StoryRepository>(relaxed = true)
    private val handler = RepostPostHandler(postApi, senderJson, stories)

    private fun row(type: String = "STORY") = outboxRow(
        OutboxKind.REPOST_POST,
        targetId = "s1",
        cmid = "cmid_r1",
        payload = senderJson.encodeToString(RepostPayload.serializer(), RepostPayload(targetType = type)),
    )

    private fun refusal(status: Int, body: String = "{}") = HttpException(Response.error<ApiPost>(status, body.toResponseBody()))

    @Test
    fun `a queued republication leaves under its own token, so a replay never republishes twice`() = runTest {
        coEvery { postApi.repost("s1", RepostPostRequest(targetType = "REEL"), "cmid_r1") } returns accepted(ApiPost(id = "rp1", type = "REEL"))

        assertThat(handler.send(row("REEL"))).isEqualTo(SendResult.Success)
        assertThat(handler.send(row("REEL"))).isEqualTo(SendResult.Success)

        coVerify(exactly = 2) { postApi.repost("s1", RepostPostRequest(targetType = "REEL"), "cmid_r1") }
    }

    @Test
    fun `a story republished as a story joins the tray`() = runTest {
        val post = ApiPost(id = "rp1", type = "STORY")
        coEvery { postApi.repost(any(), any(), any()) } returns accepted(post)

        handler.send(row("STORY"))

        coVerify(exactly = 1) { stories.adoptRepost(post) }
    }

    @Test
    fun `offline, rate limit or a server fault replay the republication`() = runTest {
        coEvery { postApi.repost(any(), any(), any()) } throws IOException("offline")
        assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
        listOf(401, 408, 429, 500, 503).forEach {
            coEvery { postApi.repost(any(), any(), any()) } throws refusal(it)
            assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `a gone source or a widened audience is final when the gateway says it, a proxy 404 is not`() = runTest {
        listOf(404 to "SOURCE_NOT_FOUND", 403 to "REPOST_AUDIENCE_WIDENING").forEach { (status, code) ->
            coEvery { postApi.repost(any(), any(), any()) } throws refusal(status, """{"success":false,"error":"no","code":"$code"}""")
            assertThat(handler.send(row())).isInstanceOf(SendResult.PermanentFailure::class.java)
        }
        coEvery { postApi.repost(any(), any(), any()) } throws refusal(404, "<html>proxy</html>")
        assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `a payload that does not decode is final`() = runTest {
        val broken = outboxRow(OutboxKind.REPOST_POST, targetId = "s1", payload = "nope")

        assertThat(handler.send(broken)).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
