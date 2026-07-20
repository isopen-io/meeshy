package me.meeshy.sdk.model.call

/**
 * The auto-degradation transition a single processed frame yields. Fired once on
 * the edge, mirroring the two log points in iOS `updateAutoDegradation`.
 */
enum class VideoFilterDegradeEvent {
    /** No latch change this frame. */
    None,

    /** The advanced pass just latched off (frame processing crossed the budget). */
    Degraded,

    /** The advanced pass just restored (processing recovered under budget). */
    Restored,
}

/**
 * Immutable state of the video-filter auto-degradation loop. Fixed-size — two
 * clamped counters plus one latch — so it is **O(1) over any number of frames**,
 * unlike iOS `VideoFilterPipeline` whose `consecutiveOverBudgetFrames` /
 * `consecutiveUnderBudgetFrames` are unbounded `Int`s that count into the
 * millions across a multi-minute call. Both counters are clamped at the point
 * past which no boolean check can change, so they never overflow.
 *
 * @property consecutiveOverBudgetFrames length of the current over-budget streak,
 *   clamped at the policy's over-budget threshold; reset to 0 only on a full restore.
 * @property consecutiveUnderBudgetFrames length of the current under-budget streak,
 *   clamped at the policy's under-budget threshold; reset by any over-budget or
 *   between-budget frame.
 * @property isAutoDegraded `true` once the over streak crossed the threshold,
 *   until a sustained under streak restores it.
 */
data class VideoFilterDegradeState(
    val consecutiveOverBudgetFrames: Int,
    val consecutiveUnderBudgetFrames: Int,
    val isAutoDegraded: Boolean,
) {
    companion object {
        /** The starting posture: healthy, no streaks, nothing degraded. */
        val INITIAL = VideoFilterDegradeState(
            consecutiveOverBudgetFrames = 0,
            consecutiveUnderBudgetFrames = 0,
            isAutoDegraded = false,
        )
    }
}

/**
 * The outcome of advancing the loop by one processed frame: the [state] to carry
 * forward plus the [event] to actuate (log) on this edge.
 */
data class VideoFilterDegradeDecision(
    val state: VideoFilterDegradeState,
    val event: VideoFilterDegradeEvent,
)

/**
 * Pure, deterministic auto-degradation policy for the in-call video filters,
 * with **two-tier count-based hysteresis**. The Android SSOT ported from iOS
 * `VideoFilterPipeline.updateAutoDegradation` / `isSmoothingDegraded`, extracted
 * here as a total, side-effect-free reducer — a strict upgrade on iOS, where the
 * logic is buried in a stateful `nonisolated` class and cannot be unit-tested
 * without a live GPU.
 *
 * Feed it each processed frame's wall time in milliseconds:
 * - A frame is **over budget** when it takes strictly longer than [degradeBudgetMs].
 *   After [overBudgetThreshold] consecutive over-budget frames the whole advanced
 *   pass latches off ([VideoFilterDegradeState.isAutoDegraded]) — background blur is
 *   the first casualty. Skin smoothing degrades earlier, at *half* the threshold
 *   (see [isSmoothingDegraded]): it is the pricier pass, so it is shed first.
 * - A frame is **under budget** when it takes strictly less than [restoreBudgetMs].
 *   After [underBudgetThreshold] consecutive under-budget frames the advanced pass
 *   restores. The confirm(10)/restore(30) asymmetry IS the hysteresis: quick to
 *   shed load, slow to re-add it, so a call never flickers between tiers.
 * - A frame **between** the two budgets only resets the under-budget streak,
 *   holding any degradation steady (iOS parity — the over streak is untouched).
 *
 * Project the live [VideoFilterDegradeState] onto a requested [VideoFilterConfig]
 * with [effectiveConfig] to get the config the actuator should actually apply.
 */
class VideoFilterDegradePolicy(
    private val degradeBudgetMs: Double = DEFAULT_DEGRADE_BUDGET_MS,
    private val restoreBudgetMs: Double = DEFAULT_RESTORE_BUDGET_MS,
    private val overBudgetThreshold: Int = DEFAULT_OVER_BUDGET_THRESHOLD,
    private val underBudgetThreshold: Int = DEFAULT_UNDER_BUDGET_THRESHOLD,
) {

    /**
     * Advance the loop by one processed frame taking [elapsedMs] milliseconds.
     * Side-effect free and total over every input.
     */
    fun reduce(state: VideoFilterDegradeState, elapsedMs: Double): VideoFilterDegradeDecision {
        if (elapsedMs > degradeBudgetMs) {
            val over = minOf(state.consecutiveOverBudgetFrames + 1, overBudgetThreshold)
            val next = state.copy(
                consecutiveOverBudgetFrames = over,
                consecutiveUnderBudgetFrames = 0,
            )
            if (over >= overBudgetThreshold && !state.isAutoDegraded) {
                return VideoFilterDegradeDecision(
                    next.copy(isAutoDegraded = true),
                    VideoFilterDegradeEvent.Degraded,
                )
            }
            return VideoFilterDegradeDecision(next, VideoFilterDegradeEvent.None)
        }

        if (elapsedMs < restoreBudgetMs) {
            val under = minOf(state.consecutiveUnderBudgetFrames + 1, underBudgetThreshold)
            if (under >= underBudgetThreshold && state.isAutoDegraded) {
                return VideoFilterDegradeDecision(
                    state.copy(
                        consecutiveUnderBudgetFrames = under,
                        consecutiveOverBudgetFrames = 0,
                        isAutoDegraded = false,
                    ),
                    VideoFilterDegradeEvent.Restored,
                )
            }
            return VideoFilterDegradeDecision(
                state.copy(consecutiveUnderBudgetFrames = under),
                VideoFilterDegradeEvent.None,
            )
        }

        return VideoFilterDegradeDecision(
            state.copy(consecutiveUnderBudgetFrames = 0),
            VideoFilterDegradeEvent.None,
        )
    }

    /**
     * Whether skin smoothing should currently be shed. Smoothing is the priciest
     * pass, so it degrades at *half* the over-budget threshold — before the full
     * advanced pass latches off. Mirrors iOS `isSmoothingDegraded`.
     */
    fun isSmoothingDegraded(state: VideoFilterDegradeState): Boolean =
        state.consecutiveOverBudgetFrames >= overBudgetThreshold / 2

    /**
     * Project the requested [config] through the live degradation [state]: the
     * advanced passes are switched off exactly as the actuator would gate them —
     * background blur while [VideoFilterDegradeState.isAutoDegraded], skin
     * smoothing while [isSmoothingDegraded]. Colorimetry is always preserved.
     * This is the SSOT both the WebRTC actuator and any "filters throttled" UI
     * hint read from.
     */
    fun effectiveConfig(config: VideoFilterConfig, state: VideoFilterDegradeState): VideoFilterConfig =
        config.copy(
            backgroundBlurEnabled = config.backgroundBlurEnabled && !state.isAutoDegraded,
            skinSmoothingEnabled = config.skinSmoothingEnabled && !isSmoothingDegraded(state),
        )

    companion object {
        /** Frame time (ms) strictly above which a frame is over budget. iOS `autoDegradeBudgetMs`. */
        const val DEFAULT_DEGRADE_BUDGET_MS: Double = 25.0

        /** Frame time (ms) strictly below which a frame is under budget. iOS `autoRestoreBudgetMs`. */
        const val DEFAULT_RESTORE_BUDGET_MS: Double = 15.0

        /** Consecutive over-budget frames that latch the full advanced pass off. iOS `overBudgetThreshold`. */
        const val DEFAULT_OVER_BUDGET_THRESHOLD: Int = 10

        /** Consecutive under-budget frames that restore the advanced pass. iOS `underBudgetThreshold`. */
        const val DEFAULT_UNDER_BUDGET_THRESHOLD: Int = 30
    }
}
