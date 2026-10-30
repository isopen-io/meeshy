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
 * blur, then the colour, then the stylized face effect).
 *
 * @property look the graded look, `null` when the colorimetry is off, Natural or hand-tuned.
 * @property brightness the user's additive offset (−0.3…0.3), 0 when the colorimetry is off.
 * @property retouch Natural complexion and skin smoothing on the tracked face (#9196), `null` when neither
 *   applies; it only draws once a face is known.
 * @property blur the segmentation rung of the background blur, `null` when off or shed.
 * @property blurRadius the blur radius in full-resolution pixels.
 * @property stylized the stylized face effect (toad, angel, demon, eruption), `null` without one.
 * @property isFaceDegraded the device struggles: the face effects spend less (iOS `isFaceDegraded`).
 */
data class CallVideoEffectsPlan(
    val look: VideoFilterPreset?,
    val brightness: Float,
    val retouch: CallSkinRetouchPlan?,
    val blur: CallBlurTier.Segmentation?,
    val blurRadius: Double,
    val stylized: CallFaceEffect? = null,
    val isFaceDegraded: Boolean = false,
) {
    val blurActive: Boolean get() = blur != null

    /** Whether the frame needs the tracked face: for the retouch, or for a stylized effect drawn on it. */
    val needsFace: Boolean get() = retouch != null || stylized?.needsFace == true

    /**
     * Whether the frame is drawn at all. The retouch alone waits for a face (iOS: no face known, the frame goes
     * out as is and costs nothing more); everything else draws without one.
     */
    fun draws(faceKnown: Boolean): Boolean =
        look != null || brightness != 0f || blur != null || stylized != null || (retouch != null && faceKnown)

    companion object {
        fun make(config: VideoFilterConfig, ladder: CallVideoDegradation, isConstrained: Boolean): CallVideoEffectsPlan? {
            val retouch = CallSkinRetouchPlan.make(config, ladder, isConstrained)
            if (!config.hasChosenFilters && retouch == null) return null
            val look = config.activePreset?.takeIf { CallColorLook.recipe(it) != null }
            val brightness = if (config.isEnabled) config.brightness else 0f
            val blur = if (config.backgroundBlurEnabled) ladder.blurTier(isConstrained).segmentation else null
            val stylized = config.activeFaceEffect.takeIf { it.isStylized }
            if (look == null && brightness == 0f && retouch == null && blur == null && stylized == null) return null
            val isFaceDegraded = ladder.tier != CallBlurTier.Balanced || ladder.isSmoothingDegraded || isConstrained
            return CallVideoEffectsPlan(look, brightness, retouch, blur, config.backgroundBlurRadius, stylized, isFaceDegraded)
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
