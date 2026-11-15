package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.model.socket.SocketLink
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.SessionRefresher
import org.json.JSONObject
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SocketManagerReconnectTest {

    private class Rig(testScope: TestScope, jwt: String? = validJwt) {
        val store = InMemoryTokenStore(jwt = jwt, sessionToken = "sess")
        val factory = FakeSocketFactory()
        val gate = CallActivityGate()
        private val refresher = SessionRefresher(store, nowEpochSeconds = { NOW }) { validJwt }
        val manager = SocketManager(
            config = MeeshyConfig(apiBaseUrl = "http://x", socketUrl = "http://x"),
            tokenStore = store,
            factory = factory,
            clientIdentity = { testIdentity },
            refresher = refresher,
            ioDispatcher = StandardTestDispatcher(testScope.testScheduler),
            nowEpochSeconds = { NOW },
            callGate = gate,
            jitter = { 1.0 },
            nowEpochMs = { 1_000_000L },
        )

        fun open(): FakeRealtimeSocket {
            manager.connect()
            return factory.created.last().also { it.live = true; it.fire("connect") }
        }
    }

    @Test
    fun `une coupure decidee par la passerelle rouvre une socket apres le plancher de 1 s`() = runTest {
        val rig = Rig(this)
        val first = rig.open()

        first.live = false
        first.fire("disconnect", "io server disconnect")
        advanceTimeBy(999)
        assertThat(rig.factory.created).hasSize(1)
        advanceTimeBy(2)

        assertThat(rig.factory.created).hasSize(2)
        assertThat(first.reconnectsStopped).isTrue()
        assertThat(first.removedAll).isTrue()
    }

    @Test
    fun `une coupure de transport laisse Socket IO reconnecter sans echelle`() = runTest {
        val rig = Rig(this)
        val first = rig.open()

        first.live = false
        first.fire("disconnect", "transport close")
        advanceTimeBy(120_000)

        assertThat(rig.factory.created).hasSize(1)
        assertThat(rig.manager.linkState.value.link).isEqualTo(SocketLink.Reconnecting(0))
    }

    @Test
    fun `l'echelle double a chaque echec et se remet a zero a la connexion`() = runTest {
        val rig = Rig(this)
        val first = rig.open()
        first.live = false
        first.fire("disconnect", "io server disconnect")
        advanceTimeBy(1_001)
        val second = rig.factory.created.last()
        second.fire("disconnect", "io server disconnect")

        advanceTimeBy(1_999)
        assertThat(rig.factory.created).hasSize(2)
        advanceTimeBy(2)
        assertThat(rig.factory.created).hasSize(3)

        val third = rig.factory.created.last().also { it.live = true; it.fire("connect") }
        third.live = false
        third.fire("disconnect", "io server disconnect")
        advanceTimeBy(1_001)
        assertThat(rig.factory.created).hasSize(4)
    }

    @Test
    fun `une fermeture voulue ne reouvre jamais`() = runTest {
        val rig = Rig(this)
        val first = rig.open()

        first.fire("disconnect", "io client disconnect")
        rig.manager.disconnect()
        advanceTimeBy(120_000)

        assertThat(rig.factory.created).hasSize(1)
    }

    @Test
    fun `la premiere connexion n'emet pas didReconnect mais la suivante si`() = runTest {
        val rig = Rig(this)
        var reconnects = 0
        backgroundScope.launch { rig.manager.didReconnect.collect { reconnects++ } }
        runCurrent()

        val first = rig.open()
        advanceTimeBy(1)
        assertThat(reconnects).isEqualTo(0)

        first.live = false
        first.fire("disconnect", "io server disconnect")
        advanceTimeBy(1_001)
        rig.factory.created.last().also { it.live = true; it.fire("connect") }
        advanceTimeBy(1)

        assertThat(reconnects).isEqualTo(1)
        rig.manager.disconnect()
    }

    @Test
    fun `l'arriere-plan suspend la socket puis le premier plan la rouvre en reconnexion`() = runTest {
        val rig = Rig(this)
        val first = rig.open()
        rig.manager.on("message:new") { }

        rig.manager.suspendForBackground()
        advanceTimeBy(12_001)
        assertThat(first.disconnectCalls).isEqualTo(1)
        assertThat(rig.manager.connectionState.value).isEqualTo(SocketConnectionState.DISCONNECTED)

        rig.manager.resumeFromBackground()
        val second = rig.factory.created.last()
        assertThat(rig.factory.created).hasSize(2)
        assertThat(second.count("message:new")).isEqualTo(1)
        assertThat(rig.manager.linkState.value.hadPreviousConnection).isTrue()
    }

    @Test
    fun `suspendue la socket ne se reconstruit pas toute seule`() = runTest {
        val rig = Rig(this)
        val first = rig.open()
        first.live = false
        first.fire("disconnect", "io server disconnect")

        rig.manager.suspendForBackground()
        advanceTimeBy(120_000)

        assertThat(rig.factory.created).hasSize(1)
    }

    @Test
    fun `le retour du reseau reconnecte aussitot et remet l'echelle a zero`() = runTest {
        val rig = Rig(this)
        val first = rig.open()
        first.live = false
        first.fire("disconnect", "io server disconnect")
        advanceTimeBy(1_001)
        rig.factory.created.last().fire("disconnect", "io server disconnect")

        rig.manager.reconnectAfterNetworkRestored()

        assertThat(rig.factory.created).hasSize(3)
    }

    @Test
    fun `pendant un appel le retour du reseau passe par l'echelle sans recreer une socket vivante`() = runTest {
        val rig = Rig(this)
        val first = rig.open()
        rig.gate.setActive(true)

        rig.manager.reconnectAfterNetworkRestored()
        advanceTimeBy(5_000)
        assertThat(rig.factory.created).hasSize(1)

        first.live = false
        rig.manager.reconnectAfterNetworkRestored()
        assertThat(rig.factory.created).hasSize(1)
        advanceTimeBy(1_001)
        assertThat(rig.factory.created).hasSize(2)
    }

    @Test
    fun `le heartbeat part toutes les 30 s et l'accuse alimente le RTT`() = runTest {
        val rig = Rig(this)
        val socket = rig.open()

        advanceTimeBy(30_001)
        assertThat(socket.emitted).contains("heartbeat")

        socket.fire(
            "heartbeat:ack",
            JSONObject().put("serverTime", "2026-11-03T10:00:00.000Z").put("latencyHintMs", 25.0),
        )
        assertThat(rig.manager.connectionRTT.value).isEqualTo(50.0)
        rig.manager.disconnect()
    }

    @Test
    fun `la socket coupee n'emet plus de heartbeat`() = runTest {
        val rig = Rig(this)
        val socket = rig.open()
        socket.live = false
        socket.fire("disconnect", "transport close")

        advanceTimeBy(120_000)

        assertThat(socket.emitted).doesNotContain("heartbeat")
    }
}
