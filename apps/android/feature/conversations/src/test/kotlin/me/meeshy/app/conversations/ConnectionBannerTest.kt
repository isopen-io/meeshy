package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.socket.SocketConnectionState
import org.junit.Test

class ConnectionBannerTest {

    @Test
    fun `connected and idle hides the banner`() {
        assertThat(bannerFor(SocketConnectionState.CONNECTED, isSyncing = false))
            .isEqualTo(ConnectionBanner.HIDDEN)
    }

    @Test
    fun `connected while revalidating shows the syncing banner`() {
        assertThat(bannerFor(SocketConnectionState.CONNECTED, isSyncing = true))
            .isEqualTo(ConnectionBanner.SYNCING)
    }

    @Test
    fun `connecting shows the reconnecting banner regardless of sync`() {
        assertThat(bannerFor(SocketConnectionState.CONNECTING, isSyncing = false))
            .isEqualTo(ConnectionBanner.RECONNECTING)
        assertThat(bannerFor(SocketConnectionState.CONNECTING, isSyncing = true))
            .isEqualTo(ConnectionBanner.RECONNECTING)
    }

    @Test
    fun `disconnected shows the offline banner`() {
        assertThat(bannerFor(SocketConnectionState.DISCONNECTED, isSyncing = false))
            .isEqualTo(ConnectionBanner.OFFLINE)
    }
}
