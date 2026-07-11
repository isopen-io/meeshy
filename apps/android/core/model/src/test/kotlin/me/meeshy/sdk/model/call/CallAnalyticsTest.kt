package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure once-per-call analytics accumulator behind
 * `call:analytics` (iOS parity: `emitCallAnalyticsSnapshot`). [CallAnalytics.fields]
 * is the single tested SSOT of the wire payload — the gateway validates every
 * field with `socketCallAnalyticsSchema`, so each key asserted here is a key the
 * server would otherwise reject at runtime.
 */
class CallAnalyticsTest {

    private fun sample(rtt: Double, loss: Double) = CallQualitySample(rttMs = rtt, packetLoss = loss)

    private fun fieldsOf(
        analytics: CallAnalytics,
        durationSeconds: Long = 0,
        isVideo: Boolean = false,
        endReason: CallEndReason = CallEndReason.Local,
    ): Map<String, Any> = analytics.fields(durationSeconds, isVideo, endReason, deviceModel = "Pixel 8")

    // --- anchors --------------------------------------------------------------

    @Test
    fun `setupTimeMs is the start-to-first-connect delta`() {
        val analytics = CallAnalytics(startedAtMs = 5_000).connected(nowMs = 8_200)

        assertThat(fieldsOf(analytics)["setupTimeMs"]).isEqualTo(3_200L)
    }

    @Test
    fun `connected is idempotent so a reconnect never rewrites the anchor`() {
        val analytics = CallAnalytics(startedAtMs = 5_000).connected(8_000).connected(60_000)

        assertThat(fieldsOf(analytics)["setupTimeMs"]).isEqualTo(3_000L)
    }

    @Test
    fun `a call that never connected reports the -1 sentinel`() {
        val analytics = CallAnalytics(startedAtMs = 5_000)

        assertThat(fieldsOf(analytics)["setupTimeMs"]).isEqualTo(-1L)
    }

    @Test
    fun `negotiationTimeMs is omitted — no anchor on Android, the schema allows absence`() {
        assertThat(fieldsOf(CallAnalytics(startedAtMs = 0))).doesNotContainKey("negotiationTimeMs")
    }

    // --- reconnects -----------------------------------------------------------

    @Test
    fun `each reconnect cycle increments the count`() {
        val analytics = CallAnalytics(startedAtMs = 0).reconnecting().reconnecting()

        assertThat(fieldsOf(analytics)["reconnectionCount"]).isEqualTo(2)
    }

    // --- quality aggregation ----------------------------------------------------

    @Test
    fun `samples aggregate into average and max`() {
        val analytics = CallAnalytics(startedAtMs = 0)
            .plusSample(sample(rtt = 100.0, loss = 1.0))
            .plusSample(sample(rtt = 300.0, loss = 7.0))

        val fields = fieldsOf(analytics)
        assertThat(fields["averageRtt"]).isEqualTo(200.0)
        assertThat(fields["averagePacketLoss"]).isEqualTo(4.0)
        assertThat(fields["maxPacketLoss"]).isEqualTo(7.0)
    }

    @Test
    fun `no samples report zero averages rather than NaN`() {
        val fields = fieldsOf(CallAnalytics(startedAtMs = 0))

        assertThat(fields["averageRtt"]).isEqualTo(0.0)
        assertThat(fields["averagePacketLoss"]).isEqualTo(0.0)
        assertThat(fields["maxPacketLoss"]).isEqualTo(0.0)
    }

    @Test
    fun `quality distribution carries every tier as a fraction of samples`() {
        // rtt 50/loss 0 → EXCELLENT ; rtt 350/loss 6 → POOR (via the tier ladder).
        val analytics = CallAnalytics(startedAtMs = 0)
            .plusSample(sample(rtt = 50.0, loss = 0.0))
            .plusSample(sample(rtt = 50.0, loss = 0.0))
            .plusSample(sample(rtt = 350.0, loss = 6.0))

        @Suppress("UNCHECKED_CAST")
        val distribution = fieldsOf(analytics)["qualityDistribution"] as Map<String, Double>
        assertThat(distribution.keys).containsExactly("excellent", "good", "fair", "poor")
        assertThat(distribution["excellent"]).isWithin(1e-9).of(2.0 / 3.0)
        assertThat(distribution["poor"]).isWithin(1e-9).of(1.0 / 3.0)
        assertThat(distribution["good"]).isEqualTo(0.0)
        assertThat(distribution["fair"]).isEqualTo(0.0)
    }

    @Test
    fun `an empty call reports an all-zero distribution with every tier present`() {
        @Suppress("UNCHECKED_CAST")
        val distribution = fieldsOf(CallAnalytics(startedAtMs = 0))["qualityDistribution"] as Map<String, Double>

        assertThat(distribution.keys).containsExactly("excellent", "good", "fair", "poor")
        assertThat(distribution.values.sum()).isEqualTo(0.0)
    }

    // --- wire payload completeness ---------------------------------------------

    @Test
    fun `the payload carries every schema-required field`() {
        val fields = fieldsOf(
            CallAnalytics(startedAtMs = 0),
            durationSeconds = 42,
            isVideo = true,
            endReason = CallEndReason.Remote,
        )

        assertThat(fields.keys).containsExactly(
            "setupTimeMs", "durationSeconds", "reconnectionCount", "networkTransitions",
            "averageRtt", "averagePacketLoss", "maxPacketLoss", "codec", "effectsUsed",
            "filtersUsed", "transcriptionUsed", "qualityDistribution", "platform",
            "deviceModel", "isVideo", "endReason",
        )
        assertThat(fields["durationSeconds"]).isEqualTo(42L)
        assertThat(fields["platform"]).isEqualTo("android")
        assertThat(fields["deviceModel"]).isEqualTo("Pixel 8")
        assertThat(fields["isVideo"]).isEqualTo(true)
        assertThat(fields["endReason"]).isEqualTo("remote")
        assertThat(fields["codec"]).isEqualTo("unknown")
        assertThat(fields["networkTransitions"]).isEqualTo(0)
    }

    // --- endReason wire tokens ---------------------------------------------------

    @Test
    fun `every end reason maps to a stable wire token`() {
        assertThat(CallEndReason.Local.wireValue).isEqualTo("local")
        assertThat(CallEndReason.Remote.wireValue).isEqualTo("remote")
        assertThat(CallEndReason.Rejected.wireValue).isEqualTo("rejected")
        assertThat(CallEndReason.Missed.wireValue).isEqualTo("missed")
        assertThat(CallEndReason.ConnectionLost.wireValue).isEqualTo("connectionLost")
        assertThat(CallEndReason.Failed("boom").wireValue).isEqualTo("failed")
    }
}
