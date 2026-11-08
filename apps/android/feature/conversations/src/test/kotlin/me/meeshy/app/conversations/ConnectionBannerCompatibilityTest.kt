package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.socket.SocketConnectionState
import org.junit.Test

class ConnectionBannerCompatibilityTest {
    /** Le tableau de décision d'avant la dérivation partagée, rejoué sur toutes les combinaisons. */
    private fun legacy(
        connection: SocketConnectionState,
        isSyncing: Boolean,
        settled: Boolean,
        online: Boolean,
        hasConnected: Boolean,
        backOnline: Boolean,
    ): ConnectionBanner = when {
        !online -> ConnectionBanner.OFFLINE
        connection != SocketConnectionState.CONNECTED -> when {
            !settled -> ConnectionBanner.HIDDEN
            hasConnected -> ConnectionBanner.RECONNECTING
            else -> ConnectionBanner.CONNECTING
        }
        backOnline -> ConnectionBanner.BACK_ONLINE
        isSyncing -> ConnectionBanner.SYNCING
        else -> ConnectionBanner.HIDDEN
    }

    @Test
    fun `bannerFor behaves exactly as before on every combination`() {
        val bools = listOf(false, true)
        for (connection in SocketConnectionState.entries) for (syncing in bools) for (settled in bools)
            for (online in bools) for (had in bools) for (back in bools) {
                assertThat(bannerFor(connection, syncing, settled, online, had, back))
                    .isEqualTo(legacy(connection, syncing, settled, online, had, back))
            }
    }
}
