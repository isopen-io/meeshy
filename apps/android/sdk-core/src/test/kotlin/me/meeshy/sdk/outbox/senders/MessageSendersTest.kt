package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.PinPayload
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test
import java.io.IOException

class MessageSendersTest {

    private val messageApi = mockk<MessageApi>()
    private val messageRepository = mockk<MessageRepository>(relaxed = true)

    private val sendRequest = SendMessageRequest(
        content = "salut",
        originalLanguage = "fr",
        clientMessageId = "cmid-1",
    )
    private val serverMessage = ApiMessage(id = "srv-1", conversationId = "c1")

    private fun sendHandler() = SendMessageHandler(messageApi, messageRepository, senderJson)

    private fun sendRow(payload: String = encodedPayload(sendRequest)) =
        outboxRow(OutboxKind.SEND_MESSAGE, targetId = "c1", payload = payload)

    @Test
    fun `send message delivers the queued request and reconciles the bubble with the server copy`() = runTest {
        coEvery { messageApi.send("c1", sendRequest) } returns accepted(serverMessage)

        val result = sendHandler().send(sendRow())

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { messageRepository.reconcileSent("cmid-1", serverMessage) }
    }

    @Test
    fun `send message stays retryable and reconciles nothing when the gateway refuses`() = runTest {
        coEvery { messageApi.send(any(), any()) } returns refused()

        val result = sendHandler().send(sendRow())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { messageRepository.reconcileSent(any(), any()) }
    }

    @Test
    fun `send message stays retryable when the network is down`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws IOException("offline")

        assertThat(sendHandler().send(sendRow())).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `send message with an undecodable payload fails permanently without calling the gateway`() = runTest {
        val result = sendHandler().send(sendRow(payload = "not json"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat((result as SendResult.PermanentFailure).reason).startsWith("Bad payload")
        coVerify(exactly = 0) { messageApi.send(any(), any()) }
    }

    @Test
    fun `send message owns the graft that swaps an upload placeholder for the real attachment id`() {
        val queued = encodedPayload(sendRequest.copy(attachmentIds = listOf("upload-cmid")))

        val grafted = sendHandler().payloadGraft?.invoke(queued, "upload-cmid", "media-77")

        val request = senderJson.decodeFromString<SendMessageRequest>(grafted.orEmpty())
        assertThat(request.attachmentIds).containsExactly("media-77")
    }

    @Test
    fun `send message graft declines a payload that carries no such placeholder`() {
        val queued = encodedPayload(sendRequest.copy(attachmentIds = listOf("other")))

        assertThat(sendHandler().payloadGraft?.invoke(queued, "upload-cmid", "media-77")).isNull()
    }

    @Test
    fun `edit message patches the content and maps the outcome`() = runTest {
        val body = EditMessageRequest(content = "corrigé")
        val handler = EditMessageHandler(messageApi, senderJson)
        val row = outboxRow(OutboxKind.EDIT_MESSAGE, targetId = "m1", payload = encodedPayload(body))
        coEvery { messageApi.edit("m1", body) } returns accepted(serverMessage)

        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { messageApi.edit("m1", body) } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `edit message with an undecodable payload fails permanently`() = runTest {
        val handler = EditMessageHandler(messageApi, senderJson)

        val result = handler.send(outboxRow(OutboxKind.EDIT_MESSAGE, payload = "{"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `delete message maps an accepted call to success and any failure to retryable`() = runTest {
        val handler = DeleteMessageHandler(messageApi)
        val row = outboxRow(OutboxKind.DELETE_MESSAGE, targetId = "m1")

        coEvery { messageApi.delete("m1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { messageApi.delete("m1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)

        coEvery { messageApi.delete("m1") } throws IOException("offline")
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `pin message sends the conversation id from the payload with the message id as target`() = runTest {
        val handler = PinMessageHandler(messageApi, messageRepository, senderJson)
        val row = outboxRow(OutboxKind.PIN_MESSAGE, targetId = "m1", payload = encodedPayload(PinPayload("c1")))

        coEvery { messageApi.pin("c1", "m1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { messageApi.pin("c1", "m1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `unpin message sends the conversation id from the payload with the message id as target`() = runTest {
        val handler = UnpinMessageHandler(messageApi, messageRepository, senderJson)
        val row = outboxRow(OutboxKind.UNPIN_MESSAGE, targetId = "m1", payload = encodedPayload(PinPayload("c1")))

        coEvery { messageApi.unpin("c1", "m1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { messageApi.unpin("c1", "m1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `pin and unpin fail permanently on an undecodable payload`() = runTest {
        val pin = PinMessageHandler(messageApi, messageRepository, senderJson)
        val unpin = UnpinMessageHandler(messageApi, messageRepository, senderJson)

        assertThat(pin.send(outboxRow(OutboxKind.PIN_MESSAGE, payload = "{}")))
            .isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat(unpin.send(outboxRow(OutboxKind.UNPIN_MESSAGE, payload = "")))
            .isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
