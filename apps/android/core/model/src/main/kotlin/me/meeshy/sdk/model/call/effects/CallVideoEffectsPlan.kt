package me.meeshy.sdk.model.call.effects

import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.activeFaceEffect
import me.meeshy.sdk.model.call.activePreset

/**
 * **CE QUE L'IMAGE ENVOYÉE REÇOIT, décidé une fois par image** — from the chosen config, the dose ladder
 * and the device state. `null` from [make]: nothing to do, the camera frame goes out untouched and costs
 * nothing more. Android's projection of iOS `VideoFilterPipeline.process` + `CallSkinRetouchPlan` +
 * `lensStages`: the order of the passes is the same (retouch on the sensor image, then the background
 * blur, then the colour).
 *
 * @property look the graded look, `null` when the colorimetry is off, Natural or hand-tuned.
 * @property brightness the user's additive offset (−0.3…0.3), 0 when the colorimetry is off.
 * @property smoothing skin smoothing strength 0…1, 0 when off or shed by the ladder — at half the overload
 *   streak, and for good once the ladder is exhausted (the « repli sans effet » of a slow device).
 * @property textureKept share of the fine texture (pores) re-injected by smoothing (iOS `textureKept`).
 * @property blur the segmentation rung of the background blur, `null` when off or shed.
 * @property blurRadius the blur radius in full-resolution pixels.
 */
data class CallVideoEffectsPlan(
    val look: VideoFilterPreset?,
    val brightness: Float,
    val smoothing: Float,
    val textureKept: Float,
    val blur: CallBlurTier.Segmentation?,
    val blurRadius: Double,
) {
    val blurActive: Boolean get() = blur != null

    companion object {
        const val TEXTURE_KEPT: Float = 0.35f

        /** The face effects the Android pipeline draws today; the stylized ones wait for face tracking. */
        val DRAWABLE_FACES: Set<CallFaceEffect> = setOf(CallFaceEffect.Smoothing)

        fun make(config: VideoFilterConfig, ladder: CallVideoDegradation, isConstrained: Boolean): CallVideoEffectsPlan? {
            if (!config.hasChosenFilters) return null
            val look = config.activePreset?.takeIf { CallColorLook.recipe(it) != null }
            val brightness = if (config.isEnabled) config.brightness else 0f
            val smoothing = if (config.activeFaceEffect == CallFaceEffect.Smoothing && !ladder.isSmoothingDegraded && !ladder.isExhausted) {
                config.skinSmoothingIntensity.coerceIn(0f, 1f)
            } else {
                0f
            }
            val blur = if (config.backgroundBlurEnabled) ladder.blurTier(isConstrained).segmentation else null
            if (look == null && brightness == 0f && smoothing == 0f && blur == null) return null
            return CallVideoEffectsPlan(look, brightness, smoothing, TEXTURE_KEPT, blur, config.backgroundBlurRadius)
        }

        /** A new mask is due once ~one segmentation interval has passed (iOS: 90 % of the interval). */
        fun isMaskDue(lastSubmissionNanos: Long?, nowNanos: Long, framesPerSecond: Double): Boolean {
            if (lastSubmissionNanos == null) return true
            val intervalNanos = 1_000_000_000.0 / framesPerSecond
            return (nowNanos - lastSubmissionNanos) >= intervalNanos * 0.9
        }
    }
}

/**
 * Where a point of the CAMERA buffer lands in the UPRIGHT image the segmenter sees, for a frame whose
 * buffer must be turned [rotation] degrees clockwise to stand up. Coordinates are normalised 0…1 with the
 * origin at the TOP-LEFT. The CPU copy handed to the segmenter and the GPU lookup of its mask both go
 * through this one law (the shader carries its literal mirror), so the mask cannot land rotated.
 */
object CallFrameOrientation {
    fun upright(u: Float, v: Float, rotation: Int): Pair<Float, Float> = when (normalised(rotation)) {
        90 -> (1f - v) to u
        180 -> (1f - u) to (1f - v)
        270 -> v to (1f - u)
        else -> u to v
    }

    /** The inverse of [upright]: which buffer point an upright point comes from. */
    fun buffer(u: Float, v: Float, rotation: Int): Pair<Float, Float> = when (normalised(rotation)) {
        90 -> v to (1f - u)
        180 -> (1f - u) to (1f - v)
        270 -> (1f - v) to u
        else -> u to v
    }

    /**
     * The pixel of a [bufferWidth] × [bufferHeight] buffer that lands at the upright pixel ([x], [y]),
     * packed `bufferX shl 16 or bufferY` so a per-pixel loop allocates nothing.
     */
    fun bufferPixel(x: Int, y: Int, bufferWidth: Int, bufferHeight: Int, rotation: Int): Int = when (normalised(rotation)) {
        90 -> pack(y, bufferHeight - 1 - x)
        180 -> pack(bufferWidth - 1 - x, bufferHeight - 1 - y)
        270 -> pack(bufferWidth - 1 - y, x)
        else -> pack(x, y)
    }

    private fun pack(x: Int, y: Int): Int = (x shl 16) or y

    /** The upright size of a [width] × [height] buffer. */
    fun uprightSize(width: Int, height: Int, rotation: Int): Pair<Int, Int> =
        if (normalised(rotation) % 180 == 0) width to height else height to width

    fun normalised(rotation: Int): Int = ((rotation % 360) + 360) % 360 / 90 * 90
}
