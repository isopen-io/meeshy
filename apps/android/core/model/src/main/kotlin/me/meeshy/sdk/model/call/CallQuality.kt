package me.meeshy.sdk.model.call

/**
 * Immutable tuning constants for connection-quality classification — the Android
 * SSOT ported from iOS `QualityThresholds` (`WebRTCTypes.swift`). Kept in one
 * place so the tiering in [VideoQualityLevel] reads as pure policy and every
 * boundary is a named value a test can pin.
 *
 * All thresholds are enforced with a **strict** `>` (a value exactly on a
 * threshold stays in the better tier), matching iOS.
 */
object CallQualityThresholds {
    /** RTT (ms) at or below which a link is excellent. */
    const val EXCELLENT_RTT_MS: Double = 100.0

    /** RTT (ms) boundary between good and fair video. */
    const val VIDEO_FAIR_RTT_MS: Double = 200.0

    /** RTT (ms) boundary between fair and poor video. */
    const val VIDEO_POOR_RTT_MS: Double = 300.0

    /** RTT (ms) ceiling above which the link is critical (severe congestion). */
    const val POOR_RTT_MS: Double = 500.0

    /** Packet-loss fraction at or below which a link is excellent. */
    const val EXCELLENT_PACKET_LOSS: Double = 0.01

    /** Packet-loss boundary between fair and poor video. */
    const val VIDEO_FAIR_PACKET_LOSS: Double = 0.03

    /** Packet-loss boundary between good and poor video. */
    const val GOOD_PACKET_LOSS: Double = 0.05

    /** Packet-loss ceiling above which the link is critical. */
    const val POOR_PACKET_LOSS: Double = 0.10

    /** TWCC/GCC available-outgoing-bitrate (bps) floor for each tier. */
    const val BWE_EXCELLENT_BPS: Int = 2_000_000
    const val BWE_GOOD_BPS: Int = 1_000_000
    const val BWE_FAIR_BPS: Int = 400_000
    const val BWE_POOR_BPS: Int = 150_000
}

/**
 * The five-tier client-side call-quality ladder, ordered `CRITICAL < POOR < FAIR
 * < GOOD < EXCELLENT`. Port of iOS `VideoQualityLevel`; each tier carries the
 * encoder caps the future WebRTC sender ladder will apply, and the classifiers
 * ([from]) turn a live stats sample into a tier.
 *
 * Pure and Compose-agnostic so it unit-tests on the JVM; the connection-quality
 * indicator UI consumes the collapsed [ConnectionQuality], and the adaptive
 * bitrate ladder consumes the tier caps directly.
 */
enum class VideoQualityLevel {
    CRITICAL,
    POOR,
    FAIR,
    GOOD,
    EXCELLENT,
    ;

    /** Portrait height (px) the sender targets for this tier; `0` at critical. */
    val targetResolutionHeight: Int
        get() = when (this) {
            EXCELLENT -> 720
            GOOD -> 720
            FAIR -> 480
            POOR -> 360
            CRITICAL -> 0
        }

    /** Frame rate the sender targets for this tier; `0` at critical. */
    val targetFps: Int
        get() = when (this) {
            EXCELLENT -> 30
            GOOD -> 24
            FAIR -> 20
            POOR -> 15
            CRITICAL -> 0
        }

    /** Max video bitrate (bps) the sender targets for this tier; `0` at critical. */
    val targetVideoBitrateBps: Int
        get() = when (this) {
            EXCELLENT -> 2_500_000
            GOOD -> 1_500_000
            FAIR -> 800_000
            POOR -> 400_000
            CRITICAL -> 0
        }

    companion object {
        /**
         * Classify a stats sample by round-trip time and packet loss, taking the
         * **worse** of the two axes. Strict `>` boundaries: a value exactly on a
         * threshold stays in the better tier (parity with iOS).
         */
        fun from(rttMs: Double, packetLoss: Double): VideoQualityLevel = when {
            rttMs > CallQualityThresholds.POOR_RTT_MS ||
                packetLoss > CallQualityThresholds.POOR_PACKET_LOSS -> CRITICAL

            rttMs > CallQualityThresholds.VIDEO_POOR_RTT_MS ||
                packetLoss > CallQualityThresholds.GOOD_PACKET_LOSS -> POOR

            rttMs > CallQualityThresholds.VIDEO_FAIR_RTT_MS ||
                packetLoss > CallQualityThresholds.VIDEO_FAIR_PACKET_LOSS -> FAIR

            rttMs > CallQualityThresholds.EXCELLENT_RTT_MS ||
                packetLoss > CallQualityThresholds.EXCELLENT_PACKET_LOSS -> GOOD

            else -> EXCELLENT
        }

        /**
         * Classify by the TWCC/GCC available-outgoing-bitrate estimate (bps).
         * `0` (estimate not yet available) is [CRITICAL].
         */
        fun from(availableOutgoingBitrateBps: Int): VideoQualityLevel = when {
            availableOutgoingBitrateBps >= CallQualityThresholds.BWE_EXCELLENT_BPS -> EXCELLENT
            availableOutgoingBitrateBps >= CallQualityThresholds.BWE_GOOD_BPS -> GOOD
            availableOutgoingBitrateBps >= CallQualityThresholds.BWE_FAIR_BPS -> FAIR
            availableOutgoingBitrateBps >= CallQualityThresholds.BWE_POOR_BPS -> POOR
            else -> CRITICAL
        }
    }
}

/**
 * A single connection-quality stats sample — the minimal input the future WebRTC
 * stats collector feeds the [me.meeshy.app] call layer once per stats tick.
 * [rttMs] is the current round-trip time in milliseconds; [packetLoss] is the
 * inbound loss fraction (`0.0`–`1.0`).
 */
data class CallQualitySample(
    val rttMs: Double,
    val packetLoss: Double,
) {
    /** The quality tier this sample classifies to (rtt/loss ladder). */
    fun level(): VideoQualityLevel = VideoQualityLevel.from(rttMs, packetLoss)
}

/**
 * The four-tier connection-quality **indicator** shown on the call screen — the
 * five-tier [VideoQualityLevel] collapsed with `CRITICAL → POOR`, matching iOS
 * `CallManager.connectionQualityLabel(for:)`. The signal-bars UI reads [bars];
 * [isWeak] flags the tier that should warn the user (rendered in the error hue).
 */
enum class ConnectionQuality {
    POOR,
    FAIR,
    GOOD,
    EXCELLENT,
    ;

    /** Filled signal bars (1–4) for this tier. */
    val bars: Int
        get() = when (this) {
            EXCELLENT -> 4
            GOOD -> 3
            FAIR -> 2
            POOR -> 1
        }

    /** True for the weakest tier — the indicator warns (error hue) here. */
    val isWeak: Boolean
        get() = this == POOR

    companion object {
        /** Collapse the five-tier ladder onto the four-tier indicator. */
        fun from(level: VideoQualityLevel): ConnectionQuality = when (level) {
            VideoQualityLevel.EXCELLENT -> EXCELLENT
            VideoQualityLevel.GOOD -> GOOD
            VideoQualityLevel.FAIR -> FAIR
            VideoQualityLevel.POOR, VideoQualityLevel.CRITICAL -> POOR
        }
    }
}
