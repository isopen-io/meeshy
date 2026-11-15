package me.meeshy.sdk.model.connection

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConnectionStatusDerivationTest {
    private fun derive(online: Boolean, connected: Boolean, pending: Int, hadConnected: Boolean) =
        ConnectionStatus.derive(online, connected, pending, hadConnected)

    @Test
    fun `the whole priority table holds`() {
        for (online in listOf(true, false)) for (connected in listOf(true, false))
            for (pending in listOf(0, 3)) for (had in listOf(true, false)) {
                val expected = when {
                    !online -> ConnectionStatus.OFFLINE
                    !connected && !had -> ConnectionStatus.CONNECTING
                    !connected -> ConnectionStatus.DISCONNECTED
                    pending > 0 -> ConnectionStatus.SYNCING
                    else -> ConnectionStatus.CONNECTED
                }
                assertThat(derive(online, connected, pending, had)).isEqualTo(expected)
            }
    }

    @Test
    fun `a dropped socket with a network is disconnected, never offline`() {
        assertThat(derive(online = true, connected = false, pending = 0, hadConnected = true))
            .isEqualTo(ConnectionStatus.DISCONNECTED)
    }

    @Test
    fun `pending writes while disconnected stay disconnected`() {
        assertThat(derive(online = true, connected = false, pending = 5, hadConnected = true))
            .isEqualTo(ConnectionStatus.DISCONNECTED)
    }

    @Test
    fun `only offline connecting and disconnected are degraded`() {
        assertThat(ConnectionStatus.entries.filter { it.isDegraded }).containsExactly(
            ConnectionStatus.OFFLINE, ConnectionStatus.CONNECTING, ConnectionStatus.DISCONNECTED,
        )
    }
}
