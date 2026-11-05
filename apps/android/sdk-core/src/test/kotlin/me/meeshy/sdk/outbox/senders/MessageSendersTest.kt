package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxPlaintextAdmission
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.api.EditMessageRequest
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.PinPayload
import me.meeshy.sdk.outbox.SendAttemptRecorder
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.model.SendOutcome
import me.meeshy.sdk.model.SendTransport
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

    private val ledger = InMemoryEndToEndRegimeLedger()

    private fun sendHandler() = SendMessageHandler(messageApi, messageRepository, senderJson, ledger)

    private fun sendRow(payload: String = encodedPayload(sendRequest)) =
        outboxRow(OutboxKind.SEND_MESSAGE, targetId = "c1", payload = payload)

    @Test
    fun `send message delivers the queued request and reconciles the bubble with the server copy`() = runTest {
        coEvery { messageApi.send("c1", sendRequest) } returns accepted(serverMessage)

        val result = sendHandler().send(sendRow())

        assertThat(result).isInstanceOf(SendResult.SuccessWithId::class.java)
        coVerify(exactly = 1) { messageRepository.reconcileSent("cmid-1", serverMessage) }
    }

    private val originCid = "cid_11111111-1111-4111-8111-111111111111"

    private fun fanoutRow() = sendRow(
        encodedPayload(sendRequest.copy(copyAttachmentsFromMessageId = originCid)),
    )

    @Test
    fun `une cible de fan-out dont l'origine n'est pas acquittee attend, sans rien envoyer`() = runTest {
        coEvery { messageRepository.serverIdOf(originCid) } returns null

        val result = sendHandler().send(fanoutRow())

        assertThat(result).isInstanceOf(SendResult.Deferred::class.java)
        coVerify(exactly = 0) { messageApi.send(any(), any()) }
    }

    @Test
    fun `une cible de fan-out dont l'origine est acquittee reclame la copie par l'id serveur`() = runTest {
        coEvery { messageRepository.serverIdOf(originCid) } returns "srv-origin"
        val expected = sendRequest.copy(copyAttachmentsFromMessageId = "srv-origin")
        coEvery { messageApi.send("c1", expected) } returns accepted(serverMessage)

        assertThat(sendHandler().send(fanoutRow())).isEqualTo(SendResult.SuccessWithId("srv-1"))
    }

    @Test
    fun `une cible deja greffee d'un id serveur part telle quelle`() = runTest {
        val grafted = sendRequest.copy(copyAttachmentsFromMessageId = "srv-origin")
        coEvery { messageApi.send("c1", grafted) } returns accepted(serverMessage)

        assertThat(sendHandler().send(sendRow(encodedPayload(grafted)))).isInstanceOf(SendResult.SuccessWithId::class.java)
    }

    @Test
    fun `chaque envoi journalise sa tentative avec le transport et l issue`() = runTest {
        val logged = mutableListOf<List<Any?>>()
        val recorder = object : SendAttemptRecorder {
            override suspend fun record(
                localId: String,
                transport: SendTransport,
                startedAtMillis: Long,
                finishedAtMillis: Long,
                outcome: SendOutcome,
                errorMessage: String?,
            ) {
                logged += listOf(localId, transport, outcome, errorMessage)
            }
        }
        val handler = SendMessageHandler(messageApi, messageRepository, senderJson, ledger, attempts = recorder)
        coEvery { messageApi.send(any(), any()) } returns refused() andThen accepted(serverMessage)

        handler.send(sendRow())
        handler.send(sendRow().copy(attempts = 1))

        assertThat(logged.map { it.take(3) }).containsExactly(
            listOf("cmid-1", SendTransport.REST, SendOutcome.FAILURE),
            listOf("cmid-1", SendTransport.OUTBOX, SendOutcome.SUCCESS),
        ).inOrder()
        assertThat(logged.first()[3]).isNotNull()
        assertThat(logged.last()[3]).isNull()
    }

    @Test
    fun `send message stays retryable and reconciles nothing when the gateway refuses`() = runTest {
        coEvery { messageApi.send(any(), any()) } returns refused()

        val result = sendHandler().send(sendRow())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { messageRepository.reconcileSent(any(), any()) }
    }

    @Test
    fun `un clair refuse par la passerelle pour chiffrement de bout en bout scelle la conversation et n'est jamais renvoye`() = runTest {
        coEvery { messageApi.send(any(), any()) } returns ApiResponse(success = false, error = "chiffree", code = "E2EE_PLAINTEXT_REFUSED")

        val result = sendHandler().send(sendRow())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_END_TO_END))
        assertThat(ledger.isSealed("c1")).isTrue()
    }

    @Test
    fun `une modification en clair refusee pour chiffrement de bout en bout scelle la conversation de sa file`() = runTest {
        coEvery { messageApi.edit(any(), any()) } returns ApiResponse(success = false, error = "chiffree", code = "E2EE_PLAINTEXT_REFUSED")
        val row = outboxRow(
            OutboxKind.EDIT_MESSAGE,
            targetId = "m1",
            payload = encodedPayload(EditMessageRequest(content = "corrige")),
            lane = OutboxLanes.forMessage("c9"),
        )

        val result = EditMessageHandler(messageApi, senderJson, ledger).send(row)

        assertThat(result).isEqualTo(SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_END_TO_END))
        assertThat(ledger.isSealed("c9")).isTrue()
    }

    @Test
    fun `send message stays retryable when the network is down`() = runTest {
        coEvery { messageApi.send(any(), any()) } throws IOException("offline")

        assertThat(sendHandler().send(sendRow())).isEqualTo(SendResult.TransportFailure)
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
        val handler = DeleteMessageHandler(messageApi, messageRepository, ledger)
        val row = outboxRow(OutboxKind.DELETE_MESSAGE, targetId = "m1")

        coEvery { messageApi.delete("m1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { messageApi.delete("m1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)

        coEvery { messageApi.delete("m1") } throws IOException("offline")
        assertThat(handler.send(row)).isEqualTo(SendResult.TransportFailure)
    }

    /** #14656 — only an ACCEPTED deletion lets the end-to-end plaintext leave the vault. */
    @Test
    fun `delete message confirms the erasure only once the server accepted it`() = runTest {
        val handler = DeleteMessageHandler(messageApi, messageRepository, ledger)
        val row = outboxRow(OutboxKind.DELETE_MESSAGE, targetId = "m1")

        coEvery { messageApi.delete("m1") } returns refused()
        handler.send(row)
        coVerify(exactly = 0) { messageRepository.confirmDeletion(any()) }

        coEvery { messageApi.delete("m1") } returns accepted(Unit)
        handler.send(row)
        coVerify(exactly = 1) { messageRepository.confirmDeletion("m1") }
    }

    @Test
    fun `pin message sends the conversation id from the payload with the message id as target`() = runTest {
        val handler = PinMessageHandler(messageApi, messageRepository, senderJson, ledger)
        val row = outboxRow(OutboxKind.PIN_MESSAGE, targetId = "m1", payload = encodedPayload(PinPayload("c1")))

        coEvery { messageApi.pin("c1", "m1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { messageApi.pin("c1", "m1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `unpin message sends the conversation id from the payload with the message id as target`() = runTest {
        val handler = UnpinMessageHandler(messageApi, messageRepository, senderJson, ledger)
        val row = outboxRow(OutboxKind.UNPIN_MESSAGE, targetId = "m1", payload = encodedPayload(PinPayload("c1")))

        coEvery { messageApi.unpin("c1", "m1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { messageApi.unpin("c1", "m1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `pin and unpin fail permanently on an undecodable payload`() = runTest {
        val pin = PinMessageHandler(messageApi, messageRepository, senderJson, ledger)
        val unpin = UnpinMessageHandler(messageApi, messageRepository, senderJson, ledger)

        assertThat(pin.send(outboxRow(OutboxKind.PIN_MESSAGE, payload = "{}")))
            .isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat(unpin.send(outboxRow(OutboxKind.UNPIN_MESSAGE, payload = "")))
            .isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `pin, unpin and delete for everyone refused for want of the signal channel are final and seal the conversation`() = runTest {
        val refusal = ApiResponse<Unit>(success = false, error = "canal de signaux requis", code = "E2EE_SIGNAL_CHANNEL_REQUIRED")
        coEvery { messageApi.pin(any(), any()) } returns refusal
        coEvery { messageApi.unpin(any(), any()) } returns refusal
        coEvery { messageApi.delete(any()) } returns refusal
        val final = SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_SIGNAL_CHANNEL_REQUIRED)

        val pinned = PinMessageHandler(messageApi, messageRepository, senderJson, ledger)
            .send(outboxRow(OutboxKind.PIN_MESSAGE, targetId = "m1", payload = encodedPayload(PinPayload("c-pin"))))
        val unpinned = UnpinMessageHandler(messageApi, messageRepository, senderJson, ledger)
            .send(outboxRow(OutboxKind.UNPIN_MESSAGE, targetId = "m1", payload = encodedPayload(PinPayload("c-unpin"))))
        val deleted = DeleteMessageHandler(messageApi, messageRepository, ledger)
            .send(outboxRow(OutboxKind.DELETE_MESSAGE, targetId = "m1", lane = OutboxLanes.forMessage("c-delete")))

        assertThat(listOf(pinned, unpinned, deleted)).containsExactly(final, final, final)
        assertThat(listOf("c-pin", "c-unpin", "c-delete").map(ledger::isSealed)).containsExactly(true, true, true)
    }
}
