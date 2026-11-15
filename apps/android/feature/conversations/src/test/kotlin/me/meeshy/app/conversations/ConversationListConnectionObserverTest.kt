package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.socket.SocketConnectionState
import org.junit.Test

/**
 * The connection strip of the list read from the socket AND the device network, with the
 * timers of the iOS `ConnectionBanner`: a cut network reads « Offline » at once (never
 * « Reconnecting… »), a quick reconnection stays invisible, and the return after a visible
 * down state is confirmed by « Online » for a few seconds.
 */
class ConversationListConnectionObserverTest {

    private class Harness(scope: TestScope, connected: Boolean = true) {
        val state = MutableStateFlow(ConversationListUiState())
        val socket = MutableStateFlow(
            if (connected) SocketConnectionState.CONNECTED else SocketConnectionState.DISCONNECTED,
        )
        val network = MutableStateFlow(true)

        init {
            ConversationListConnectionObserver(scope.backgroundScope, state, socket, network).start()
        }

        val banner get() = state.value.banner
    }

    @Test
    fun `cutting the network reads offline at once, while the socket still retries`() = runTest {
        val h = Harness(this)
        runCurrent()
        assertThat(h.banner).isEqualTo(ConnectionBanner.HIDDEN)

        h.network.value = false
        h.socket.value = SocketConnectionState.CONNECTING
        runCurrent()
        assertThat(h.banner).isEqualTo(ConnectionBanner.OFFLINE)

        advanceTimeBy(ConversationListConnectionObserver.RECONNECT_GRACE_MILLIS + 1)
        assertThat(h.banner).isEqualTo(ConnectionBanner.OFFLINE)
    }

    @Test
    fun `the network back and the socket reconnected confirm online, then the strip leaves`() = runTest {
        val h = Harness(this)
        runCurrent()
        h.network.value = false
        h.socket.value = SocketConnectionState.CONNECTING
        runCurrent()

        h.network.value = true
        runCurrent()
        assertThat(h.banner).isEqualTo(ConnectionBanner.HIDDEN)

        h.socket.value = SocketConnectionState.CONNECTED
        runCurrent()
        assertThat(h.banner).isEqualTo(ConnectionBanner.BACK_ONLINE)

        advanceTimeBy(ConversationListConnectionObserver.BACK_ONLINE_MILLIS + 1)
        assertThat(h.banner).isEqualTo(ConnectionBanner.HIDDEN)
    }

    @Test
    fun `a socket drop shorter than the grace never shows, nor any online confirmation`() = runTest {
        val h = Harness(this)
        runCurrent()

        h.socket.value = SocketConnectionState.CONNECTING
        runCurrent()
        assertThat(h.banner).isEqualTo(ConnectionBanner.HIDDEN)
        advanceTimeBy(ConversationListConnectionObserver.RECONNECT_GRACE_MILLIS - 500)
        h.socket.value = SocketConnectionState.CONNECTED
        runCurrent()

        assertThat(h.banner).isEqualTo(ConnectionBanner.HIDDEN)
        advanceTimeBy(ConversationListConnectionObserver.RECONNECT_GRACE_MILLIS)
        assertThat(h.banner).isEqualTo(ConnectionBanner.HIDDEN)
    }

    @Test
    fun `a socket drop longer than the grace reads reconnecting while the network is there`() = runTest {
        val h = Harness(this)
        runCurrent()

        h.socket.value = SocketConnectionState.DISCONNECTED
        runCurrent()
        advanceTimeBy(ConversationListConnectionObserver.RECONNECT_GRACE_MILLIS + 1)

        assertThat(h.banner).isEqualTo(ConnectionBanner.RECONNECTING)
    }

    @Test
    fun `a launch without network reads offline without waiting for the grace`() = runTest {
        val h = Harness(this, connected = false)
        h.network.value = false
        runCurrent()

        assertThat(h.banner).isEqualTo(ConnectionBanner.OFFLINE)
    }
}
