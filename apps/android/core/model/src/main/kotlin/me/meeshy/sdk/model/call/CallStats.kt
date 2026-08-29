package me.meeshy.sdk.model.call

/**
 * The reduced connection-stats snapshot for one WebRTC quality tick — the Android
 * SSOT ported from iOS `CallStats` (`WebRTCTypes.swift` §5.7).
 *
 * Every packet/byte field is a **cumulative** counter, exactly as libwebrtc reports
 * it: [packetsLost] and [inboundPacketsReceived] only ever grow over a call's life.
 * A single tick's classification therefore never reads these raw counts as a
 * fraction (a lone lost packet would look like >100 % loss and pin the tier to
 * critical for the rest of the call — the P1-4 bug iOS documents). Instead
 * [intervalQualitySample] derives the loss RATIO from the delta between two
 * snapshots.
 *
 * The framework-agnostic split mirrors iOS: the (device-only) WebRTC actuator reads
 * `RTCStatsReport` into a `List<`[RawEntry]`>`, then [reduce] turns it into a
 * `CallStats`. That keeps the arithmetic — per-kind sums, codec resolution, the
 * jitter mean — pure and unit-testable without a live peer connection.
 */
public data class CallStats(
    /** Current round-trip time in milliseconds (from the selected candidate-pair). */
    val roundTripTimeMs: Double = 0.0,
    /** Cumulative inbound packets lost across all kinds. */
    val packetsLost: Int = 0,
    /** Cumulative bytes sent (paired with [bytesReceived] to report data spent). */
    val bandwidth: Int = 0,
    /** Cumulative bytes received. */
    val bytesReceived: Int = 0,
    /** Resolved codec name (e.g. `"opus"`, `"H264"`), or `null` when unknown. */
    val codec: String? = null,
    /** Cumulative inbound packets received (audio + video). */
    val inboundPacketsReceived: Int = 0,
    /** Cumulative inbound **audio** packets received. */
    val inboundAudioPackets: Int = 0,
    /** Cumulative inbound **video** packets received. */
    val inboundVideoPackets: Int = 0,
    /** Cumulative outbound packets sent (drives half-open self-heal detection). */
    val outboundPacketsSent: Int = 0,
    /**
     * TWCC/GCC available-outgoing-bitrate estimate (bps) from `candidate-pair`.
     * `0` = Transport-CC not yet active. When non-zero this is a more authoritative
     * ceiling signal than the RTT/loss heuristic.
     */
    val availableOutgoingBitrateBps: Int = 0,
    /** Mean inbound-audio jitter in milliseconds (libwebrtc reports seconds). */
    val jitterMs: Double = 0.0,
) {
    /**
     * The interval [CallQualitySample] this snapshot yields against the [previous]
     * one — [roundTripTimeMs] straight off this snapshot, and loss as the **delta**
     * ratio `Δlost / (Δlost + Δreceived)` (a fraction in `0.0`–`1.0`, never the raw
     * cumulative count).
     *
     * A `null` [previous] (the first tick) treats every counter as fresh from `0`.
     * A counter that went *down* since [previous] (an ICE restart / re-negotiation
     * resets libwebrtc's counters) clamps its delta at `0`, so a reset can never
     * read as negative loss or a spurious `1.0`. When no packets moved this interval
     * (`denom == 0`) the loss is `0.0` — no evidence of loss, not certain loss.
     *
     * Parity with iOS `WebRTCService.adjustBitrate`'s loss-ratio (the fraction that
     * feeds `VideoQualityLevel.from`), NOT its `packetLossPercent` (that ×100 value
     * is only for the gateway call-quality report).
     */
    public fun intervalQualitySample(previous: CallStats?): CallQualitySample {
        val deltaLost = (packetsLost - (previous?.packetsLost ?: 0)).coerceAtLeast(0)
        val deltaReceived =
            (inboundPacketsReceived - (previous?.inboundPacketsReceived ?: 0)).coerceAtLeast(0)
        val denom = deltaLost + deltaReceived
        val lossRatio = if (denom > 0) deltaLost.toDouble() / denom else 0.0
        return CallQualitySample(rttMs = roundTripTimeMs, packetLoss = lossRatio)
    }

    /**
     * A minimal projection of one `RTCStatistics` entry — the framework-agnostic
     * input to [reduce]. The device WebRTC actuator adapts each `RTCStatsReport`
     * entry (an `NSObject`/framework value graph) into this pure value type so the
     * reducer never touches a framework type.
     */
    public data class RawEntry(
        /** Stats-graph node id (a `codec` entry is pointed at by [codecId]). */
        val id: String,
        /** `"candidate-pair"` | `"inbound-rtp"` | `"outbound-rtp"` | `"codec"` | … */
        val type: String,
        /** `"audio"` | `"video"` on inbound/outbound-rtp entries. */
        val kind: String? = null,
        /** On an rtp entry: the id of the `codec` entry describing it. */
        val codecId: String? = null,
        /** Only on `codec` entries, e.g. `"audio/opus"`. */
        val mimeType: String? = null,
        /** The numeric stats fields already adapted to `Double`. */
        val values: Map<String, Double> = emptyMap(),
    )

    public companion object {
        /**
         * Pure reducer over the projected [entries] (iOS `CallStats.reduce`).
         *
         * - `candidate-pair` sets [roundTripTimeMs] (`currentRoundTripTime` ×1000)
         *   and [availableOutgoingBitrateBps] (`availableOutgoingBitrate`, truncated).
         * - `inbound-rtp` sums [packetsLost] and [bytesReceived]; splits
         *   `packetsReceived` into [inboundAudioPackets] / [inboundVideoPackets] by
         *   [RawEntry.kind]; accumulates the audio jitter mean; and remembers the
         *   FIRST inbound entry's [RawEntry.codecId] as the primary codec.
         * - `outbound-rtp` sums [outboundPacketsSent] and [bandwidth] (`bytesSent`).
         * - the primary codec id is resolved to a name via its `codec` entry's
         *   `mimeType` (`"audio/opus"` → `"opus"`); unknown → `null`.
         *
         * An empty list yields the all-zero snapshot. Missing numeric fields default
         * to `0`. The reducer never throws.
         */
        public fun reduce(entries: List<RawEntry>): CallStats {
            var rtt = 0.0
            var availableOutgoingBitrateBps = 0
            var packetsLost = 0
            var bytesSent = 0
            var bytesReceived = 0
            var inboundAudio = 0
            var inboundVideo = 0
            var outbound = 0
            var primaryCodecId: String? = null
            var audioJitterSum = 0.0
            var audioJitterCount = 0

            val codecMime: Map<String, String> = entries
                .filter { it.type == "codec" && it.mimeType != null }
                .associate { it.id to it.mimeType!! }

            for (entry in entries) {
                when (entry.type) {
                    "candidate-pair" -> {
                        entry.values["currentRoundTripTime"]?.let { rtt = it * 1000 }
                        entry.values["availableOutgoingBitrate"]?.let {
                            availableOutgoingBitrateBps = it.toInt()
                        }
                    }

                    "inbound-rtp" -> {
                        entry.values["packetsLost"]?.let { packetsLost += it.toInt() }
                        val received = (entry.values["packetsReceived"] ?: 0.0).toInt()
                        if (entry.kind == "video") {
                            inboundVideo += received
                        } else {
                            inboundAudio += received
                            entry.values["jitter"]?.let {
                                audioJitterSum += it
                                audioJitterCount += 1
                            }
                        }
                        bytesReceived += (entry.values["bytesReceived"] ?: 0.0).toInt()
                        if (primaryCodecId == null) primaryCodecId = entry.codecId
                    }

                    "outbound-rtp" -> {
                        outbound += (entry.values["packetsSent"] ?: 0.0).toInt()
                        bytesSent += (entry.values["bytesSent"] ?: 0.0).toInt()
                    }

                    else -> Unit
                }
            }

            val resolvedCodec: String? = primaryCodecId
                ?.let { codecMime[it] }
                ?.let { mime -> mime.split("/").filter(String::isNotEmpty).lastOrNull() ?: mime }

            val jitterMs =
                if (audioJitterCount > 0) (audioJitterSum / audioJitterCount) * 1000 else 0.0

            return CallStats(
                roundTripTimeMs = rtt,
                packetsLost = packetsLost,
                bandwidth = bytesSent,
                bytesReceived = bytesReceived,
                codec = resolvedCodec,
                inboundPacketsReceived = inboundAudio + inboundVideo,
                inboundAudioPackets = inboundAudio,
                inboundVideoPackets = inboundVideo,
                outboundPacketsSent = outbound,
                availableOutgoingBitrateBps = availableOutgoingBitrateBps,
                jitterMs = jitterMs,
            )
        }
    }
}
