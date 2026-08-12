package me.meeshy.sdk.model.call

import kotlin.math.roundToInt

/**
 * Device thermal-pressure tier — a framework-agnostic port of iOS
 * `ProcessInfo.ThermalState`. Kept pure so the sender-cap policy unit-tests on the
 * JVM; the `:app` call layer maps Android `PowerManager.THERMAL_STATUS_*` onto this
 * (glue) before feeding [VideoSenderCapPlan.forConditions].
 */
enum class ThermalState {
    NOMINAL,
    FAIR,
    SERIOUS,
    CRITICAL,
}

/**
 * The multiplicative/absolute encoder ceiling a thermal tier imposes — the Android
 * SSOT ported from iOS `VideoThermalProfile.Ceiling`. A hot device sheds encode load
 * (the #1 cause of dropped frames + battery drain in long video calls) regardless of
 * how healthy the network looks.
 *
 * [bitrateFactor] multiplies the network bitrate target (`≤ 1`), [maxFramerate] is an
 * absolute fps cap, and [minScaleDownBy] is a floor on the resolution downscale
 * (`≥ 1`). [NOMINAL][ThermalState.NOMINAL] is a strict no-op so a cool device keeps
 * full quality.
 */
data class ThermalCeiling(
    val bitrateFactor: Double,
    val maxFramerate: Int,
    val minScaleDownBy: Double,
) {
    companion object {
        /** The ceiling for a thermal tier (parity with iOS `VideoThermalProfile.ceiling`). */
        fun forState(state: ThermalState): ThermalCeiling = when (state) {
            ThermalState.NOMINAL -> ThermalCeiling(bitrateFactor = 1.0, maxFramerate = 60, minScaleDownBy = 1.0)
            ThermalState.FAIR -> ThermalCeiling(bitrateFactor = 0.8, maxFramerate = 30, minScaleDownBy = 1.0)
            ThermalState.SERIOUS -> ThermalCeiling(bitrateFactor = 0.5, maxFramerate = 24, minScaleDownBy = 1.5)
            ThermalState.CRITICAL -> ThermalCeiling(bitrateFactor = 0.3, maxFramerate = 15, minScaleDownBy = 2.0)
        }
    }
}

/**
 * The concrete RTP video-sender parameters an actuator applies to the outbound video
 * track — the Android analogue of the arguments iOS `P2PWebRTCClient.applyVideoEncoding`
 * writes onto every `RTCRtpEncodingParameters`.
 *
 * [scaleResolutionDownBy] is expressed relative to the [VideoSenderCapPlan.CAPTURE_HEIGHT_PX]
 * capture height (`1.0` = full capture resolution; `2.0` = half). It is always `≥ 1.0` so
 * the encoder never upscales.
 */
data class VideoSenderCap(
    val maxBitrateBps: Int,
    val maxFramerate: Int,
    val scaleResolutionDownBy: Double,
)

/**
 * The pure adaptive sender-cap plan — the single tested SSOT that turns a
 * [VideoQualityLevel] (network) and a [ThermalState] (device) into the concrete
 * [VideoSenderCap] the future WebRTC sender-parameters actuator applies. Port of iOS
 * `WebRTCService.applyVideoQuality` composed with `VideoThermalProfile.apply`.
 *
 * The video track is **never toggled here** — on/off is the user's privacy control.
 * Even the worst tier is floored to a low-but-alive encoder rather than a zero one, so
 * severe congestion degrades gracefully instead of desyncing the peer.
 */
object VideoSenderCapPlan {
    /**
     * Portrait capture height (px) the [VideoSenderCap.scaleResolutionDownBy] is measured
     * against — the 720p capture preset (iOS `VideoConfig.hd720p30`). Kept as one constant
     * so the camera format picker and the encoder cap can never drift apart.
     */
    const val CAPTURE_HEIGHT_PX: Int = 720

    /**
     * The network-derived sender cap for a quality [level]. Each axis reads its target off
     * the tier, falling back to the CRITICAL floor when the tier's target is `0` (the
     * [VideoQualityLevel.CRITICAL] tier), yielding the 360p15 @ 100 kbps worst-case floor
     * rather than a stalled zero encoder.
     */
    fun forLevel(level: VideoQualityLevel): VideoSenderCap {
        val bitrate = level.targetVideoBitrateBps.takeIf { it > 0 }
            ?: CallQualityThresholds.MIN_VIDEO_BITRATE_BPS
        val fps = level.targetFps.takeIf { it > 0 }
            ?: CallQualityThresholds.CRITICAL_VIDEO_FLOOR_FPS
        val height = level.targetResolutionHeight.takeIf { it > 0 }
            ?: CallQualityThresholds.CRITICAL_VIDEO_FLOOR_HEIGHT
        val scale = maxOf(1.0, CAPTURE_HEIGHT_PX.toDouble() / height)
        return VideoSenderCap(maxBitrateBps = bitrate, maxFramerate = fps, scaleResolutionDownBy = scale)
    }

    /**
     * Compose the network cap for [level] with the [thermal] ceiling, taking the **more
     * conservative** value on each axis (lower bitrate, lower fps, steeper downscale).
     * Bitrate and fps never fall below `1`; the downscale never below `1.0`.
     */
    fun forConditions(level: VideoQualityLevel, thermal: ThermalState): VideoSenderCap {
        val net = forLevel(level)
        val ceiling = ThermalCeiling.forState(thermal)
        val bitrate = (net.maxBitrateBps * ceiling.bitrateFactor).roundToInt()
        val fps = minOf(net.maxFramerate, ceiling.maxFramerate)
        val scale = maxOf(net.scaleResolutionDownBy, ceiling.minScaleDownBy)
        return VideoSenderCap(
            maxBitrateBps = maxOf(1, bitrate),
            maxFramerate = maxOf(1, fps),
            scaleResolutionDownBy = maxOf(1.0, scale),
        )
    }
}
