package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.model.send.AttachmentRightRefusal
import me.meeshy.sdk.model.socket.SendMessageAck
import me.meeshy.sdk.model.socket.SocketAckCodes
import me.meeshy.sdk.model.socket.SocketAckRefusal
import me.meeshy.sdk.model.socket.SocketSendFallbackPolicy
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.socket.MessageSocketOutcome
import me.meeshy.sdk.socket.MessageSocketSending
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class OutboxFlushWorkerSocketFallbackTest {

    private val messageApi = mockk<MessageApi>()
    private val messageRepository = mockk<MessageRepository>(relaxed = true)
    private val request = SendMessageRequest(content = "salut", originalLanguage = "fr", clientMessageId = "cid_1")
    private val ack = SendMessageAck("srv-1", "cid_1", "2026-11-03T10:00:00.000Z")

    private class RecordingSocket(private val outcome: MessageSocketOutcome) : MessageSocketSending {
        val sent = mutableListOf<Pair<String, SendMessageRequest>>()
        override suspend fun send(conversationId: String, request: SendMessageRequest): MessageSocketOutcome {
            sent += conversationId to request
            return outcome
        }
    }

    private fun handler(socket: MessageSocketSending) =
        SendMessageHandler(messageApi, messageRepository, senderJson, InMemoryEndToEndRegimeLedger(), socketFallback = socket)

    private fun row() = outboxRow(OutboxKind.SEND_MESSAGE, targetId = "c1", payload = encodedPayload(request))

    private fun http(status: Int, code: String = "VALIDATION_ERROR") = HttpException(Response.error<Any>(status, """{"success":false,"error":"refus","code":"$code"}""".toResponseBody("application/json".toMediaTypeOrNull())))

    @Test
    fun `un 5xx du REST bascule sur la socket avec le meme clientMessageId et reconcilie sur l'accuse`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(503)
        val socket = RecordingSocket(MessageSocketOutcome.Acked(ack))

        val result = handler(socket).send(row())

        assertThat(result).isInstanceOf(SendResult.SuccessWithId::class.java)
        assertThat(socket.sent).containsExactly("c1" to request)
        coVerify(exactly = 1) { messageRepository.reconcileAcknowledged("cmid-1", ack) }
    }

    @Test
    fun `un echec reseau du REST bascule sur la socket`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws IOException("down")
        val socket = RecordingSocket(MessageSocketOutcome.Acked(ack))

        assertThat(handler(socket).send(row())).isInstanceOf(SendResult.SuccessWithId::class.java)
        assertThat(socket.sent).hasSize(1)
    }

    @Test
    fun `un 4xx du REST n'essaie jamais la socket`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(400)
        val socket = RecordingSocket(MessageSocketOutcome.Acked(ack))

        val result = handler(socket).send(row())

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat(socket.sent).isEmpty()
        coVerify(exactly = 0) { messageRepository.reconcileAcknowledged(any(), any()) }
    }

    @Test
    fun `un 429 du REST n'essaie pas la socket et reste en file`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(429)
        val socket = RecordingSocket(MessageSocketOutcome.Acked(ack))

        assertThat(handler(socket).send(row())).isEqualTo(SendResult.TransientFailure)
        assertThat(socket.sent).isEmpty()
    }

    @Test
    fun `sans accuse la ligne reste en file avec le resultat du REST`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(502)

        val result = handler(RecordingSocket(MessageSocketOutcome.Unanswered)).send(row())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { messageRepository.reconcileAcknowledged(any(), any()) }
    }

    @Test
    fun `un texte non emis par la socket reste en file`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(500)

        assertThat(handler(RecordingSocket(MessageSocketOutcome.NotSent)).send(row())).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `un refus definitif de la socket abandonne la ligne`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(500)
        val refusal = SocketAckRefusal(code = SocketAckCodes.CONVERSATION_CLOSED)

        val result = handler(RecordingSocket(MessageSocketOutcome.Refused(refusal, definitive = true))).send(row())

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `un refus transitoire de la socket laisse la ligne en file`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(500)
        val refusal = SocketAckRefusal(code = SocketAckCodes.RATE_LIMITED)

        val result = handler(RecordingSocket(MessageSocketOutcome.Refused(refusal, definitive = false))).send(row())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `#16053 un 403 REST ATTACHMENT_RIGHT_NOT_PERMITTED est definitif, sans socket, et sa raison le dit`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(403, AttachmentRightRefusal.CODE)
        val socket = RecordingSocket(MessageSocketOutcome.Acked(ack))

        val result = handler(socket).send(row())

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat(AttachmentRightRefusal.isReason((result as SendResult.PermanentFailure).reason)).isTrue()
        assertThat(socket.sent).isEmpty()
    }

    @Test
    fun `#16053 l'acquittement socket ATTACHMENT_RIGHT_NOT_PERMITTED abandonne la ligne et sa raison le dit`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws http(503)
        val refusal = SocketAckRefusal(code = AttachmentRightRefusal.CODE)

        val result = handler(RecordingSocket(MessageSocketOutcome.Refused(refusal, SocketSendFallbackPolicy.isDefinitive(refusal)))).send(row())

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat(AttachmentRightRefusal.isReason((result as SendResult.PermanentFailure).reason)).isTrue()
    }

    @Test
    fun `un REST reussi n'emet rien sur la socket`() = runTest {
        coEvery { messageApi.send(any(), any()) } returns accepted(ApiMessage(id = "srv-1", conversationId = "c1"))
        val socket = RecordingSocket(MessageSocketOutcome.Acked(ack))

        assertThat(handler(socket).send(row())).isInstanceOf(SendResult.SuccessWithId::class.java)
        assertThat(socket.sent).isEmpty()
    }
}
