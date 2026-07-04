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

    /**
     * Sustained degraded (`POOR`/`CRITICAL`) duration, in seconds, before the
     * video-survival policy drops outbound video to audio-only. 6 s absorbs
     * transient spikes (cellular handoff, brief congestion) without prematurely
     * killing video while the link is still likely to recover on its own. Parity
     * with iOS `QualityThresholds.videoSurvivalSuspendAfterSeconds`.
     */
    const val VIDEO_SURVIVAL_SUSPEND_AFTER_SECONDS: Double = 6.0

    /**
     * Sustained good (`EXCELLENT`/`GOOD`) duration, in seconds, before the policy
     * re-enables outbound video. Intentionally longer than the suspend window:
     * re-acquiring the camera + renegotiating is expensive, so the link must have
     * clearly settled before committing. Parity with iOS
     * `QualityThresholds.videoSurvivalResumeAfterSeconds`.
     */
    const val VIDEO_SURVIVAL_RESUME_AFTER_SECONDS: Double = 10.0

    /**
     * Video bitrate (bps) floor the sender-cap plan applies at the `CRITICAL` tier
     * (whose [VideoQualityLevel.targetVideoBitrateBps] is `0`). Keeps video alive at
     * minimum cost rather than stalling the encoder. Parity with iOS
     * `QualityThresholds.minVideoBitrate`.
     */
    const val MIN_VIDEO_BITRATE_BPS: Int = 100_000

    /**
     * Frame-rate floor applied when [VideoQualityLevel.targetFps] is `0` (the `CRITICAL`
     * tier) — mirrors the `POOR` tier's fps so video keeps flowing instead of stalling on
     * an fps of zero. Parity with iOS `QualityThresholds.criticalVideoFloorFPS`.
     */
    const val CRITICAL_VIDEO_FLOOR_FPS: Int = 15

    /**
     * Resolution floor (portrait height, px) applied when
     * [VideoQualityLevel.targetResolutionHeight] is `0` (the `CRITICAL` tier). Together
     * with [MIN_VIDEO_BITRATE_BPS] and [CRITICAL_VIDEO_FLOOR_FPS] this defines the
     * 360p15 @ 100 kbps worst-case floor. Parity with iOS
     * `QualityThresholds.criticalVideoFloorHeight`.
     */
    const val CRITICAL_VIDEO_FLOOR_HEIGHT: Int = 360
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

    /**
     * The lowercase token the gateway expects in the `call:quality-report` `level`
     * field (`excellent|good|fair|poor`), matching the iOS
     * `MessageSocketManager.emitCallQualityReport` contract. Spelled out explicitly
     * (rather than `name.lowercase()`) so an enum rename can never silently change
     * the wire value the gateway persists.
     */
    val wireValue: String
        get() = when (this) {
            EXCELLENT -> "excellent"
            GOOD -> "good"
            FAIR -> "fair"
            POOR -> "poor"
        }

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

/**
 * The periodic call-quality + cumulative data-usage snapshot the client reports to
 * the gateway via `call:quality-report`. Pure port of the iOS
 * `MessageSocketManager.emitCallQualityReport` payload: the gateway persists the
 * last report before teardown on the `CallSession` so the call-summary message can
 * surface "data spent · network quality".
 *
 * [statsFields] is the single tested SSOT for the wire `stats` sub-object; the
 * `:sdk-core` `CallSignalManager` only wraps it in `{callId, stats}` and emits.
 *
 * [bytesSent]/[bytesReceived] are the **cumulative** WebRTC byte counters and are
 * modelled as [Long] (iOS uses a 64-bit `Int`) so a long video call whose totals
 * exceed the 32-bit range are reported faithfully rather than overflowing.
 */
data class CallQualityReport(
    val level: ConnectionQuality,
    val rttMs: Double,
    val packetLoss: Double,
    val bytesSent: Long,
    val bytesReceived: Long,
    val availableOutgoingBitrateBps: Int = 0,
    val jitterMs: Double = 0.0,
) {
    /**
     * The ordered `stats` map at iOS parity: the five base metrics are always
     * present; [availableOutgoingBitrateBps] and [jitterMs] are appended **only
     * when strictly positive** (a not-yet-available estimate of `0` — or a
     * degenerate negative — is dropped so the gateway never persists a
     * meaningless value).
     */
    fun statsFields(): Map<String, Any> = buildMap {
        put("level", level.wireValue)
        put("rtt", rttMs)
        put("packetLoss", packetLoss)
        put("bytesSent", bytesSent)
        put("bytesReceived", bytesReceived)
        if (availableOutgoingBitrateBps > 0) put("availableOutgoingBitrateBps", availableOutgoingBitrateBps)
        if (jitterMs > 0) put("jitterMs", jitterMs)
    }
}
