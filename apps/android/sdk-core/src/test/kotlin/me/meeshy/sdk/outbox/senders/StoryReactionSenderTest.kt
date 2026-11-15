package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.StoryLikeRequest
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.StoryReactionPayload
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class StoryReactionSenderTest {

    private val storyApi = mockk<StoryApi>()
    private val handler = ReactStoryHandler(storyApi, senderJson)

    private fun row() = outboxRow(OutboxKind.REACT_STORY, targetId = "s1", payload = encodedPayload(StoryReactionPayload("🔥")))

    private fun refusal(status: Int, code: String) =
        HttpException(Response.error<Unit>(status, """{"success":false,"error":"no","code":"$code"}""".toResponseBody()))

    @Test
    fun `the queued reaction is posted on its story with its emoji`() = runTest {
        coEvery { storyApi.react("s1", StoryLikeRequest("🔥")) } returns accepted(Unit)

        assertThat(handler.send(row())).isEqualTo(SendResult.Success)

        coVerify(exactly = 1) { storyApi.react("s1", StoryLikeRequest("🔥")) }
    }

    @Test
    fun `offline and server faults replay the reaction`() = runTest {
        coEvery { storyApi.react(any(), any()) } throws IOException("offline")
        assertThat(handler.send(row())).isNotInstanceOf(SendResult.PermanentFailure::class.java)
        coEvery { storyApi.react(any(), any()) } throws refusal(503, "UNAVAILABLE")
        assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `the 409 limit reached refusal is final, replaying it would meet it again`() = runTest {
        coEvery { storyApi.react(any(), any()) } throws refusal(409, "REACTION_LIMIT_REACHED")

        assertThat(handler.send(row())).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `a story that is gone is final`() = runTest {
        coEvery { storyApi.react(any(), any()) } throws refusal(404, "POST_NOT_FOUND")

        assertThat(handler.send(row())).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `an unreadable payload is never replayed`() = runTest {
        val broken = outboxRow(OutboxKind.REACT_STORY, targetId = "s1", payload = "nope")

        assertThat(handler.send(broken)).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
