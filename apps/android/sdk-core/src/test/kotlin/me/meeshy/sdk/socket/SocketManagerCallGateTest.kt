package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.SessionRefresher
import org.junit.Test

class SocketManagerCallGateTest {

    private class Rig(val gate: CallActivityGate = CallActivityGate()) {
        val store = InMemoryTokenStore(jwt = validJwt, sessionToken = "sess")
        val factory = FakeSocketFactory()
        val manager = SocketManager(
            config = MeeshyConfig(apiBaseUrl = "http://x", socketUrl = "http://x"),
            tokenStore = store,
            factory = factory,
            clientIdentity = { testIdentity },
            refresher = SessionRefresher(store, nowEpochSeconds = { NOW }) { validJwt },
            ioDispatcher = Dispatchers.Unconfined,
            nowEpochSeconds = { NOW },
            callGate = gate,
        )
    }

    @Test
    fun `hors appel reconnectWithToken s'execute immediatement`() {
        val rig = Rig()
        rig.manager.connect()

        rig.manager.reconnectWithToken()

        assertThat(rig.factory.created).hasSize(2)
    }

    @Test
    fun `pendant un appel la rotation de jeton est differee puis rejouee a la fin`() {
        val rig = Rig()
        rig.manager.connect()
        rig.gate.setActive(true)

        rig.manager.reconnectWithToken()

        assertThat(rig.factory.created).hasSize(1)
        assertThat(rig.factory.created.single().disconnectCalls).isEqualTo(0)
        rig.gate.setActive(false)
        assertThat(rig.factory.created).hasSize(2)
    }

    @Test
    fun `pendant un appel disconnect ne coupe pas la socket avant la fin`() {
        val rig = Rig()
        rig.manager.connect()
        val socket = rig.factory.created.single()
        rig.gate.setActive(true)

        rig.manager.disconnect()

        assertThat(socket.disconnectCalls).isEqualTo(0)
        rig.gate.setActive(false)
        assertThat(socket.disconnectCalls).isEqualTo(1)
    }
}
