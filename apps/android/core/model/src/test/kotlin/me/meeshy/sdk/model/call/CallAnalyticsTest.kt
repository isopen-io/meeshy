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
    fun `samples aggregate into average and max, the loss emitted as a percentage`() {
        val analytics = CallAnalytics(startedAtMs = 0)
            .plusSample(sample(rtt = 100.0, loss = 0.01))
            .plusSample(sample(rtt = 300.0, loss = 0.07))

        val fields = fieldsOf(analytics)
        assertThat(fields["averageRtt"]).isEqualTo(200.0)
        assertThat(fields["averagePacketLoss"] as Double).isWithin(1e-9).of(4.0)
        assertThat(fields["maxPacketLoss"] as Double).isWithin(1e-9).of(7.0)
    }

    @Test
    fun `a five percent loss fraction is reported as 5 on the wire, like iOS and the web`() {
        val analytics = CallAnalytics(startedAtMs = 0).plusSample(sample(rtt = 80.0, loss = 0.05))

        val fields = fieldsOf(analytics)
        assertThat(fields["averagePacketLoss"] as Double).isWithin(1e-9).of(5.0)
        assertThat(fields["maxPacketLoss"] as Double).isWithin(1e-9).of(5.0)
    }

    @Test
    fun `the MOS still reads the loss once as a percentage, never twice`() {
        val media = CallMediaQuality()
        val analytics = CallAnalytics(startedAtMs = 0)
            .plusSample(CallQualitySample(rttMs = 80.0, packetLoss = 0.05, jitterMs = 12.0, media = media))

        val expected = Math.round(CallMos.estimate(roundTripTimeMs = 80.0, jitterMs = 12.0, packetLossPercent = 5.0) * 100) / 100.0
        assertThat(fieldsOf(analytics)["mos"] as Double).isWithin(1e-9).of(expected)
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

class CallAnalyticsSnapshotTest {

    @Test
    fun `the periodic snapshot is the full payload tagged in_progress`() {
        val analytics = CallAnalytics(startedAtMs = 0).connected(1_000)
            .plusSample(CallQualitySample(rttMs = 80.0, packetLoss = 0.02))

        val fields = analytics.inProgressFields(durationSeconds = 61, isVideo = true, deviceModel = "Pixel 8")

        assertThat(fields["endReason"]).isEqualTo("in_progress")
        assertThat(fields["durationSeconds"]).isEqualTo(61L)
        assertThat(fields["averageRtt"]).isEqualTo(80.0)
        assertThat(fields.keys).containsExactlyElementsIn(
            analytics.fields(61, true, CallEndReason.Local, "Pixel 8").keys,
        )
    }

    @Test
    fun `taking a snapshot does not consume the accumulator`() {
        val analytics = CallAnalytics(startedAtMs = 0).plusSample(CallQualitySample(10.0, 0.0))

        analytics.inProgressFields(1, false, "x")

        assertThat(analytics.sampleCount).isEqualTo(1)
    }

    @Test
    fun `a snapshot is due only while connected, never during a reconnection`() {
        assertThat(CallAnalytics.snapshotDue(CallState.Connected)).isTrue()
        assertThat(CallAnalytics.snapshotDue(CallState.Reconnecting(1))).isFalse()
        assertThat(CallAnalytics.snapshotDue(CallState.Idle)).isFalse()
    }
}

/**
 * #19899 — une mesure absurde (NaN, ±Infinity, négative, somme qui déborde) ne
 * fait jamais rejeter `call:analytics` : `socketCallAnalyticsSchema` exige
 * `averageRtt`, `averagePacketLoss` et `maxPacketLoss` finis et `nonnegative()`,
 * et un seul champ hors bornes perd toute la télémétrie de l'appel. La valeur
 * absurde est neutralisée à l'entrée (elle compte pour 0, une perte au-delà de 1
 * est plafonnée à 1) et le payload est borné à la sortie.
 */
class CallAnalyticsHostileSampleTest {

    private fun fieldsOf(analytics: CallAnalytics): Map<String, Any> =
        analytics.fields(durationSeconds = 30, isVideo = false, endReason = CallEndReason.Local, deviceModel = "Pixel 8")

    private fun foldAll(vararg samples: CallQualitySample): CallAnalytics =
        samples.fold(CallAnalytics(startedAtMs = 0).connected(1_200)) { acc, sample -> acc.plusSample(sample) }

    private val hostileSamples = listOf(
        CallQualitySample(rttMs = Double.NaN, packetLoss = Double.NaN),
        CallQualitySample(rttMs = Double.POSITIVE_INFINITY, packetLoss = Double.POSITIVE_INFINITY),
        CallQualitySample(rttMs = Double.NEGATIVE_INFINITY, packetLoss = Double.NEGATIVE_INFINITY),
        CallQualitySample(rttMs = -250.0, packetLoss = -0.4),
        CallQualitySample(rttMs = Double.MAX_VALUE, packetLoss = 0.5, media = CallMediaQuality()),
        CallQualitySample(rttMs = Double.MAX_VALUE, packetLoss = 3.0, jitterMs = Double.NaN, media = CallMediaQuality()),
    )

    @Test
    fun `each hostile sample alone yields a payload inside the schema bounds`() {
        hostileSamples.forEach { hostile -> assertSchemaBounds(fieldsOf(foldAll(hostile))) }
    }

    @Test
    fun `every hostile sample together, overflowing sums included, yields a payload inside the schema bounds`() {
        assertSchemaBounds(fieldsOf(foldAll(*hostileSamples.toTypedArray())))
    }

    @Test
    fun `a non-finite sample does not poison the valid ones`() {
        val fields = fieldsOf(
            foldAll(
                CallQualitySample(rttMs = 100.0, packetLoss = 0.02),
                CallQualitySample(rttMs = Double.NaN, packetLoss = Double.NaN),
            ),
        )

        assertThat(fields["averageRtt"]).isEqualTo(50.0)
        assertThat(fields["averagePacketLoss"] as Double).isWithin(1e-9).of(1.0)
        assertThat(fields["maxPacketLoss"] as Double).isWithin(1e-9).of(2.0)
    }

    @Test
    fun `a negative sample counts as no loss and no delay`() {
        val fields = fieldsOf(foldAll(CallQualitySample(rttMs = -40.0, packetLoss = -0.3)))

        assertThat(fields["averageRtt"]).isEqualTo(0.0)
        assertThat(fields["averagePacketLoss"]).isEqualTo(0.0)
        assertThat(fields["maxPacketLoss"]).isEqualTo(0.0)
    }

    @Test
    fun `a negative sample next to a valid one counts as zero in the average`() {
        val fields = CallAnalytics(startedAtMs = 0, connectedAtMs = 1)
            .plusSample(CallQualitySample(rttMs = 100.0, packetLoss = 0.02))
            .plusSample(CallQualitySample(rttMs = -250.0, packetLoss = -0.4))
            .fields(1, false, CallEndReason.Local, "x")

        assertThat(fields["averageRtt"] as Double).isWithin(1e-9).of(50.0)
        assertThat(fields["averagePacketLoss"] as Double).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a loss fraction above one is capped at one hundred percent`() {
        val fields = fieldsOf(foldAll(CallQualitySample(rttMs = 50.0, packetLoss = 3.0)))

        assertThat(fields["averagePacketLoss"] as Double).isWithin(1e-9).of(100.0)
        assertThat(fields["maxPacketLoss"] as Double).isWithin(1e-9).of(100.0)
    }

    /** Les bornes de `socketCallAnalyticsSchema` (`services/gateway/src/validation/call-schemas.ts`) sur chaque champ numérique. */
    private fun assertSchemaBounds(fields: Map<String, Any>) {
        listOf("averageRtt", "averagePacketLoss", "maxPacketLoss").forEach { key ->
            val value = fields[key] as Double
            assertThat(value.isFinite()).isTrue()
            assertThat(value).isAtLeast(0.0)
        }
        assertThat(fields["setupTimeMs"] as Long).isAtLeast(-1L)
        assertThat(fields["durationSeconds"] as Long).isAtLeast(0L)
        assertThat(fields["reconnectionCount"] as Int).isAtLeast(0)
        assertThat(fields["networkTransitions"] as Int).isAtLeast(0)

        @Suppress("UNCHECKED_CAST")
        val distribution = fields["qualityDistribution"] as Map<String, Double>
        assertThat(distribution.keys).containsExactly("excellent", "good", "fair", "poor")
        distribution.values.forEach { share ->
            assertThat(share.isFinite()).isTrue()
            assertThat(share).isAtLeast(0.0)
            assertThat(share).isAtMost(1.0)
        }

        fields["mos"]?.let { mos ->
            assertThat((mos as Double).isFinite()).isTrue()
            assertThat(mos).isAtLeast(1.0)
            assertThat(mos).isAtMost(5.0)
        }
    }
}
