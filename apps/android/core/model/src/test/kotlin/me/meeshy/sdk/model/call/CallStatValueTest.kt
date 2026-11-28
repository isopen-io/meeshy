package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Une mesure aberrante n'est pas une mesure (#20122, miroir de iOS `CallStatValue`, #19933) :
 * `getStats` peut rendre NaN, l'infini, un négatif ou un compteur démesuré. La loi se lit
 * directement et à travers [CallStats.reduce], qui l'applique à chaque champ. Les octets se
 * comptent en `Long` jusqu'à 2^53 − 1 (#20132).
 */
class CallStatValueTest {

    private fun entry(id: String, type: String, kind: String? = null, values: Map<String, Double>) =
        CallStats.RawEntry(id = id, type = type, kind = kind, values = values)

    private fun rttOf(seconds: Double): Double =
        CallStats.reduce(listOf(entry("p", "candidate-pair", values = mapOf("currentRoundTripTime" to seconds))))
            .roundTripTimeMs

    private fun electedPair(values: Map<String, Double>) = CallStats.RawEntry(
        id = "p",
        type = "candidate-pair",
        values = values + ("nominated" to 1.0),
        strings = mapOf("state" to "succeeded"),
    )

    private fun bitrateOf(bps: Double): Int =
        CallStats.reduce(listOf(electedPair(mapOf("availableOutgoingBitrate" to bps)))).availableOutgoingBitrateBps

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
        assertThat(bitrateOf(3e9)).isEqualTo(0)
    }

    // --- #20348 : l'estimation de débit a sa propre borne, comme sur iOS et le web ---

    @Test
    fun `an estimate beyond the plausibility bound is no estimate`() {
        assertThat(CallStatValue.bitrateEstimate(2_147_483_648.0)).isEqualTo(0)
        assertThat(bitrateOf(2_147_483_648.0)).isEqualTo(0)
    }

    @Test
    fun `an estimate at the plausibility bound is kept`() {
        assertThat(CallStatValue.MAX_BITRATE_ESTIMATE_BPS).isEqualTo(2_147_483_647)
        assertThat(CallStatValue.bitrateEstimate(2_147_483_647.0)).isEqualTo(2_147_483_647)
        assertThat(bitrateOf(2_147_483_647.0)).isEqualTo(2_147_483_647)
    }

    @Test
    fun `a non finite, null or negative estimate is no estimate`() {
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 0.0, -5.0).forEach {
            assertThat(CallStatValue.bitrateEstimate(it)).isEqualTo(0)
        }
    }

    // --- #20348 : sans RTT sur aucune paire, celui du pair (remote-inbound-rtp) ---

    private fun remoteInbound(id: String, kind: String, rttSeconds: Double?) =
        entry(id, "remote-inbound-rtp", kind, rttSeconds?.let { mapOf("roundTripTime" to it) } ?: emptyMap())

    @Test
    fun `without a pair rtt, the remote-inbound rtt is read in ms`() {
        val stats = CallStats.reduce(listOf(electedPair(emptyMap()), remoteInbound("RA", "audio", 0.12)))
        assertThat(stats.roundTripTimeMs).isWithin(1e-9).of(120.0)
    }

    @Test
    fun `the pair rtt wins over the remote-inbound one`() {
        val stats = CallStats.reduce(listOf(electedPair(mapOf("currentRoundTripTime" to 0.05)), remoteInbound("RA", "audio", 0.4)))
        assertThat(stats.roundTripTimeMs).isWithin(1e-9).of(50.0)
    }

    @Test
    fun `neither the pair nor the peer carries an rtt, it stays at zero`() {
        val stats = CallStats.reduce(listOf(electedPair(emptyMap()), remoteInbound("RA", "audio", null)))
        assertThat(stats.roundTripTimeMs).isEqualTo(0.0)
    }

    @Test
    fun `the fallback reads the first remote-inbound of the stream order, whatever the report order`() {
        val report = listOf(
            electedPair(emptyMap()),
            remoteInbound("RV", "video", 0.3),
            remoteInbound("RB", "audio", 0.2),
            remoteInbound("RA", "audio", 0.12),
        )
        listOf(report, report.reversed()).forEach {
            assertThat(CallStats.reduce(it).roundTripTimeMs).isWithin(1e-9).of(120.0)
        }
    }

    @Test
    fun `a non finite or negative remote rtt is skipped for the next one`() {
        listOf(Double.NaN, -1.0, Double.POSITIVE_INFINITY).forEach { aberrant ->
            val stats = CallStats.reduce(
                listOf(electedPair(emptyMap()), remoteInbound("RA", "audio", aberrant), remoteInbound("RB", "audio", 0.2)),
            )
            assertThat(stats.roundTripTimeMs).isWithin(1e-9).of(200.0)
        }
    }

    @Test
    fun `a remote rtt of zero is a measure and ends the fallback`() {
        val stats = CallStats.reduce(
            listOf(electedPair(emptyMap()), remoteInbound("RA", "audio", 0.0), remoteInbound("RB", "audio", 0.2)),
        )
        assertThat(stats.roundTripTimeMs).isEqualTo(0.0)
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
    fun `accumulated packet counters saturate instead of wrapping negative`() {
        val big = 2_000_000_000.0
        val stats = CallStats.reduce(
            listOf(
                entry("a1", "inbound-rtp", "audio", mapOf("packetsLost" to big, "packetsReceived" to big)),
                entry("a2", "inbound-rtp", "audio", mapOf("packetsLost" to big, "packetsReceived" to big)),
                entry("v", "inbound-rtp", "video", mapOf("packetsReceived" to big)),
                entry("o1", "outbound-rtp", "audio", mapOf("packetsSent" to big)),
                entry("o2", "outbound-rtp", "video", mapOf("packetsSent" to big)),
            ),
        )
        assertThat(stats.packetsLost).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.inboundAudioPackets).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.inboundPacketsReceived).isEqualTo(Int.MAX_VALUE)
        assertThat(stats.outboundPacketsSent).isEqualTo(Int.MAX_VALUE)
    }

    // --- octets : au-delà de 2 Go (#20132) ----------------------------------

    @Test
    fun `bytes keep a cumul beyond 2 GB and zero the aberrant`() {
        assertThat(CallStatValue.bytes(3e9)).isEqualTo(3_000_000_000L)
        assertThat(CallStatValue.bytes(42.9)).isEqualTo(42L)
        listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, -3.0).forEach {
            assertThat(CallStatValue.bytes(it)).isEqualTo(0L)
        }
    }

    @Test
    fun `bytes beyond the plausibility bound are aberrant, as on iOS`() {
        assertThat(CallStatValue.MAX_SAFE_BYTES).isEqualTo(9_007_199_254_740_991L)
        assertThat(CallStatValue.bytes(CallStatValue.MAX_SAFE_BYTES.toDouble())).isEqualTo(CallStatValue.MAX_SAFE_BYTES)
        assertThat(CallStatValue.bytes(1e16)).isEqualTo(0L)
        assertThat(CallStatValue.bytes(Double.MAX_VALUE)).isEqualTo(0L)
    }

    @Test
    fun `byte sums add beyond 2 GB and saturate at the bound without overflowing`() {
        assertThat(CallStatValue.sumBytes(2_000_000_000L, 2_000_000_000L)).isEqualTo(4_000_000_000L)
        assertThat(CallStatValue.sumBytes(CallStatValue.MAX_SAFE_BYTES, 1L)).isEqualTo(CallStatValue.MAX_SAFE_BYTES)
        assertThat(CallStatValue.sumBytes(Long.MAX_VALUE, Long.MAX_VALUE)).isEqualTo(CallStatValue.MAX_SAFE_BYTES)
    }

    @Test
    fun `a 3 GB cumul is served as is by reduce`() {
        val stats = CallStats.reduce(
            listOf(
                entry("ov", "outbound-rtp", "video", mapOf("bytesSent" to 3e9)),
                entry("iv", "inbound-rtp", "video", mapOf("bytesReceived" to 3e9)),
            ),
        )
        assertThat(stats.bandwidth).isEqualTo(3_000_000_000L)
        assertThat(stats.inboundVideoBytes).isEqualTo(3_000_000_000L)
        assertThat(stats.bytesReceived).isEqualTo(3_000_000_000L)
    }

    @Test
    fun `two 2 GB streams sum to 4 GB`() {
        val big = 2e9
        val stats = CallStats.reduce(
            listOf(
                entry("a1", "inbound-rtp", "audio", mapOf("bytesReceived" to big)),
                entry("a2", "inbound-rtp", "audio", mapOf("bytesReceived" to big)),
                entry("v", "inbound-rtp", "video", mapOf("bytesReceived" to big)),
                entry("o1", "outbound-rtp", "audio", mapOf("bytesSent" to big)),
                entry("o2", "outbound-rtp", "video", mapOf("bytesSent" to big)),
            ),
        )
        assertThat(stats.inboundAudioBytes).isEqualTo(4_000_000_000L)
        assertThat(stats.inboundVideoBytes).isEqualTo(2_000_000_000L)
        assertThat(stats.bytesReceived).isEqualTo(6_000_000_000L)
        assertThat(stats.bandwidth).isEqualTo(4_000_000_000L)
    }

    @Test
    fun `a stream crossing 2 GB keeps the cumulative bytes growing`() {
        fun tick(video: Double) = CallStats.reduce(
            listOf(
                entry("oa", "outbound-rtp", "audio", mapOf("bytesSent" to 4e7)),
                entry("ov", "outbound-rtp", "video", mapOf("bytesSent" to video)),
                entry("iv", "inbound-rtp", "video", mapOf("bytesReceived" to video)),
            ),
        )
        assertThat(tick(2.2e9).bandwidth).isGreaterThan(tick(2.1e9).bandwidth)
        assertThat(tick(2.2e9).bytesReceived).isGreaterThan(tick(2.1e9).bytesReceived)
        assertThat(tick(2.2e9).inboundVideoBytes).isEqualTo(2_200_000_000L)
    }

    @Test
    fun `a byte cumul at the bound never goes back when another stream adds`() {
        val atBound = CallStatValue.MAX_SAFE_BYTES.toDouble()
        val one = CallStats.reduce(listOf(entry("o1", "outbound-rtp", "video", mapOf("bytesSent" to atBound))))
        val two = CallStats.reduce(
            listOf(
                entry("o1", "outbound-rtp", "video", mapOf("bytesSent" to atBound)),
                entry("o2", "outbound-rtp", "audio", mapOf("bytesSent" to 1e6)),
            ),
        )
        assertThat(two.bandwidth).isAtLeast(one.bandwidth)
        assertThat(two.bandwidth).isEqualTo(CallStatValue.MAX_SAFE_BYTES)
    }

    // --- octets persistés : relecture des anciennes clés Int (#20132) -------

    @Test
    fun `a stored byte count prefers the Long key and falls back to the legacy Int one`() {
        assertThat(CallStatValue.storedBytes(stored = 3_000_000_000L, legacy = 900)).isEqualTo(3_000_000_000L)
        assertThat(CallStatValue.storedBytes(stored = null, legacy = 900)).isEqualTo(900L)
        assertThat(CallStatValue.storedBytes(stored = null, legacy = Int.MAX_VALUE)).isEqualTo(Int.MAX_VALUE.toLong())
        assertThat(CallStatValue.storedBytes(stored = null, legacy = null)).isEqualTo(0L)
    }

    @Test
    fun `a stored byte count out of the safe range reads as unmeasured`() {
        assertThat(CallStatValue.storedBytes(stored = -1L, legacy = 900)).isEqualTo(0L)
        assertThat(CallStatValue.storedBytes(stored = Long.MAX_VALUE, legacy = null)).isEqualTo(0L)
        assertThat(CallStatValue.storedBytes(stored = null, legacy = -5)).isEqualTo(0L)
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
                electedPair(mapOf("currentRoundTripTime" to 0.08, "availableOutgoingBitrate" to 1_500_000.7)),
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
        assertThat(stats.inboundAudioBytes).isEqualTo(72_000L)
        assertThat(stats.inboundVideoBytes).isEqualTo(2_400_000L)
        assertThat(stats.bytesReceived).isEqualTo(2_472_000L)
        assertThat(stats.outboundPacketsSent).isEqualTo(3_100)
        assertThat(stats.bandwidth).isEqualTo(2_500_000L)
        assertThat(stats.jitterMs).isWithin(1e-9).of(15.0)
    }
}
