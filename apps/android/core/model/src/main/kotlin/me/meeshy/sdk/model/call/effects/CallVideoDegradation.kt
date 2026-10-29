package me.meeshy.sdk.model.call.effects

/** How finely the person is cut out for the background blur. iOS `CallSegmentationQuality`. */
enum class CallSegmentationQuality { Balanced, Fast }

/**
 * The background-blur rungs, finest to cheapest. An overload goes down ONE rung at a time; only the last
 * one turns the blur off. Miroir de iOS `CallBlurTier` (`CallBackgroundBlur.swift`).
 */
enum class CallBlurTier {
    Balanced, Fast, Slow, Off;

    data class Segmentation(val quality: CallSegmentationQuality, val framesPerSecond: Double)

    val segmentation: Segmentation?
        get() = when (this) {
            Balanced -> Segmentation(CallSegmentationQuality.Balanced, 15.0)
            Fast -> Segmentation(CallSegmentationQuality.Fast, 15.0)
            Slow -> Segmentation(CallSegmentationQuality.Fast, 10.0)
            Off -> null
        }

    internal fun lower(): CallBlurTier = entries.getOrElse(ordinal + 1) { Off }
    internal fun higher(): CallBlurTier = entries.getOrElse(ordinal - 1) { Balanced }
}

/**
 * **LA DOSE DES EFFETS** — miroir de iOS `CallVideoDegradation` (#12686). Each processed frame reports its
 * time; ten frames over 25 ms step the ladder down, thirty frames under 15 ms step it back up. The
 * camera's cadence is held: an effect that cannot keep it is shed, never the frames. Fixed-size state:
 * the streaks reset on every rung change, so nothing grows over a long call.
 */
data class CallVideoDegradation(
    val tier: CallBlurTier = CallBlurTier.Balanced,
    val overBudgetStreak: Int = 0,
    val underBudgetStreak: Int = 0,
) {
    /** Every advanced pass is shed: the frame goes out with its colour only. */
    val isExhausted: Boolean get() = tier == CallBlurTier.Off

    /** Smoothing, the priciest per-pixel pass, is shed at half the over-budget streak. */
    val isSmoothingDegraded: Boolean get() = overBudgetStreak >= OVER_BUDGET_FRAMES / 2

    /** A constrained device (power saving, heat) never segments above the slow rung. */
    fun blurTier(isConstrained: Boolean): CallBlurTier =
        if (isConstrained && tier < CallBlurTier.Slow) CallBlurTier.Slow else tier

    /**
     * Without an active blur the middle rungs save nothing: an overload goes straight to the last rung, a
     * recovery straight to the first.
     */
    fun recording(elapsedMs: Double, blurActive: Boolean): CallVideoDegradation {
        if (elapsedMs > OVER_BUDGET_MS) {
            val over = overBudgetStreak + 1
            if (over < OVER_BUDGET_FRAMES || tier == CallBlurTier.Off) {
                return copy(overBudgetStreak = minOf(over, OVER_BUDGET_FRAMES), underBudgetStreak = 0)
            }
            return CallVideoDegradation(tier = if (blurActive) tier.lower() else CallBlurTier.Off)
        }
        if (elapsedMs >= RESTORE_BUDGET_MS) return copy(underBudgetStreak = 0)
        val under = underBudgetStreak + 1
        if (under < UNDER_BUDGET_FRAMES || tier == CallBlurTier.Balanced) {
            return copy(underBudgetStreak = minOf(under, UNDER_BUDGET_FRAMES))
        }
        return CallVideoDegradation(tier = if (blurActive) tier.higher() else CallBlurTier.Balanced)
    }

    companion object {
        const val OVER_BUDGET_MS: Double = 25.0
        const val RESTORE_BUDGET_MS: Double = 15.0
        const val OVER_BUDGET_FRAMES: Int = 10
        const val UNDER_BUDGET_FRAMES: Int = 30
    }
}
