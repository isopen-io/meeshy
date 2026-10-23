package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.CoroutineStart
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SocketEventRouterTest {

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

    private fun rig(): Pair<FakeTransport, SocketEventRouter> {
        val transport = FakeTransport()
        return transport to SocketEventRouter(transport, Dispatchers.Default)
    }

    @Test
    fun `les routes s'installent sans socket par un faux transport`() {
        val (transport, router) = rig()

        router.install(
            listOf(
                SocketInboundRoute.decoding("a:one", json, SocketInboundRoute.subject<Ping>()),
                SocketInboundRoute.decoding("a:two", json, SocketInboundRoute.subject<Ping>()),
            ),
        )

        assertThat(transport.handlers.keys).containsExactly("a:one", "a:two")
        router.close()
    }

    @Test
    fun `des evenements de types differents gardent leur ordre d'arrivee`() = runTest {
        val (transport, router) = rig()
        val log = java.util.Collections.synchronizedList(mutableListOf<String>())
        val done = CountDownLatch(1)
        router.install(
            listOf(
                SocketInboundRoute.decoding("a:one", json, Ping.serializer()) { log += "one${it.n}" },
                SocketInboundRoute.decoding("a:two", json, Ping.serializer()) { log += "two${it.n}"; if (it.n == 99) done.countDown() },
            ),
        )

        repeat(100) { n ->
            transport.fire("a:one", """{"n":$n}""")
            transport.fire("a:two", """{"n":$n}""")
        }

        assertThat(done.await(5, TimeUnit.SECONDS)).isTrue()
        assertThat(log).containsExactlyElementsIn((0 until 100).flatMap { listOf("one$it", "two$it") }).inOrder()
        router.close()
    }

    @Test
    fun `une rafale de 5000 evenements arrive entiere, dans l'ordre`() = runTest {
        val (transport, router) = rig()
        val subject = SocketInboundRoute.subject<Ping>()
        router.install(listOf(SocketInboundRoute.decoding("a:burst", json, subject)))

        val received = async(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) {
            subject.take(5_000).toList()
        }
        subject.subscriptionCount.first { it > 0 }
        repeat(5_000) { n -> transport.fire("a:burst", """{"n":$n}""") }

        assertThat(received.await().map { it.n }).containsExactlyElementsIn((0 until 5_000).toList()).inOrder()
        router.close()
    }

    @Test
    fun `un abonne lent ne bloque ni les autres ni l'arrivee`() = runTest {
        val (transport, router) = rig()
        val subject = SocketInboundRoute.subject<Ping>()
        router.install(listOf(SocketInboundRoute.decoding("a:burst", json, subject)))

        val slow = async(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) {
            subject.take(1_000).onEach { delay(1) }.toList()
        }
        val fast = async(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) {
            subject.take(1_000).toList()
        }
        subject.subscriptionCount.first { it >= 2 }
        repeat(1_000) { n -> transport.fire("a:burst", """{"n":$n}""") }

        assertThat(fast.await()).hasSize(1_000)
        assertThat(slow.await()).hasSize(1_000)
        router.close()
    }

    @Test
    fun `un decodage rate est isole et les autres routes continuent`() = runTest {
        val (transport, router) = rig()
        val good = SocketInboundRoute.subject<Ping>()
        val bad = SocketInboundRoute.subject<Ping>()
        router.install(
            listOf(
                SocketInboundRoute.decoding("a:good", json, good),
                SocketInboundRoute.decoding("a:bad", json, bad),
            ),
        )
        val received = async(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) { good.take(2).toList() }
        good.subscriptionCount.first { it > 0 }

        transport.fire("a:good", """{"n":1}""")
        transport.fire("a:bad", """{"oops":true}""")
        transport.fire("a:good", """{"n":2}""")

        assertThat(received.await().map { it.n }).containsExactly(1, 2).inOrder()
        router.close()
    }

    @Test
    fun `le releve d'arrivee precede le decodage, meme si le decodage echoue`() {
        val (transport, router) = rig()
        val arrivals = mutableListOf<Int>()
        router.install(
            listOf(
                SocketInboundRoute.decoding("a:one", json, Ping.serializer(), arrival = { arrivals += it.getInt("n") }) { },
            ),
        )

        transport.fire("a:one", """{"n":7}""")

        assertThat(arrivals).containsExactly(7)
        router.close()
    }

    @Test
    fun `un releve d'arrivee qui leve n'empeche pas la livraison`() = runTest {
        val (transport, router) = rig()
        val subject = SocketInboundRoute.subject<Ping>()
        router.install(
            listOf(SocketInboundRoute.decoding("a:one", json, subject, arrival = { error("tracker") })),
        )
        val received = async(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) { subject.take(1).toList() }
        subject.subscriptionCount.first { it > 0 }

        transport.fire("a:one", """{"n":3}""")

        assertThat(received.await().map { it.n }).containsExactly(3)
        router.close()
    }

    @Test
    fun `une charge qui n'est pas un objet est ignoree`() {
        val (transport, router) = rig()
        router.install(listOf(SocketInboundRoute.decoding("a:one", json, MutableSharedFlow<Ping>())))

        transport.handlers.getValue("a:one").invoke(arrayOf("pas un objet"))
        transport.handlers.getValue("a:one").invoke(emptyArray())

        router.close()
    }
}
