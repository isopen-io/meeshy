package me.meeshy.sdk.model

/**
 * The authoring bound for an author-pinned story slide duration — the composer
 * counterpart of the reader-side SSOT [StorySlideDuration]. The reader *reads*
 * [StoryEffects.timelineDuration]; the composer *writes* it, and every write goes
 * through [clamp] so the pinned value can never fall outside what iOS accepts.
 *
 * Ports iOS `StoryComposerViewModel.currentSlideDuration`'s setter exactly —
 * `max(2, min(600, newValue))` (StoryComposerViewModel+Slides.swift) — with one
 * addition iOS does not need: a NaN guard, because Android's slider feeds a `Float`
 * that a degenerate gesture could turn into `NaN`, and `coerceIn` would propagate it.
 * Pure: no clock, no state, so the bound lives in one unit-tested place.
 */
object StoryDurationPin {

    /** Shortest a slide may be pinned to, in seconds (iOS `max(2, …)`). */
    const val MIN_SECONDS: Double = 2.0

    /** Longest a slide may be pinned to, in seconds (iOS `min(600, …)`). */
    const val MAX_SECONDS: Double = 600.0

    /**
     * The author-chosen [seconds] bounded into `[MIN_SECONDS, MAX_SECONDS]`. A
     * non-finite `NaN` falls back to [MIN_SECONDS] rather than propagating; `±∞`
     * clamp to the ceiling / floor as ordinary out-of-range values.
     */
    fun clamp(seconds: Double): Double {
        if (seconds.isNaN()) return MIN_SECONDS
        return seconds.coerceIn(MIN_SECONDS, MAX_SECONDS)
    }
}
