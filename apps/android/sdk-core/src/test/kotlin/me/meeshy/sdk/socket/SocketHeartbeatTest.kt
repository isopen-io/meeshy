package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SocketHeartbeatTest {

    @Test
    fun `un battement part toutes les 30 s avec l'horloge locale`() = runTest {
        val sent = mutableListOf<Long>()
        val heartbeat = SocketHeartbeat(backgroundScope, nowEpochMs = { testScheduler.currentTime })

        heartbeat.start { sent += it }
        advanceTimeBy(29_999)
        assertThat(sent).isEmpty()
        advanceTimeBy(2)
        assertThat(sent).containsExactly(30_000L)
        advanceTimeBy(60_000)
        assertThat(sent).containsExactly(30_000L, 60_000L, 90_000L).inOrder()
    }

    @Test
    fun `stop arrete la cadence et un nouveau start ne double pas la boucle`() = runTest {
        val sent = mutableListOf<Long>()
        val heartbeat = SocketHeartbeat(backgroundScope, nowEpochMs = { testScheduler.currentTime })

        heartbeat.start { sent += it }
        heartbeat.start { sent += it }
        advanceTimeBy(30_001)
        assertThat(sent).hasSize(1)
        heartbeat.stop()
        advanceTimeBy(120_000)
        assertThat(sent).hasSize(1)
    }

    @Test
    fun `une emission qui echoue ne tue pas la boucle`() = runTest {
        var calls = 0
        val heartbeat = SocketHeartbeat(backgroundScope)

        heartbeat.start { calls++; if (calls == 1) error("socket fermee") }
        advanceTimeBy(60_001)

        assertThat(calls).isEqualTo(2)
    }
}
