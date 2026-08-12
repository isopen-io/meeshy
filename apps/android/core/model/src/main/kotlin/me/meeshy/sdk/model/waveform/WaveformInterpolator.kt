package me.meeshy.sdk.model.waveform

import kotlin.math.floor

/**
 * Resamples a series of audio [levels] onto exactly [barCount] evenly-spaced bars by
 * linear interpolation, producing a smooth waveform strip with no tiling artefacts even
 * when there are more bars than source samples.
 *
 * Ports the per-bar math of iOS `UniversalComposerBar.interpolatedLevel(at:barCount:levels:)`
 * — `position = i * (n - 1) / (barCount - 1)`, then a linear blend of the two bracketing
 * samples — but **surpasses iOS** by returning the whole strip in one pass instead of an
 * O(barCount) sequence of per-index calls, and by defining the degenerate cases the iOS
 * per-index guard left implicit:
 * - `barCount <= 0` → an empty strip (nothing to draw).
 * - a single sample, or a single bar → every bar takes that one level (iOS `levels.first ?? 0`).
 * - no samples → a flat, silent strip of zeros.
 *
 * The endpoints are always exact: bar `0` is `levels.first`, the last bar is `levels.last`.
 * Pure and Android-free so the resampling stays fully JVM-testable; the Compose `Canvas`
 * that paints the returned heights is app-side glue.
 */
object WaveformInterpolator {
    fun interpolate(levels: List<Float>, barCount: Int): List<Float> {
        if (barCount <= 0) return emptyList()

        val first = levels.firstOrNull() ?: 0f
        if (levels.size <= 1 || barCount == 1) return List(barCount) { first }

        val lastSampleIndex = levels.size - 1
        val span = (barCount - 1).toDouble()
        return List(barCount) { i ->
            val position = i.toDouble() * lastSampleIndex / span
            val low = floor(position).toInt()
            val high = minOf(low + 1, lastSampleIndex)
            val t = position - low
            (levels[low] * (1 - t) + levels[high] * t).toFloat()
        }
    }
}
