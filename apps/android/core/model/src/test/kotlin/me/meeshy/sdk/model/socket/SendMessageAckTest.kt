package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

class SendMessageAckTest {

    private fun payload(text: String) = Json.parseToJsonElement(text).jsonObject

    @Test
    fun `l'accusé rend messageId clientMessageId et createdAt`() {
        val ack = SendMessageAck.from(payload("""{"messageId":"m1","clientMessageId":"cid_1","createdAt":"2026-11-03T10:00:00.000Z"}"""), "cid_x")

        assertThat(ack).isEqualTo(SendMessageAck("m1", "cid_1", "2026-11-03T10:00:00.000Z"))
    }

    @Test
    fun `une vieille passerelle sans écho reprend le clientMessageId de la requête`() {
        val ack = SendMessageAck.from(payload("""{"messageId":"m1"}"""), "cid_x")

        assertThat(ack).isEqualTo(SendMessageAck("m1", "cid_x", null))
    }

    @Test
    fun `sans messageId il n'y a pas d'accusé`() {
        assertThat(SendMessageAck.from(payload("""{"clientMessageId":"c"}"""), "cid_x")).isNull()
        assertThat(SendMessageAck.from(null, "cid_x")).isNull()
    }

    @Test
    fun `la bulle optimiste prend l'identifiant et l'horloge du serveur`() {
        val bubble = ApiMessage(id = "cid_1", conversationId = "c1", content = "salut", createdAt = "local")

        val reconciled = bubble.acknowledgedBy(SendMessageAck("m1", "cid_1", "server"))

        assertThat(reconciled.id).isEqualTo("m1")
        assertThat(reconciled.createdAt).isEqualTo("server")
        assertThat(reconciled.content).isEqualTo("salut")
    }

    @Test
    fun `sans horloge serveur la bulle garde la sienne`() {
        val bubble = ApiMessage(id = "cid_1", conversationId = "c1", createdAt = "local")

        assertThat(bubble.acknowledgedBy(SendMessageAck("m1", null)).createdAt).isEqualTo("local")
    }

    @Test
    fun `le repli n'est permis que pour un échec réseau ou un 5xx`() {
        assertThat(SocketSendFallbackPolicy.allowsFallback(null, "NETWORK")).isTrue()
        assertThat(SocketSendFallbackPolicy.allowsFallback(503, null)).isTrue()
        assertThat(SocketSendFallbackPolicy.allowsFallback(500, "X")).isTrue()
        assertThat(SocketSendFallbackPolicy.allowsFallback(400, null)).isFalse()
        assertThat(SocketSendFallbackPolicy.allowsFallback(429, null)).isFalse()
        assertThat(SocketSendFallbackPolicy.allowsFallback(409, null)).isFalse()
        assertThat(SocketSendFallbackPolicy.allowsFallback(null, null)).isFalse()
    }

    @Test
    fun `seuls conversation fermée et non-participant sont définitifs`() {
        assertThat(SocketSendFallbackPolicy.isDefinitive(SocketAckRefusal(code = SocketAckCodes.CONVERSATION_CLOSED))).isTrue()
        assertThat(SocketSendFallbackPolicy.isDefinitive(SocketAckRefusal(code = SocketAckCodes.NOT_A_PARTICIPANT))).isTrue()
        assertThat(SocketSendFallbackPolicy.isDefinitive(SocketAckRefusal(code = SocketAckCodes.RATE_LIMITED))).isFalse()
        assertThat(SocketSendFallbackPolicy.isDefinitive(SocketAckRefusal.NO_SOCKET)).isFalse()
    }
}
