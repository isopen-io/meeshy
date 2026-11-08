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
}
