package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural tests for the pure WebRTC-stats reducer — the Android port of iOS
 * `CallStats.reduce(entries:)` (`WebRTCTypes.swift` §5.7) and the interval
 * loss-ratio (`WebRTCService.adjustBitrate`).
 *
 * The reducer sums CUMULATIVE libwebrtc counters per stats kind; the interval
 * sample turns two cumulative snapshots into the loss FRACTION the quality ladder
 * consumes. Tests assert through the two public entry points ([CallStats.reduce],
 * [CallStats.intervalQualitySample]) — never internal accumulators.
 */
class CallStatsTest {

    private fun entry(
        id: String,
        type: String,
        kind: String? = null,
        codecId: String? = null,
        mimeType: String? = null,
        values: Map<String, Double> = emptyMap(),
    ) = CallStats.RawEntry(id, type, kind, codecId, mimeType, values)

    // --- reduce: empty & defaults ------------------------------------------

    @Test
    fun `an empty report reduces to the all-zero snapshot`() {
        assertThat(CallStats.reduce(emptyList())).isEqualTo(CallStats())
    }

    @Test
    fun `an inbound entry with no numeric fields contributes zeros`() {
        val stats = CallStats.reduce(listOf(entry("i", "inbound-rtp", kind = "audio")))
        assertThat(stats.packetsLost).isEqualTo(0)
        assertThat(stats.inboundAudioPackets).isEqualTo(0)
        assertThat(stats.bytesReceived).isEqualTo(0)
        assertThat(stats.jitterMs).isEqualTo(0.0)
    }

    @Test
    fun `unknown entry types are ignored`() {
        val stats = CallStats.reduce(
            listOf(
                entry("t", "transport", values = mapOf("packetsLost" to 999.0)),
                entry("s", "stream", values = mapOf("packetsReceived" to 999.0)),
            ),
        )
        assertThat(stats).isEqualTo(CallStats())
    }

    // --- reduce: candidate-pair --------------------------------------------

    @Test
    fun `candidate-pair sets rtt in milliseconds from seconds`() {
        // currentRoundTripTime is reported in SECONDS; 0.25s -> 250ms.
        val stats = CallStats.reduce(
            listOf(entry("cp", "candidate-pair", values = mapOf("currentRoundTripTime" to 0.25))),
        )
        assertThat(stats.roundTripTimeMs).isEqualTo(250.0)
    }

    @Test
    fun `candidate-pair sets the available outgoing bitrate truncated to an int`() {
        val stats = CallStats.reduce(
            listOf(entry("cp", "candidate-pair", values = mapOf("availableOutgoingBitrate" to 1_500_000.9))),
        )
        assertThat(stats.availableOutgoingBitrateBps).isEqualTo(1_500_000)
    }

    @Test
    fun `a candidate-pair without an rtt leaves rtt at zero`() {
        // Only the bitrate is present — rtt must not be invented.
        val stats = CallStats.reduce(
            listOf(entry("cp", "candidate-pair", values = mapOf("availableOutgoingBitrate" to 800_000.0))),
        )
        assertThat(stats.roundTripTimeMs).isEqualTo(0.0)
        assertThat(stats.availableOutgoingBitrateBps).isEqualTo(800_000)
    }

    // --- reduce: inbound-rtp per kind --------------------------------------

    @Test
    fun `an audio inbound entry accumulates audio packets loss bytes and jitter`() {
        val stats = CallStats.reduce(
            listOf(
                entry(
                    "ia", "inbound-rtp", kind = "audio",
                    values = mapOf(
                        "packetsReceived" to 500.0,
                        "packetsLost" to 5.0,
                        "bytesReceived" to 64_000.0,
                        "jitter" to 0.02,
                    ),
                ),
            ),
        )
        assertThat(stats.inboundAudioPackets).isEqualTo(500)
        assertThat(stats.inboundVideoPackets).isEqualTo(0)
        assertThat(stats.packetsLost).isEqualTo(5)
        assertThat(stats.bytesReceived).isEqualTo(64_000)
        // jitter reported in seconds -> milliseconds mean.
        assertThat(stats.jitterMs).isEqualTo(20.0)
    }

    @Test
    fun `a video inbound entry counts video packets and never contributes jitter`() {
        val stats = CallStats.reduce(
            listOf(
                entry(
                    "iv", "inbound-rtp", kind = "video",
                    values = mapOf(
                        "packetsReceived" to 900.0,
                        "packetsLost" to 3.0,
                        "jitter" to 0.5,
                    ),
                ),
            ),
        )
        assertThat(stats.inboundVideoPackets).isEqualTo(900)
        assertThat(stats.inboundAudioPackets).isEqualTo(0)
        assertThat(stats.packetsLost).isEqualTo(3)
        // Video jitter is intentionally excluded from the audio-jitter mean.
        assertThat(stats.jitterMs).isEqualTo(0.0)
    }

    @Test
    fun `inbound audio and video sum into total inbound packets`() {
        val stats = CallStats.reduce(
            listOf(
                entry("ia", "inbound-rtp", kind = "audio", values = mapOf("packetsReceived" to 500.0)),
                entry("iv", "inbound-rtp", kind = "video", values = mapOf("packetsReceived" to 900.0)),
            ),
        )
        assertThat(stats.inboundPacketsReceived).isEqualTo(1_400)
    }

    @Test
    fun `packet loss sums across multiple inbound streams`() {
        val stats = CallStats.reduce(
            listOf(
                entry("ia", "inbound-rtp", kind = "audio", values = mapOf("packetsLost" to 5.0)),
                entry("iv", "inbound-rtp", kind = "video", values = mapOf("packetsLost" to 7.0)),
            ),
        )
        assertThat(stats.packetsLost).isEqualTo(12)
    }

    @Test
    fun `jitter is averaged across multiple audio streams`() {
        // (0.02 + 0.04) / 2 = 0.03s -> 30ms.
        val stats = CallStats.reduce(
            listOf(
                entry("a1", "inbound-rtp", kind = "audio", values = mapOf("jitter" to 0.02)),
                entry("a2", "inbound-rtp", kind = "audio", values = mapOf("jitter" to 0.04)),
            ),
        )
        assertThat(stats.jitterMs).isEqualTo(30.0)
    }

    // --- reduce: outbound-rtp ----------------------------------------------

    @Test
    fun `outbound entries sum sent packets and bytes into bandwidth`() {
        val stats = CallStats.reduce(
            listOf(
                entry("oa", "outbound-rtp", kind = "audio", values = mapOf("packetsSent" to 480.0, "bytesSent" to 60_000.0)),
                entry("ov", "outbound-rtp", kind = "video", values = mapOf("packetsSent" to 1_200.0, "bytesSent" to 900_000.0)),
            ),
        )
        assertThat(stats.outboundPacketsSent).isEqualTo(1_680)
        assertThat(stats.bandwidth).isEqualTo(960_000)
    }

    // --- reduce: codec resolution ------------------------------------------

    @Test
    fun `the primary codec is resolved from the first inbound codec id to its name`() {
        val stats = CallStats.reduce(
            listOf(
                entry("c1", "codec", mimeType = "audio/opus"),
                entry("ia", "inbound-rtp", kind = "audio", codecId = "c1", values = mapOf("packetsReceived" to 10.0)),
            ),
        )
        assertThat(stats.codec).isEqualTo("opus")
    }

    @Test
    fun `the first inbound entry wins the primary codec`() {
        val stats = CallStats.reduce(
            listOf(
                entry("cAudio", "codec", mimeType = "audio/opus"),
                entry("cVideo", "codec", mimeType = "video/H264"),
                entry("ia", "inbound-rtp", kind = "audio", codecId = "cAudio", values = mapOf("packetsReceived" to 10.0)),
                entry("iv", "inbound-rtp", kind = "video", codecId = "cVideo", values = mapOf("packetsReceived" to 10.0)),
            ),
        )
        assertThat(stats.codec).isEqualTo("opus")
    }

    @Test
    fun `an inbound entry whose codec id has no codec entry resolves to null`() {
        val stats = CallStats.reduce(
            listOf(
                entry("ia", "inbound-rtp", kind = "audio", codecId = "missing", values = mapOf("packetsReceived" to 10.0)),
            ),
        )
        assertThat(stats.codec).isNull()
    }

    @Test
    fun `with no inbound entry the codec stays null`() {
        val stats = CallStats.reduce(
            listOf(entry("c1", "codec", mimeType = "audio/opus")),
        )
        assertThat(stats.codec).isNull()
    }

    // --- intervalQualitySample ---------------------------------------------

    @Test
    fun `a clean first tick has no previous so it reports zero loss and a live rtt`() {
        // previous == null treats the counters as fresh from 0; with no packets
        // lost the ratio is 0, and rtt is available on the very first tick.
        val current = CallStats(roundTripTimeMs = 120.0, packetsLost = 0, inboundPacketsReceived = 400)
        val sample = current.intervalQualitySample(previous = null)
        assertThat(sample.rttMs).isEqualTo(120.0)
        assertThat(sample.packetLoss).isEqualTo(0.0)
    }

    @Test
    fun `the first tick reports the cumulative-since-start loss ratio`() {
        // No previous snapshot: the whole cumulative count is the interval — the
        // best loss estimate available on the first tick (5 lost of 5+95 total).
        val current = CallStats(packetsLost = 5, inboundPacketsReceived = 95)
        assertThat(current.intervalQualitySample(previous = null).packetLoss)
            .isWithin(1e-9).of(0.05)
    }

    @Test
    fun `loss is the delta ratio between two snapshots, not the cumulative count`() {
        // A lone lost packet on a cumulative counter would look like huge loss; the
        // interval delta (2 lost of 2+98 total) is the real 2% fraction.
        val previous = CallStats(packetsLost = 8, inboundPacketsReceived = 900)
        val current = CallStats(roundTripTimeMs = 90.0, packetsLost = 10, inboundPacketsReceived = 998)
        val sample = current.intervalQualitySample(previous)
        assertThat(sample.packetLoss).isWithin(1e-9).of(0.02)
        assertThat(sample.rttMs).isEqualTo(90.0)
    }

    @Test
    fun `no packets moved this interval reports zero loss, not certain loss`() {
        val previous = CallStats(packetsLost = 10, inboundPacketsReceived = 1_000)
        val current = CallStats(packetsLost = 10, inboundPacketsReceived = 1_000)
        assertThat(current.intervalQualitySample(previous).packetLoss).isEqualTo(0.0)
    }

    @Test
    fun `a full counter reset clamps the delta so loss is never spurious`() {
        // ICE restart resets libwebrtc counters: current < previous on both axes.
        val previous = CallStats(packetsLost = 50, inboundPacketsReceived = 5_000)
        val current = CallStats(packetsLost = 1, inboundPacketsReceived = 100)
        assertThat(current.intervalQualitySample(previous).packetLoss).isEqualTo(0.0)
    }

    @Test
    fun `a loss-counter reset while receiving grows never yields negative loss`() {
        // Only the loss counter reset (stream replacement) while a fresh inbound
        // stream accrues received: Δlost is negative but Δreceived is large positive,
        // so an unclamped delta would divide to a NEGATIVE loss fraction.
        val previous = CallStats(packetsLost = 50, inboundPacketsReceived = 100)
        val current = CallStats(packetsLost = 1, inboundPacketsReceived = 1_000)
        assertThat(current.intervalQualitySample(previous).packetLoss).isEqualTo(0.0)
    }

    @Test
    fun `every new packet lost this interval reports total loss`() {
        val previous = CallStats(packetsLost = 0, inboundPacketsReceived = 100)
        val current = CallStats(packetsLost = 5, inboundPacketsReceived = 100)
        assertThat(current.intervalQualitySample(previous).packetLoss).isEqualTo(1.0)
    }

    // --- end-to-end: reduced stats classify to a tier ----------------------

    @Test
    fun `a healthy reduced snapshot classifies as excellent through the sample`() {
        val current = CallStats.reduce(
            listOf(
                entry("cp", "candidate-pair", values = mapOf("currentRoundTripTime" to 0.05)),
                entry("ia", "inbound-rtp", kind = "audio", values = mapOf("packetsReceived" to 500.0, "packetsLost" to 0.0)),
            ),
        )
        val sample = current.intervalQualitySample(previous = null)
        assertThat(sample.level()).isEqualTo(VideoQualityLevel.EXCELLENT)
    }

    @Test
    fun `a lossy long-haul interval classifies as a weaker tier through the sample`() {
        val previous = CallStats(roundTripTimeMs = 350.0, packetsLost = 0, inboundPacketsReceived = 900)
        val current = CallStats(roundTripTimeMs = 350.0, packetsLost = 60, inboundPacketsReceived = 1_000)
        // 60 lost of (60 + 100) new = 0.375 loss -> well past the critical band.
        assertThat(current.intervalQualitySample(previous).level()).isEqualTo(VideoQualityLevel.CRITICAL)
    }
}
