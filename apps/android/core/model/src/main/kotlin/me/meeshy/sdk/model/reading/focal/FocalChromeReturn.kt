package me.meeshy.sdk.model.reading.focal

import kotlin.math.abs

/** Le chrome revient doigt levé dès que la décélération restante est <= 160. */
object FocalChromeReturn {
    const val RETURN_DISTANCE: Float = 160f

    fun isHidden(isTracking: Boolean, isDecelerating: Boolean, remainingDistance: Float?): Boolean {
        if (isTracking) return true
        if (!isDecelerating || remainingDistance == null) return false
        return abs(remainingDistance) > RETURN_DISTANCE
    }
}
