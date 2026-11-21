package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPersistedQualitySummaryTest {

    @Test
    fun `the summary carries the stats, the duration, the peer and the wire reason`() {
        val stats = CallStats(roundTripTimeMs = 42.0, packetsLost = 3, codec = "opus")

        val summary = CallPersistedQualitySummary.of(stats, "c1", 125, "alice", CallEndReason.ConnectionLost)

        assertThat(summary).isEqualTo(CallPersistedQualitySummary("c1", "alice", 125, "connectionLost", stats))
    }

    @Test
    fun `blank ids become null and a negative duration is clamped`() {
        val summary = CallPersistedQualitySummary.of(null, " ", -4, "", CallEndReason.Local)

        assertThat(summary.callId).isNull()
        assertThat(summary.remoteUser).isNull()
        assertThat(summary.durationSeconds).isEqualTo(0)
    }

    @Test
    fun `the persisted stats keep a byte cumul beyond 2 GB`() {
        val sample = CallQualitySample(rttMs = 30.0, packetLoss = 0.0, bytesSent = 3_000_000_000L, bytesReceived = 4_500_000_000L)

        val stats = sample.toPersistedStats()

        assertThat(stats.bandwidth).isEqualTo(3_000_000_000L)
        assertThat(stats.bytesReceived).isEqualTo(4_500_000_000L)
    }

    @Test
    fun `the persisted stats read an aberrant byte count as unmeasured`() {
        val sample = CallQualitySample(rttMs = 30.0, packetLoss = 0.0, bytesSent = -7L, bytesReceived = Long.MAX_VALUE)

        val stats = sample.toPersistedStats()

        assertThat(stats.bandwidth).isEqualTo(0L)
        assertThat(stats.bytesReceived).isEqualTo(0L)
    }
}
