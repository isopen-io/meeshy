package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryEasing

/**
 * Easing curve math — the Android port of `StoryEasing.apply(_:)`
 * (`StoryModels.swift`). Every curve maps `[0, 1] -> [0, 1]` monotonically with
 * `eased(0) == 0` and `eased(1) == 1`, so a segment always starts on its lower
 * keyframe's value and ends on its upper one whatever the curve.
 */
internal fun StoryEasing.eased(t: Float): Float = when (this) {
    StoryEasing.LINEAR -> t
    StoryEasing.EASE_IN -> t * t
    StoryEasing.EASE_OUT -> 1f - (1f - t) * (1f - t)
    StoryEasing.EASE_IN_OUT -> if (t < 0.5f) 2f * t * t else 1f - (-2f * t + 2f) * (-2f * t + 2f) / 2f
}

/**
 * A single interpolatable point of one animation channel: a `time` (seconds,
 * relative to the owning clip's start), the channel's `value` at that time, and
 * the [StoryEasing] that governs the segment *starting* at this point.
 */
internal data class KeyframeChannelSample(
    val time: Float,
    val value: Double,
    val easing: StoryEasing,
)

/**
 * Pure keyframe interpolation for one scalar channel — the Android port of iOS's
 * `KeyframeInterpolator` (`MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift`).
 * No Android, no I/O: the reader canvas and any future compositor share this one
 * source of truth for "what is this channel's value at time `t`".
 *
 * Contract (identical to iOS):
 * - **0 samples** -> `null`. The caller falls back to the clip's static value.
 * - **1 sample**  -> its value, constant for every `t`.
 * - **`t <= t0`** -> the first sample's value (clamp before the animation).
 * - **`t >= tn`** -> the last sample's value (clamp after the animation).
 * - otherwise find the segment `[lo, hi]` with `lo.time <= t <= hi.time`, take
 *   `u = (t - lo.time) / (hi.time - lo.time)`, apply `lo.easing.eased(u)`, and
 *   linearly interpolate `lo.value -> hi.value` by the eased fraction.
 *
 * Unsorted input is tolerated: a single O(n) sorted-check avoids the O(n log n)
 * sort on the common already-sorted path (this runs per animation frame), and a
 * stable sort otherwise reproduces exactly the order a pre-sorted array had.
 */
internal object StoryKeyframeInterpolator {

    fun interpolate(samples: List<KeyframeChannelSample>, at: Float): Double? {
        if (samples.isEmpty()) return null

        val sorted = if (isSortedByTime(samples)) samples else samples.sortedBy { it.time }

        if (sorted.size == 1) return sorted[0].value

        val first = sorted.first()
        if (at <= first.time) return first.value
        val last = sorted.last()
        if (at >= last.time) return last.value

        for (i in 0 until sorted.size - 1) {
            val lo = sorted[i]
            val hi = sorted[i + 1]
            if (at >= lo.time && at <= hi.time) {
                val span = hi.time - lo.time
                val u = if (span > 0f) (at - lo.time) / span else 0f
                val easedU = lo.easing.eased(u)
                return lo.value + (hi.value - lo.value) * easedU.toDouble()
            }
        }

        return last.value
    }

    private fun isSortedByTime(samples: List<KeyframeChannelSample>): Boolean {
        var previous = Float.NEGATIVE_INFINITY
        for (sample in samples) {
            if (sample.time < previous) return false
            previous = sample.time
        }
        return true
    }
}
