package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.model.DeletionAcknowledgement
import me.meeshy.sdk.model.MarkedCountResult
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContentRemovalClient
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.api.MessageChatRestApi
import me.meeshy.sdk.outbox.MessageHidingPayload
import me.meeshy.sdk.outbox.ModerationDeletePayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.RemoveAttachmentPayload
import me.meeshy.sdk.outbox.SendResult
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** Un test par genre : le succès, le 404 (déjà fait) et le refus définitif qui défait l'effet local. */
class OutboxChatKindsTest {

    private val messageApi = mockk<MessageChatRestApi>()
    private val mediaApi = mockk<MediaApi>()
    private val conversationApi = mockk<ConversationApi>()
    private val removals = mockk<ContentRemovalClient>()
    private val messages = mockk<MessageRepository>(relaxed = true)

    private val hiding = encodedPayload(MessageHidingPayload("c1"))

    private fun refusal(status: Int, body: String = """{"success":false,"error":"x","code":"GONE"}""") =
        HttpException(Response.error<ApiResponse<JsonElement>>(status, body.toResponseBody()))

    private fun failure(status: Int, code: String?) = NetworkResult.Failure(ApiError(message = "x", code = code, httpStatus = status))

    private val ack: ApiResponse<JsonElement> = ApiResponse(success = true)

    @Test
    fun `hide for me succeeds on an acknowledgement without data`() = runTest {
        coEvery { messageApi.hideForMe("m1") } returns ack

        val result = HideForMeHandler(messageApi, messages, senderJson).send(outboxRow(OutboxKind.HIDE_FOR_ME, "m1", hiding))

        assertThat(result).isEqualTo(SendResult.Success)
    }

    @Test
    fun `hide for me treats a gateway 404 as already done`() = runTest {
        coEvery { messageApi.hideForMe("m1") } throws refusal(404, """{"success":false,"error":"nope","code":"NOT_FOUND"}""")

        val result = HideForMeHandler(messageApi, messages, senderJson).send(outboxRow(OutboxKind.HIDE_FOR_ME, "m1", hiding))

        assertThat(result).isEqualTo(SendResult.Success)
    }

    @Test
    fun `hide for me keeps a proxy 404 retryable, a 403 permanent and a 503 retryable`() = runTest {
        val handler = HideForMeHandler(messageApi, messages, senderJson)
        val row = outboxRow(OutboxKind.HIDE_FOR_ME, "m1", hiding)

        coEvery { messageApi.hideForMe("m1") } throws refusal(403)
        assertThat(handler.send(row)).isInstanceOf(SendResult.PermanentFailure::class.java)

        coEvery { messageApi.hideForMe("m1") } throws refusal(503)
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)

        coEvery { messageApi.hideForMe("m1") } throws refusal(404, "")
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `a refused hide lifts the tombstone and rereads the conversation`() = runTest {
        HideForMeHandler(messageApi, messages, senderJson).onExhausted(outboxRow(OutboxKind.HIDE_FOR_ME, "m1", hiding))

        coVerify(exactly = 1) { messages.markUndeleted("m1") }
        coVerify(exactly = 1) { messages.refresh("c1") }
    }

    @Test
    fun `restore for me succeeds then rereads the conversation to bring the message back`() = runTest {
        coEvery { messageApi.restoreForMe("m1") } returns ack

        val result = RestoreForMeHandler(messageApi, messages, senderJson).send(outboxRow(OutboxKind.RESTORE_FOR_ME, "m1", hiding))

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { messages.refresh("c1") }
    }

    @Test
    fun `a refused restore rereads the conversation and a failed one does not`() = runTest {
        val handler = RestoreForMeHandler(messageApi, messages, senderJson)
        coEvery { messageApi.restoreForMe("m1") } throws refusal(403)

        val result = handler.send(outboxRow(OutboxKind.RESTORE_FOR_ME, "m1", hiding))
        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { messages.refresh(any()) }

        handler.onExhausted(outboxRow(OutboxKind.RESTORE_FOR_ME, "m1", hiding))
        coVerify(exactly = 1) { messages.refresh("c1") }
    }

    @Test
    fun `remove attachment deletes the piece and a 404 is a success`() = runTest {
        val handler = RemoveAttachmentHandler(mediaApi, messages, senderJson)
        val row = outboxRow(OutboxKind.REMOVE_ATTACHMENT, "a1", encodedPayload(RemoveAttachmentPayload("c1", "m1")))

        coEvery { mediaApi.delete("a1") } returns ack
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { mediaApi.delete("a1") } throws refusal(404, """{"success":false,"error":"nope","code":"NOT_FOUND"}""")
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)
    }

    @Test
    fun `a refused attachment removal rereads the conversation so the piece comes back`() = runTest {
        val row = outboxRow(OutboxKind.REMOVE_ATTACHMENT, "a1", encodedPayload(RemoveAttachmentPayload("c1", "m1")))

        RemoveAttachmentHandler(mediaApi, messages, senderJson).onExhausted(row)

        coVerify(exactly = 1) { messages.refresh("c1") }
    }

    @Test
    fun `moderation delete sends the reason and a 410 means already applied`() = runTest {
        val handler = ModerationDeleteHandler(removals, messages, senderJson)
        val row = outboxRow(OutboxKind.MODERATION_DELETE, "m1", encodedPayload(ModerationDeletePayload("c1", "spam")))

        coEvery { removals.removeMessage("m1", ContentRemovalRequest("spam")) } returns NetworkResult.Success(DeletionAcknowledgement())
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { removals.removeMessage("m1", ContentRemovalRequest("spam")) } returns failure(410, "GONE")
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)
    }

    @Test
    fun `a refused moderation delete lifts the tombstone and rereads the conversation`() = runTest {
        val row = outboxRow(OutboxKind.MODERATION_DELETE, "m1", encodedPayload(ModerationDeletePayload("c1", "spam")))

        ModerationDeleteHandler(removals, messages, senderJson).onExhausted(row)

        coVerify(exactly = 1) { messages.markUndeleted("m1") }
        coVerify(exactly = 1) { messages.refresh("c1") }
    }

    @Test
    fun `a moderation payload that does not decode is permanent`() = runTest {
        val result = ModerationDeleteHandler(removals, messages, senderJson)
            .send(outboxRow(OutboxKind.MODERATION_DELETE, "m1", "nope"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `mark received posts the delivery cursor of the conversation`() = runTest {
        coEvery { conversationApi.markReceived("c1") } returns ApiResponse(success = true, data = MarkedCountResult(3))

        val result = MarkReceivedHandler(conversationApi).send(outboxRow(OutboxKind.MARK_RECEIVED, "c1"))

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { conversationApi.markReceived("c1") }
    }

    @Test
    fun `mark received is retried on a rate limit and refused for good on a 403`() = runTest {
        val handler = MarkReceivedHandler(conversationApi)
        val row = outboxRow(OutboxKind.MARK_RECEIVED, "c1")

        coEvery { conversationApi.markReceived("c1") } throws refusal(429, """{"success":false,"error":"slow","code":"RATE_LIMITED"}""")
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)

        coEvery { conversationApi.markReceived("c1") } throws refusal(403)
        assertThat(handler.send(row)).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
