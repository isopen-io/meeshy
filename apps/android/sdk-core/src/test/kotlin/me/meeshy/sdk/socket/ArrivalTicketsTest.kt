package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import java.lang.ref.WeakReference
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.AccountTicketContext
import org.json.JSONObject
import org.junit.Test
import kotlinx.coroutines.currentCoroutineContext

class ArrivalTicketsTest {

    @Serializable
    private data class Ping(val n: Int)

    private val json = Json { ignoreUnknownKeys = true }

    private class FakeTransport : SocketEventRegistrar {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        override fun on(event: String, callback: (Array<Any>) -> Unit) {
            handlers[event] = callback
        }

        fun fire(event: String, payload: String) = handlers.getValue(event).invoke(arrayOf(JSONObject(payload)))
    }

    private fun ticket(owner: String) = AccountTicket(owner, 0L, 0L)

    @Test
    fun `two EQUAL events arrived under two accounts each keep their own ticket`(): Unit = runBlocking {
        var current = ticket("A")
        val transport = FakeTransport()
        val router = SocketEventRouter(transport, Dispatchers.Default, { 0L }, { current })
        val subject = SocketInboundRoute.subject<Ping>()
        val exposed: SharedFlow<Ping> = subject.exposed()
        router.install(listOf(SocketInboundRoute.decoding("p", json, subject)))

        val seen = async(start = CoroutineStart.UNDISPATCHED) {
            val out = mutableListOf<String?>()
            withTimeout(5_000) {
                exposed.arrivals().take(3).toList().forEach { out += it.ticket?.ownerId }
            }
            out
        }
        transport.fire("p", """{"n":1}""")
        current = ticket("B")
        transport.fire("p", """{"n":1}""")
        current = ticket("A")
        transport.fire("p", """{"n":1}""")

        assertThat(seen.await()).containsExactly("A", "B", "A").inOrder()
        router.close()
    }

    @Test
    fun `collectArrived installs the arrival ticket as the ambient one`(): Unit = runBlocking {
        var current = ticket("A")
        val transport = FakeTransport()
        val router = SocketEventRouter(transport, Dispatchers.Default, { 0L }, { current })
        val subject = SocketInboundRoute.subject<Ping>()
        val exposed = subject.exposed()
        router.install(listOf(SocketInboundRoute.decoding("p", json, subject)))
        val ambient = mutableListOf<String?>()

        val job = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(5_000) {
                runCatching {
                    exposed.collectArrived {
                        ambient += currentCoroutineContext()[AccountTicketContext]?.ticket?.ownerId
                        if (ambient.size == 2) throw StopCollect()
                    }
                }
            }
        }
        transport.fire("p", """{"n":1}""")
        current = ticket("B")
        transport.fire("p", """{"n":2}""")
        job.await()

        assertThat(ambient).containsExactly("A", "B").inOrder()
        router.close()
    }

    private class StopCollect : RuntimeException()

    @Test
    fun `the twin replays nothing to a late subscriber`(): Unit = runBlocking {
        val subject = SocketInboundRoute.subject<Ping>()
        val exposed = subject.exposed()
        subject.emitArrived(Ping(1))

        val late = async(start = CoroutineStart.UNDISPATCHED) { withTimeout(5_000) { exposed.arrivals().take(1).toList() } }
        yield()
        subject.emitArrived(Ping(2))

        assertThat(late.await().map { it.value }).containsExactly(Ping(2))
    }

    @Test
    fun `the ledger holds neither a subject nor its exposed flow alive`() {
        val refs = (0 until 50).map {
            val subject = SocketInboundRoute.subject<Ping>()
            val exposed = subject.exposed()
            subject.emitArrived(Ping(it))
            WeakReference(subject) to WeakReference(exposed)
        }

        repeat(20) {
            System.gc()
            Thread.sleep(20)
        }

        assertThat(refs.count { it.first.get() == null && it.second.get() == null }).isGreaterThan(40)
    }

    @Test
    fun `a nested stamp gives back the ticket of the outer frame, not nothing`() {
        ArrivalStamp.under(ticket("A")) {
            ArrivalStamp.under(ticket("B")) { assertThat(ArrivalStamp.current()?.ownerId).isEqualTo("B") }
            assertThat(ArrivalStamp.current()?.ownerId).isEqualTo("A")
        }
        assertThat(ArrivalStamp.current()).isNull()
    }
}
