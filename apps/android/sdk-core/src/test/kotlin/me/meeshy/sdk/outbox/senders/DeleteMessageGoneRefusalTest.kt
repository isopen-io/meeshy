package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.SendFailureClassifier
import me.meeshy.sdk.outbox.SendResult
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/**
 * Audit #19352 (A6) — the 404 the gateway serves on `DELETE /messages/:id` for a message it no longer has
 * (`services/gateway/src/routes/messages-writes.ts`, `sendNotFound(reply, 'Message non trouvé', { code: 'MESSAGE_NOT_FOUND' })`),
 * body for body, through the real [DeleteMessageHandler]: a definitive refusal that says the target is gone, never five
 * retries followed by a message brought back. A bare 404 (a proxy while the gateway restarts) is still retried.
 */
class DeleteMessageGoneRefusalTest {

    private val messageRepository = mockk<MessageRepository>(relaxed = true)
    private val row = outboxRow(OutboxKind.DELETE_MESSAGE, targetId = "m1", lane = OutboxLanes.forMessage("c1"))

    private fun handlerAnswering(status: Int, body: String): DeleteMessageHandler {
        val api = mockk<MessageApi> {
            coEvery { delete("m1") } throws HttpException(Response.error<ApiResponse<Unit>>(status, body.toResponseBody()))
        }
        return DeleteMessageHandler(api, messageRepository)
    }

    @Test
    fun `the gateway's 404 on a deletion is final and is read back as gone when the row is exhausted`() = runTest {
        val handler = handlerAnswering(404, """{"success":false,"error":"Message non trouvé","code":"MESSAGE_NOT_FOUND"}""")

        val result = handler.send(row)

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        val reason = (result as SendResult.PermanentFailure).reason
        assertThat(SendFailureClassifier.refusedAsGone(reason)).isTrue()

        handler.onExhausted(row.copy(lastError = reason))

        coVerify(exactly = 1) { messageRepository.settleRefusedDeletion("c1", "m1", refusedAsGone = true) }
        coVerify(exactly = 0) { messageRepository.confirmDeletion(any()) }
    }

    @Test
    fun `a 404 that does not come from the gateway is retried`() = runTest {
        val handler = handlerAnswering(404, "404 page not found")

        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }
}
