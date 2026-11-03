package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckCodes
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
@OptIn(ExperimentalCoroutinesApi::class)
class SocketAckEmitterTest {

    private class FakeTransport(override var isConnected: Boolean = true, val reply: ((Array<Any>) -> Unit) -> Unit = {}) : AckTransport {
        var emitted = 0
        override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
            emitted++
            reply(ack)
        }
    }

    @Test
    fun `un accuse accepte rend sa charge`() = runTest {
        val t = FakeTransport { ack -> ack(arrayOf(JSONObject("""{"success":true,"data":{"id":"x"}}"""))) }
        val ack = SocketAckEmitter(t).emitWithAck("e", JSONObject(), 1_000)
        assertThat((ack as SocketAck.Accepted).payload!!["id"]!!.jsonPrimitive.content).isEqualTo("x")
    }

    @Test
    fun `un refus est rendu avec son code et n'est pas rejoue`() = runTest {
        val t = FakeTransport { ack -> ack(arrayOf(JSONObject("""{"success":false,"code":"RATE_LIMITED","retryAfter":4}"""))) }
        val ack = SocketAckEmitter(t).emitWithAck("e", JSONObject(), 1_000)
        assertThat((ack as SocketAck.Refused).refusal.code).isEqualTo(SocketAckCodes.RATE_LIMITED)
        assertThat(ack.refusal.retryAfter).isEqualTo(4)
        assertThat(t.emitted).isEqualTo(1)
    }

    @Test
    fun `sans accuse apres l'echeance l'issue est Timeout`() = runTest {
        val t = FakeTransport()
        var result: SocketAck<*>? = null
        val job = launch { result = SocketAckEmitter(t).emitWithAck("e", JSONObject(), 5_000) }
        advanceTimeBy(4_999); runCurrent()
        assertThat(result).isNull()
        advanceTimeBy(2); runCurrent()
        assertThat(result).isEqualTo(SocketAck.Timeout)
        job.cancel()
    }

    @Test
    fun `un NO ACK n'est jamais pris pour un succes`() = runTest {
        val t = FakeTransport { ack -> ack(arrayOf("No Ack")) }
        assertThat(SocketAckEmitter(t).emitWithAck("e", JSONObject(), 1_000)).isEqualTo(SocketAck.Timeout)
    }

    @Test
    fun `une socket absente rend NO_SOCKET sans emettre`() = runTest {
        val t = FakeTransport(isConnected = false)
        val ack = SocketAckEmitter(t).emitWithAck("e", JSONObject(), 1_000)
        assertThat((ack as SocketAck.Refused).refusal.code).isEqualTo(SocketAckCodes.NO_SOCKET)
        assertThat(t.emitted).isEqualTo(0)
    }

    @Test
    fun `la charge decodee et un decodage qui echoue rend une charge absente`() = runTest {
        val t = FakeTransport { ack -> ack(arrayOf(JSONObject("""{"success":true,"data":{"n":3}}"""))) }
        val ok = SocketAckEmitter(t).emitWithAck("e", JSONObject(), 1_000) { (it["n"] as JsonPrimitive).content.toInt() }
        assertThat((ok as SocketAck.Accepted).payload).isEqualTo(3)
        val bad = SocketAckEmitter(t).emitWithAck<Int>("e", JSONObject(), 1_000) { error("x") }
        assertThat((bad as SocketAck.Accepted).payload).isNull()
    }
}
