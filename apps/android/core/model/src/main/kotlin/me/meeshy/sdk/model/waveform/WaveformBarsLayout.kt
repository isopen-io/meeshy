package me.meeshy.sdk.model.waveform

import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

public enum class WaveformBarTint { PLAYED_LIVE, PLAYED_RESTING, UNPLAYED }

/**
 * Géométrie de l'onde de capsules du lecteur vocal — miroir de `waveformProgress` /
 * `waveformHeight` d'iOS `AudioPlayerView` : 72 barres (48 en compact) de 2 à 22 dp dans une
 * bande de 24 dp. Pur : l'écran ne fait que dessiner ce que cette loi décide.
 */
public object WaveformBarsLayout {
    public const val BAND_HEIGHT_DP: Float = 24f
    public const val MIN_BAR_DP: Float = 2f
    public const val MAX_BAR_DP: Float = 22f
    public const val BAR_COUNT: Int = 72
    public const val COMPACT_BAR_COUNT: Int = 48
    private const val CURVE_EXPONENT = 0.65
    private const val BAR_SLOT_RATIO = 0.62f
    private const val MIN_BAR_WIDTH_DP = 1.5f

    public fun barCount(isCompact: Boolean): Int = if (isCompact) COMPACT_BAR_COUNT else BAR_COUNT

    public fun heights(samples: List<Float>, count: Int): List<Float> =
        List(count) { index ->
            if (samples.isEmpty()) fallbackHeight(index)
            else {
                val sample = samples[min(samples.size - 1, index * samples.size / max(1, count))]
                val curved = sample.coerceIn(0f, 1f).toDouble().pow(CURVE_EXPONENT).toFloat()
                max(MIN_BAR_DP, curved * MAX_BAR_DP)
            }
        }

    private fun fallbackHeight(index: Int): Float {
        val seed = (index * 7 + 3).toDouble()
        val base = 5.0 + sin(seed) * 6 + cos(seed * 0.5) * 4.0
        return base.coerceIn(MIN_BAR_DP.toDouble(), MAX_BAR_DP.toDouble()).toFloat()
    }

    public fun isPlayed(index: Int, count: Int, progress: Double): Boolean =
        (index + 0.5) / count <= progress

    public fun playedCount(count: Int, progress: Double): Int =
        (0 until count).count { isPlayed(it, count, progress) }

    public fun tint(isPlayed: Boolean, isLive: Boolean): WaveformBarTint = when {
        !isPlayed -> WaveformBarTint.UNPLAYED
        isLive -> WaveformBarTint.PLAYED_LIVE
        else -> WaveformBarTint.PLAYED_RESTING
    }

    public fun barWidthDp(slotDp: Float): Float = max(MIN_BAR_WIDTH_DP, slotDp * BAR_SLOT_RATIO)
}
