package me.meeshy.sdk.model.audioedit

import kotlin.math.max
import kotlin.math.min

/**
 * Où dessiner une poignée de rognage : ramenée sur le bord quand son instant sort du champ
 * visible (elle reste attrapable), avec le sens de la flèche qui dit où il se trouve.
 */
public class AudioTrimHandlePlacement private constructor(
    public val centerX: Float,
    public val arrow: Arrow,
) {
    public enum class Arrow { NONE, LEFT, RIGHT }

    public companion object {
        public fun of(rawX: Float, stripWidth: Float, handleWidth: Float): AudioTrimHandlePlacement {
            val half = handleWidth / 2f
            val clamped = min(max(rawX, half), max(half, stripWidth - half))
            val arrow = when {
                rawX < 0f -> Arrow.LEFT
                rawX > stripWidth -> Arrow.RIGHT
                else -> Arrow.NONE
            }
            return AudioTrimHandlePlacement(clamped, arrow)
        }
    }
}
