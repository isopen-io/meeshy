package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Une mesure aberrante n'est pas une mesure (#20122, miroir de iOS `CallStatValue`, #19933) :
 * `getStats` peut rendre NaN, l'infini, un négatif ou un compteur démesuré. La loi se lit
 * directement et à travers [CallStats.reduce], qui l'applique à chaque champ.
 */
class CallStatValueTest {

    private fun entry(id: String, type: String, kind: String? = null, values: Map<String, Double>) =
        CallStats.RawEntry(id = id, type = type, kind = kind, values = values)

    private fun rttOf(seconds: Double): Double =
        CallStats.reduce(listOf(entry("p", "candidate-pair", values = mapOf("currentRoundTripTime" to seconds))))
            .roundTripTimeMs

    private fun bitrateOf(bps: Double): Int =
        CallStats.reduce(listOf(entry("p", "candidate-pair", values = mapOf("availableOutgoingBitrate" to bps))))
            .availableOutgoingBitrateBps

    // --- la loi -------------------------------------------------------------

    @Test
    fun `measured keeps a finite positive value and zeroes everything else`() {
        assertThat(CallStatValue.measured(12.5)).isEqualTo(12.5)
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, -5.0, 0.0).forEach {
            assertThat(CallStatValue.measured(it)).isEqualTo(0.0)
        }
    }

    @Test
    fun `count truncates a measured value, saturates a finite one beyond the bound, and zeroes the aberrant`() {
        assertThat(CallStatValue.count(42.9)).isEqualTo(42)
        assertThat(CallStatValue.count(Int.MAX_VALUE.toDouble())).isEqualTo(Int.MAX_VALUE)
        assertThat(CallStatValue.count(3e9)).isEqualTo(Int.MAX_VALUE)
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, -3.0).forEach {
            assertThat(CallStatValue.count(it)).isEqualTo(0)
        }
    }

    @Test
    fun `sum saturates at the safe bound instead of wrapping negative`() {
        assertThat(CallStatValue.sum(2, 3)).isEqualTo(5)
        assertThat(CallStatValue.sum(Int.MAX_VALUE, 1)).isEqualTo(Int.MAX_VALUE)
        assertThat(CallStatValue.sum(2_000_000_000, 2_000_000_000)).isEqualTo(Int.MAX_VALUE)
    }

    // --- reduce : RTT et débit ----------------------------------------------

    @Test
    fun `an aberrant rtt reads as unmeasured`() {
        assertThat(rttOf(Double.NaN)).isEqualTo(0.0)
        assertThat(rttOf(-0.005)).isEqualTo(0.0)
        assertThat(rttOf(Double.POSITIVE_INFINITY)).isEqualTo(0.0)
    }

    @Test
    fun `an aberrant available bitrate reads as unmeasured`() {
        assertThat(bitrateOf(Double.POSITIVE_INFINITY)).isEqualTo(0)
        assertThat(bitrateOf(Double.NaN)).isEqualTo(0)
        assertThat(bitrateOf(3e9)).isEqualTo(Int.MAX_VALUE)
    }

    // --- reduce : gigue -----------------------------------------------------

    @Test
    fun `a negative jitter reads as unmeasured`() {
        val stats = CallStats.reduce(listOf(entry("a", "inbound-rtp", "audio", mapOf("jitter" to -0.01))))
        assertThat(stats.jitterMs).isEqualTo(0.0)
    }

    @Test
    fun `aberrant jitters leave the mean of the measured streams intact`() {
        val stats = CallStats.reduce(
            listOf(
                entry("a1", "inbound-rtp", "audio", mapOf("jitter" to 0.02)),
                entry("a2", "inbound-rtp", "audio", mapOf("jitter" to Double.NaN)),
                entry("a3", "inbound-rtp", "audio", mapOf("jitter" to -1.0)),
                entry("a4", "inbound-rtp", "audio", mapOf("jitter" to Double.POSITIVE_INFINITY)),
            ),
        )
        assertThat(stats.jitterMs).isWithin(1e-9).of(20.0)
    }

    // --- reduce : compteurs -------------------------------------------------

    @Test
    fun `a negative packetsLost does not lower the cumulative sum`() {
        val stats = CallStats.reduce(
            listOf(
                entry("a", "inbound-rtp", "audio", mapOf("packetsLost" to 10.0)),
                entry("v", "inbound-rtp", "video", mapOf("packetsLost" to -3.0)),
            ),
        )
        assertThat(stats.packetsLost).isEqualTo(10)
    }

    @Test
    fun `aberrant counters all reduce to the empty snapshot`() {
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, -12.0).forEach { aberrant ->
            val stats = CallStats.reduce(
                listOf(
                    entry("p", "candidate-pair", values = mapOf("availableOutgoingBitrate" to aberrant)),
                    entry(
                        "a", "inbound-rtp", "audio",
                        mapOf("packetsLost" to aberrant, "packetsReceived" to aberrant, "bytesReceived" to aberrant),
                    ),
                    entry("o", "outbound-rtp", "audio", mapOf("packetsSent" to aberrant, "bytesSent" to aberrant)),
                ),
            )
            assertThat(stats).isEqualTo(CallStats())
        }
    }

    @Test
    fun `accumulated counters saturate instead of wrapping negative`() {
        val big = 2_000_000_000.0
        val stats = CallStats.reduce(
            listOf(
                entry("a1", "inbound-rtp", "audio", mapOf("packetsLost" to big, "packetsReceived" to big, "bytesReceived" to big)),
                entry("a2", "inbound-rtp", "audio", mapOf("packetsLost" to big, "packetsReceived" to big, "bytesReceived" to big)),
                entry("v", "inbound-rtp", "video", mapOf("packetsReceived" to big, "bytesReceived" to big)),
                entry("o1", "outbound-rtp", "audio", mapOf("packetsSent" to big, "bytesSent" to big)),
                entry("o2", "outbound-rtp", "video", mapOf("packetsSent" to big, "bytesSent" to big)),
            ),
        )
        assertThat(stats.packetsLost).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.inboundAudioPackets).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.inboundAudioBytes).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.inboundPacketsReceived).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.bytesReceived).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.outboundPacketsSent).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.bandwidth).isEqualTo(Int.MAX_VALUE)
    }

    @Test
    fun `a counter crossing the Int bound never makes the cumulative bytes go back`() {
        fun tick(video: Double) = CallStats.reduce(
            listOf(
                entry("oa", "outbound-rtp", "audio", mapOf("bytesSent" to 4e7)),
                entry("ov", "outbound-rtp", "video", mapOf("bytesSent" to video)),
                entry("iv", "inbound-rtp", "video", mapOf("bytesReceived" to video)),
            ),
        )
        assertThat(tick(2.2e9).bandwidth).isAtLeast(tick(2.1e9).bandwidth)
        assertThat(tick(2.2e9).bytesReceived).isAtLeast(tick(2.1e9).bytesReceived)
        assertThat(tick(2.2e9).inboundVideoBytes).isEqualTo(Int.MAX_VALUE)
    }

    @Test
    fun `the interval loss ratio of saturated counters stays a fraction`() {
        val hostile = CallStats(packetsLost = Int.MAX_VALUE, inboundPacketsReceived = Int.MAX_VALUE)
        assertThat(hostile.intervalQualitySample(previous = null).packetLoss).isWithin(1e-9).of(0.5)
    }

    // --- non-régression -----------------------------------------------------

    @Test
    fun `ordinary readings are unchanged`() {
        val stats = CallStats.reduce(
            listOf(
                entry("p", "candidate-pair", values = mapOf("currentRoundTripTime" to 0.08, "availableOutgoingBitrate" to 1_500_000.7)),
                entry("a", "inbound-rtp", "audio", mapOf("packetsLost" to 4.0, "packetsReceived" to 900.0, "bytesReceived" to 72_000.0, "jitter" to 0.015)),
                entry("v", "inbound-rtp", "video", mapOf("packetsLost" to 6.0, "packetsReceived" to 3_000.0, "bytesReceived" to 2_400_000.0)),
                entry("o", "outbound-rtp", "video", mapOf("packetsSent" to 3_100.0, "bytesSent" to 2_500_000.0)),
            ),
        )
        assertThat(stats.roundTripTimeMs).isWithin(1e-9).of(80.0)
        assertThat(stats.availableOutgoingBitrateBps).isEqualTo(1_500_000)
        assertThat(stats.packetsLost).isEqualTo(10)
        assertThat(stats.inboundAudioPackets).isEqualTo(900)
        assertThat(stats.inboundVideoPackets).isEqualTo(3_000)
        assertThat(stats.inboundPacketsReceived).isEqualTo(3_900)
        assertThat(stats.inboundAudioBytes).isEqualTo(72_000)
        assertThat(stats.inboundVideoBytes).isEqualTo(2_400_000)
        assertThat(stats.bytesReceived).isEqualTo(2_472_000)
        assertThat(stats.outboundPacketsSent).isEqualTo(3_100)
        assertThat(stats.bandwidth).isEqualTo(2_500_000)
        assertThat(stats.jitterMs).isWithin(1e-9).of(15.0)
    }
}
