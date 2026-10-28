package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.session.AccountTicket
import org.json.JSONObject
import org.junit.Test

/**
 * #13588 — la signalisation d'APPEL passe par le registre des tickets d'arrivée comme les autres routes : un signal reçu
 * sous A et collecté après l'adoption de B porte le ticket de A (jamais celui de B), et rien n'est perdu ni retardé.
 */
class CallSignalArrivalAccountTest {

    private fun ticket(owner: String) = AccountTicket(owner, 0L, 0L)

    private class Wiring(var current: AccountTicket) {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true) {
            every { connectionState } returns MutableStateFlow(SocketConnectionState.CONNECTED)
            every { on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        }
        val social = CallSocialSignalManager(socket) { current }
        val calls = CallSignalManager(socket, social) { current }.also { it.attach(); social.attach() }

        fun fire(event: String, json: String) = handlers.getValue(event).invoke(arrayOf(JSONObject(json)))
    }

    @Test
    fun `an incoming offer received under A and collected after B was adopted keeps A's ticket`(): Unit = runBlocking {
        val wiring = Wiring(ticket("A"))
        val seen = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(5_000) { wiring.calls.incomingOffers.arrivals().take(2).toList() }
        }
        wiring.fire("call:initiated", """{"callId":"c1","type":"audio","initiator":{"userId":"u9","username":"al"}}""")
        wiring.current = ticket("B")
        wiring.fire("call:initiated", """{"callId":"c2","type":"audio","initiator":{"userId":"u9","username":"al"}}""")

        val arrived = seen.await()
        assertThat(arrived.map { it.value.callId }).containsExactly("c1", "c2").inOrder()
        assertThat(arrived.map { it.ticket?.ownerId }).containsExactly("A", "B").inOrder()
    }

    @Test
    fun `the FSM events of a call ring for the current account and carry their ticket`(): Unit = runBlocking {
        val wiring = Wiring(ticket("A"))
        val seen = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(5_000) { wiring.calls.events.arrivals().take(1).toList() }
        }
        wiring.fire("call:initiated", """{"callId":"c1","type":"video"}""")

        assertThat(seen.await().single().ticket?.ownerId).isEqualTo("A")
    }

    @Test
    fun `a social signal of A carries A's ticket after B was adopted`(): Unit = runBlocking {
        val wiring = Wiring(ticket("A"))
        val seen = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(5_000) { wiring.social.reactionReceived.arrivals().take(1).toList() }
        }
        wiring.fire("call:reaction-received", """{"callId":"c1","userId":"u2","emoji":"❤️"}""")
        wiring.current = ticket("B")

        assertThat(seen.await().single().ticket?.ownerId).isEqualTo("A")
    }

    @Test
    fun `a burst far beyond the old buffer of 128 reaches a slow collector whole and in order`(): Unit = runBlocking {
        val wiring = Wiring(ticket("A"))
        val burst = 400
        val seen = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(30_000) { wiring.calls.incomingSignals.onEach { delay(1) }.take(burst).toList() }
        }
        repeat(burst) {
            wiring.fire("call:signal", """{"callId":"c1","signal":{"type":"ice-candidate","candidate":"c$it"}}""")
        }

        val candidates = seen.await().map { it.signal.candidate }
        assertThat(candidates).containsExactlyElementsIn((0 until burst).map { "c$it" }).inOrder()
    }

    @Test
    fun `an incoming offer of the current account rings`(): Unit = runBlocking {
        val wiring = Wiring(ticket("A"))
        val rang = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(5_000) { wiring.calls.incomingOffers.arrivals().first() }
        }
        wiring.fire("call:initiated", """{"callId":"c1","type":"audio","initiator":{"userId":"u9","username":"al"}}""")

        val arrived = rang.await()
        assertThat(arrived.value.callId).isEqualTo("c1")
        assertThat(arrived.ticket?.ownerId).isEqualTo("A")
    }
}
