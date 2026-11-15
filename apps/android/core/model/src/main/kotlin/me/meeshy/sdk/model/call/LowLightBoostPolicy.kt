package me.meeshy.sdk.model.call

/**
 * The parameters of the automatic low-light-boost pass an in-call video-filter
 * actuator applies to a captured frame before any user preset. Pure value model —
 * the SSOT the WebRTC capture-frame actuator reads to configure its exposure /
 * denoise / saturation filters (Android `RenderEffect`/GPU, iOS Core Image).
 *
 * @property exposureEv exposure-value gain (iOS `CIExposureAdjust.inputEV`).
 * @property noiseReductionLevel denoise strength (iOS `CINoiseReduction.inputNoiseLevel`).
 * @property noiseReductionSharpness denoise sharpness (iOS `inputSharpness`), constant
 *   while the pass is active.
 * @property saturation saturation multiplier (iOS `CIColorControls.inputSaturation`);
 *   `1.0` is neutral, always `> 1.0` while boosting.
 */
data class LowLightBoost(
    val exposureEv: Float,
    val noiseReductionLevel: Float,
    val noiseReductionSharpness: Float,
    val saturation: Float,
)

/**
 * The pure decision for the automatic low-light boost — a total, side-effect-free
 * port of iOS `VideoFilterPipeline.applyLowLightBoost` (§14.2.4). Given the average
 * luma of a captured frame it decides whether to lift a dim scene and by how much,
 * so the maths is unit-testable without a real capture buffer or GPU.
 *
 * The boost is automatic (not a user preset): it runs first in the pipeline, kicks
 * in only below the dark threshold, and scales linearly to full strength at pitch
 * black. Above the threshold the frame is already well-lit and forwarded untouched.
 */
object LowLightBoostPolicy {

    /** Max value of an 8-bit luma sample; the average brightness is in `0..255`. */
    const val MAX_LUMA: Float = 255f

    /**
     * Normalised-brightness ceiling below which the boost activates (iOS `0.3`). A
     * frame at or above this is well-lit enough to leave alone.
     */
    const val TRIGGER_THRESHOLD: Float = 0.3f

    /** Exposure-value gain at full boost strength (iOS `boostFactor * 1.5`). */
    const val EXPOSURE_EV_GAIN: Float = 1.5f

    /** Denoise-level gain at full boost strength (iOS `boostFactor * 0.02`). */
    const val NOISE_LEVEL_GAIN: Float = 0.02f

    /** Denoise sharpness, constant while the pass is active (iOS `0.4`). */
    const val NOISE_SHARPNESS: Float = 0.4f

    /** Saturation gain added at full boost strength (iOS `1.0 + boostFactor * 0.2`). */
    const val SATURATION_GAIN: Float = 0.2f

    /**
     * The boost for a frame whose sub-sampled average luma is [averageBrightness]
     * (`0..255`, or `null` for "no usable reading" — see [FrameLuminance]).
     *
     * Returns `null` — meaning "forward the frame untouched" — for a null reading
     * or any frame at/above the [TRIGGER_THRESHOLD]. Otherwise the boost factor is
     * `(threshold − normalised) / threshold`, **clamped to `0..1`** so a degenerate
     * negative reading can never over-boost (a strict-but-safe hardening over iOS,
     * whose luma is always `0..255`).
     */
    fun plan(averageBrightness: Float?): LowLightBoost? {
        if (averageBrightness == null) return null
        val normalized = averageBrightness / MAX_LUMA
        if (normalized >= TRIGGER_THRESHOLD) return null
        val boostFactor = ((TRIGGER_THRESHOLD - normalized) / TRIGGER_THRESHOLD).coerceIn(0f, 1f)
        return LowLightBoost(
            exposureEv = boostFactor * EXPOSURE_EV_GAIN,
            noiseReductionLevel = boostFactor * NOISE_LEVEL_GAIN,
            noiseReductionSharpness = NOISE_SHARPNESS,
            saturation = 1f + boostFactor * SATURATION_GAIN,
        )
    }

    /**
     * The actuator's one-call seam: average the frame's Y plane through
     * [FrameLuminance] and hand the reading to [plan]. A degenerate geometry yields
     * a `null` reading and therefore no boost — the frame is forwarded untouched.
     */
    fun planForFrame(
        yPlane: ByteArray,
        width: Int,
        height: Int,
        rowStride: Int = width,
        step: Int = FrameLuminance.DEFAULT_SAMPLE_STEP,
    ): LowLightBoost? = plan(FrameLuminance.averageOfYPlane(yPlane, width, height, rowStride, step))
}
