package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.socket.SocketConnectionState
import org.junit.Test

class ConnectionBannerTest {

    @Test
    fun `connected and idle hides the banner`() {
        assertThat(bannerFor(SocketConnectionState.CONNECTED, isSyncing = false, connectionSettled = true))
            .isEqualTo(ConnectionBanner.HIDDEN)
    }

    @Test
    fun `connected while revalidating shows the syncing banner`() {
        assertThat(bannerFor(SocketConnectionState.CONNECTED, isSyncing = true, connectionSettled = true))
            .isEqualTo(ConnectionBanner.SYNCING)
    }

    @Test
    fun `a socket that dropped after connecting reads reconnecting, regardless of sync`() {
        listOf(SocketConnectionState.CONNECTING, SocketConnectionState.DISCONNECTED).forEach { state ->
            listOf(false, true).forEach { syncing ->
                assertThat(bannerFor(state, isSyncing = syncing, connectionSettled = true, hasConnected = true))
                    .isEqualTo(ConnectionBanner.RECONNECTING)
            }
        }
    }

    @Test
    fun `a socket that never connected reads connecting, not reconnecting`() {
        assertThat(bannerFor(SocketConnectionState.CONNECTING, isSyncing = false, connectionSettled = true))
            .isEqualTo(ConnectionBanner.CONNECTING)
        assertThat(bannerFor(SocketConnectionState.DISCONNECTED, isSyncing = false, connectionSettled = true))
            .isEqualTo(ConnectionBanner.CONNECTING)
    }

    @Test
    fun `no device network reads offline whatever the socket believes`() {
        SocketConnectionState.entries.forEach { state ->
            listOf(false, true).forEach { settled ->
                assertThat(
                    bannerFor(
                        state,
                        isSyncing = true,
                        connectionSettled = settled,
                        isNetworkOnline = false,
                        hasConnected = true,
                        showBackOnline = true,
                    ),
                ).isEqualTo(ConnectionBanner.OFFLINE)
            }
        }
    }

    @Test
    fun `the return online is confirmed only once the socket is connected`() {
        assertThat(bannerFor(SocketConnectionState.CONNECTED, isSyncing = true, connectionSettled = true, showBackOnline = true))
            .isEqualTo(ConnectionBanner.BACK_ONLINE)
        assertThat(
            bannerFor(
                SocketConnectionState.CONNECTING,
                isSyncing = false,
                connectionSettled = true,
                hasConnected = true,
                showBackOnline = true,
            ),
        ).isEqualTo(ConnectionBanner.RECONNECTING)
    }

    @Test
    fun `an unsettled wait is never announced`() {
        listOf(SocketConnectionState.CONNECTING, SocketConnectionState.DISCONNECTED).forEach { state ->
            assertThat(bannerFor(state, isSyncing = false, connectionSettled = false, hasConnected = true))
                .isEqualTo(ConnectionBanner.HIDDEN)
            assertThat(bannerFor(state, isSyncing = false, connectionSettled = false))
                .isEqualTo(ConnectionBanner.HIDDEN)
        }
    }
}
