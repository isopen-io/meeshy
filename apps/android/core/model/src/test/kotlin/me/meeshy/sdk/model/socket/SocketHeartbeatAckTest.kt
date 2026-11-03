package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocketHeartbeatAckTest {

    private val serverTime = "2026-11-03T10:00:00.000Z"
    private val serverMs = java.time.Instant.parse(serverTime).toEpochMilli()

    @Test
    fun `l'indice de latence est double`() {
        assertThat(SocketHeartbeatAck.rttMs(40.0, serverTime, serverMs + 5_000)).isEqualTo(80.0)
    }

    @Test
    fun `sans indice l'ecart avec l'horloge du serveur approche le RTT dans les deux sens`() {
        assertThat(SocketHeartbeatAck.rttMs(null, serverTime, serverMs + 120)).isEqualTo(120.0)
        assertThat(SocketHeartbeatAck.rttMs(null, serverTime, serverMs - 90)).isEqualTo(90.0)
    }

    @Test
    fun `un accusé sans serverTime ou illisible n'a pas de RTT`() {
        assertThat(SocketHeartbeatAck.rttMs(40.0, null, 0)).isNull()
        assertThat(SocketHeartbeatAck.rttMs(null, "pas une date", 0)).isNull()
    }
}
