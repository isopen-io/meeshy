package me.meeshy.sdk.connection

import app.cash.turbine.test
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.connection.ConnectionStatus
import org.junit.Test

class ConnectionStatusStoreTest {
    private class Sources(online: Boolean = true, connected: Boolean = false, pending: Int = 0) {
        val online = MutableStateFlow(online)
        val connected = MutableStateFlow(connected)
        val pending = MutableStateFlow(pending)
        val store = ConnectionStatusStore(this.online, this.connected, this.pending)
    }

    @Test
    fun `a first connection reads connecting then connected`() = kotlinx.coroutines.test.runTest {
        val s = Sources()
        s.store.status.test {
            assertEquals(ConnectionStatus.CONNECTING, awaitItem())
            s.connected.value = true
            assertEquals(ConnectionStatus.CONNECTED, awaitItem())
        }
    }

    @Test
    fun `a dropped socket reads disconnected and pending writes read syncing`() = kotlinx.coroutines.test.runTest {
        val s = Sources(connected = true)
        s.store.status.test {
            assertEquals(ConnectionStatus.CONNECTED, awaitItem())
            s.pending.value = 2
            assertEquals(ConnectionStatus.SYNCING, awaitItem())
            s.connected.value = false
            assertEquals(ConnectionStatus.DISCONNECTED, awaitItem())
        }
    }

    @Test
    fun `no network wins over everything and is not re-emitted for the same reading`() = kotlinx.coroutines.test.runTest {
        val s = Sources(connected = true)
        s.store.status.test {
            assertEquals(ConnectionStatus.CONNECTED, awaitItem())
            s.online.value = false
            assertEquals(ConnectionStatus.OFFLINE, awaitItem())
            s.pending.value = 4
            s.connected.value = false
            expectNoEvents()
            s.online.value = true
            assertEquals(ConnectionStatus.DISCONNECTED, awaitItem())
        }
    }

    private fun assertEquals(expected: ConnectionStatus, actual: ConnectionStatus) =
        com.google.common.truth.Truth.assertThat(actual).isEqualTo(expected)
}
