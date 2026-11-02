package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.webrtc.RTCStats
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport
import java.math.BigInteger

class CallStatsCollectorTest {
    private fun stat(id: String, type: String, members: Map<String, Any>): RTCStats = mockk {
        every { this@mockk.id } returns id
        every { this@mockk.type } returns type
        every { this@mockk.members } returns members
    }

    private fun report(vararg stats: RTCStats): RTCStatsReport = mockk {
        every { statsMap } returns stats.associateBy { it.id }
    }

    private fun reference() = report(
        stat("T", "transport", mapOf("selectedCandidatePairId" to "P")),
        stat("P", "candidate-pair", mapOf("currentRoundTripTime" to 0.05, "availableOutgoingBitrate" to 900_000.0, "localCandidateId" to "L", "remoteCandidateId" to "R", "state" to "succeeded")),
        stat("L", "local-candidate", mapOf("candidateType" to "relay")),
        stat("R", "remote-candidate", mapOf("candidateType" to "host")),
        stat("IA", "inbound-rtp", mapOf("kind" to "audio", "packetsReceived" to 100L, "packetsLost" to 2, "bytesReceived" to BigInteger.valueOf(8_000), "jitter" to 0.012, "codecId" to "C")),
        stat("C", "codec", mapOf("mimeType" to "audio/opus")),
        stat("OA", "outbound-rtp", mapOf("kind" to "audio", "packetsSent" to 90L, "bytesSent" to 7_000L)),
    )

    private fun handle(report: RTCStatsReport?): CallPeerHandle = mockk {
        every { getStats(any()) } answers {
            if (report != null) (firstArg() as RTCStatsCollectorCallback).onStatsDelivered(report)
        }
    }

    @Test
    fun `un rapport de référence se réduit en instantané avec la route relayée`() = runTest {
        val stats = CallStatsCollector { handle(reference()) }.collect()!!
        assertThat(stats.roundTripTimeMs).isWithin(1e-9).of(50.0)
        assertThat(stats.availableOutgoingBitrateBps).isEqualTo(900_000)
        assertThat(stats.packetsLost).isEqualTo(2)
        assertThat(stats.inboundAudioBytes).isEqualTo(8_000)
        assertThat(stats.bandwidth).isEqualTo(7_000)
        assertThat(stats.jitterMs).isWithin(1e-9).of(12.0)
        assertThat(stats.codec).isEqualTo("opus")
        assertThat(stats.relayed).isTrue()
    }

    @Test
    fun `hors appel il n'y a rien à lire`() = runTest {
        assertThat(CallStatsCollector { null }.collect()).isNull()
    }
}
