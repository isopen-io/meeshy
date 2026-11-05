package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.model.socket.SendMessageAck
import me.meeshy.sdk.model.socket.SocketAckCodes
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageSocketSenderTest {

    private class FakeTransport(
        override var isConnected: Boolean = true,
        val reply: ((ack: (Array<Any>) -> Unit) -> Unit)? = null,
    ) : AckTransport {
        val emitted = mutableListOf<Pair<String, JSONObject>>()
        override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
            emitted += event to data
            reply?.invoke(ack)
        }
    }

    private val request = SendMessageRequest(content = "salut", originalLanguage = "fr", clientMessageId = "cid_1")

    private fun sender(transport: FakeTransport) = MessageSocketSender(SocketAckEmitter(transport))

    @Test
    fun `l'accuse rend messageId clientMessageId et createdAt`() = runTest {
        val transport = FakeTransport { ack ->
            ack(arrayOf(JSONObject("""{"success":true,"data":{"messageId":"m1","clientMessageId":"cid_1","createdAt":"2026-11-03T10:00:00.000Z"}}""")))
        }

        val outcome = sender(transport).send("c1", request)

        assertThat(outcome).isEqualTo(MessageSocketOutcome.Acked(SendMessageAck("m1", "cid_1", "2026-11-03T10:00:00.000Z")))
        assertThat(transport.emitted.single().first).isEqualTo(SocketEventNames.MESSAGE_SEND)
        assertThat(transport.emitted.single().second.getString("clientMessageId")).isEqualTo("cid_1")
    }

    @Test
    fun `un message avec pieces jointes part par send-with-attachments`() = runTest {
        val transport = FakeTransport { ack -> ack(arrayOf(JSONObject("""{"success":true,"data":{"messageId":"m1"}}"""))) }

        sender(transport).send("c1", request.copy(attachmentIds = listOf("a1")))

        assertThat(transport.emitted.single().first).isEqualTo(SocketEventNames.MESSAGE_SEND_WITH_ATTACHMENTS)
    }

    @Test
    fun `un texte chiffre n'est jamais emis`() = runTest {
        val transport = FakeTransport()

        val outcome = sender(transport).send("c1", request.copy(isEncrypted = true))

        assertThat(outcome).isEqualTo(MessageSocketOutcome.NotSent)
        assertThat(transport.emitted).isEmpty()
    }

    @Test
    fun `sans accuse en 10 secondes l'issue est sans reponse`() = runTest {
        val transport = FakeTransport()
        var outcome: MessageSocketOutcome? = null
        val job = launch { outcome = sender(transport).send("c1", request) }
        advanceTimeBy(9_999); runCurrent()
        assertThat(outcome).isNull()
        advanceTimeBy(2); runCurrent()
        assertThat(outcome).isEqualTo(MessageSocketOutcome.Unanswered)
        job.cancel()
    }

    @Test
    fun `une socket absente laisse la ligne en file sans la deviner definitive`() = runTest {
        val outcome = sender(FakeTransport(isConnected = false)).send("c1", request)

        assertThat((outcome as MessageSocketOutcome.Refused).definitive).isFalse()
    }

    @Test
    fun `conversation fermee et non-participant sont des refus definitifs`() = runTest {
        for (code in listOf(SocketAckCodes.CONVERSATION_CLOSED, SocketAckCodes.NOT_A_PARTICIPANT)) {
            val transport = FakeTransport { ack -> ack(arrayOf(JSONObject("""{"success":false,"code":"$code"}"""))) }

            val outcome = sender(transport).send("c1", request)

            assertThat((outcome as MessageSocketOutcome.Refused).definitive).isTrue()
        }
    }

    @Test
    fun `le meme clientMessageId sert a chaque emission donc le rejeu ne duplique pas`() = runTest {
        val transport = FakeTransport { ack -> ack(arrayOf(JSONObject("""{"success":true,"data":{"messageId":"m1"}}"""))) }
        val sender = sender(transport)

        sender.send("c1", request)
        sender.send("c1", request)

        assertThat(transport.emitted.map { it.second.getString("clientMessageId") }).containsExactly("cid_1", "cid_1")
    }
}
