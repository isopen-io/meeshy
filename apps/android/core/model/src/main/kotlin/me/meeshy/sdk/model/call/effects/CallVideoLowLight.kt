package me.meeshy.sdk.model.call.effects

import me.meeshy.sdk.model.call.LowLightBoost
import me.meeshy.sdk.model.call.LowLightBoostPolicy

/**
 * **LA SCÈNE SOMBRE** — miroir de iOS `CallVideoLowLight` (#8695): the only AUTOMATIC enhancement of the sent
 * stream. It costs a GPU term only when the measured average luma is under 30 %, and never on a device that
 * protects itself (power saving, heat) or when the dose ladder is exhausted.
 */
object CallVideoLowLight {
    /** Frames between two brightness readings: about twice a second at 30 fps, the readback stays negligible. */
    const val PROBE_EVERY_FRAMES: Int = 15

    /** The boost of a frame of [averageBrightness] (0…255), `null` = leave the image alone. */
    fun boost(
        averageBrightness: Float?,
        isConstrained: Boolean,
        ladder: CallVideoDegradation = CallVideoDegradation(),
    ): LowLightBoost? {
        if (isConstrained || ladder.isExhausted) return null
        return LowLightBoostPolicy.plan(averageBrightness)
    }

    /**
     * The average luma (0…255, Rec. 601) of a small RGBA readback of the frame, `null` when [rgba] holds no
     * whole pixel. The GPU shrinks the camera to a handful of texels first: this only averages them.
     */
    fun averageOfRgba(rgba: ByteArray): Float? {
        val pixels = rgba.size / 4
        if (pixels == 0) return null
        var sum = 0.0
        for (i in 0 until pixels) {
            val r = rgba[i * 4].toInt() and 0xFF
            val g = rgba[i * 4 + 1].toInt() and 0xFF
            val b = rgba[i * 4 + 2].toInt() and 0xFF
            sum += 0.299 * r + 0.587 * g + 0.114 * b
        }
        return (sum / pixels).toFloat()
    }
}
