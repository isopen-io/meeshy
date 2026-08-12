package me.meeshy.sdk.model.call

/**
 * The camera-cover transition a single brightness sample yields. Port of the two
 * one-shot callbacks (`onDarkFrameDetected` / `onLightFrameRestored`) the iOS
 * `DarkFrameDetector` fires from its video-capture callback.
 */
enum class DarkFrameEvent {
    /** No transition — the cover posture is unchanged this frame. */
    None,

    /** The camera just became covered (the dark streak crossed the threshold). */
    Covered,

    /** The camera just uncovered — light returned after a covered stretch. */
    Uncovered,
}

/**
 * Immutable state of the dark-frame (camera-covered) detector. Fixed-size — one
 * clamped counter, one flag, one last-reading — so it is **O(1) over any number
 * of frames**, unlike the iOS `DarkFrameDetector` whose `consecutiveDarkFrames`
 * `Int` grows unbounded for as long as the lens stays covered (a multi-hour
 * covered stream at 30 fps would count into the millions). The counter is
 * capped at the policy's `consecutiveThreshold`: once the cover has been
 * confirmed there is nothing left to count toward, so it never overflows.
 *
 * @property consecutiveDarkFrames length of the current below-threshold streak,
 *   clamped at the policy threshold; reset to 0 by any bright frame.
 * @property isCovered `true` once a streak crossed the threshold, until a bright
 *   frame restores the view.
 * @property lastAverageBrightness the most recent average-luma reading (0..255),
 *   `null` before the first frame or after [DarkFrameState.INITIAL]/reset.
 */
data class DarkFrameState(
    val consecutiveDarkFrames: Int,
    val isCovered: Boolean,
    val lastAverageBrightness: Float?,
) {
    companion object {
        /** The starting posture: uncovered, no streak, no reading yet. */
        val INITIAL = DarkFrameState(
            consecutiveDarkFrames = 0,
            isCovered = false,
            lastAverageBrightness = null,
        )
    }
}

/**
 * The outcome of advancing the detector by one frame: the [state] to carry
 * forward plus the [event] to actuate on this edge.
 */
data class DarkFrameDecision(
    val state: DarkFrameState,
    val event: DarkFrameEvent,
)

/**
 * Pure, deterministic camera-covered detector with **count-based hysteresis**.
 * The Android SSOT ported from iOS `DarkFrameDetector`, extracted here as a
 * total, side-effect-free reducer — a strict upgrade on iOS, whose detector is
 * a stateful class whose streak logic is untestable (its tests can only poke the
 * callbacks, never a real `CVPixelBuffer`).
 *
 * A frame is *dark* when its average luma is **strictly below** [darkThreshold].
 * The cover latches only after [consecutiveThreshold] consecutive dark frames —
 * so a single dim frame (a blink, a passing shadow) never trips it — and clears
 * the instant a bright frame returns, matching iOS's responsive restore (an
 * uncovered lens should recover immediately, so there is no restore streak).
 * The confirm/restore asymmetry IS the hysteresis: hard to enter, easy to leave.
 *
 * Feed it the average luma of each captured frame (see [FrameLuminance]); it
 * emits [DarkFrameEvent.Covered] exactly once per covered stretch and
 * [DarkFrameEvent.Uncovered] exactly once when the view is restored.
 */
class DarkFramePolicy(
    private val darkThreshold: Float = DEFAULT_DARK_THRESHOLD,
    private val consecutiveThreshold: Int = DEFAULT_CONSECUTIVE_THRESHOLD,
) {

    /**
     * Advance the detector by one frame's [averageBrightness] (average luma,
     * 0..255). Side-effect free and total over every input.
     */
    fun reduce(state: DarkFrameState, averageBrightness: Float): DarkFrameDecision {
        val recorded = state.copy(lastAverageBrightness = averageBrightness)

        if (averageBrightness < darkThreshold) {
            val streak = minOf(recorded.consecutiveDarkFrames + 1, consecutiveThreshold)
            if (streak >= consecutiveThreshold && !recorded.isCovered) {
                return DarkFrameDecision(
                    recorded.copy(consecutiveDarkFrames = streak, isCovered = true),
                    DarkFrameEvent.Covered,
                )
            }
            return DarkFrameDecision(
                recorded.copy(consecutiveDarkFrames = streak),
                DarkFrameEvent.None,
            )
        }

        if (recorded.isCovered) {
            return DarkFrameDecision(
                recorded.copy(consecutiveDarkFrames = 0, isCovered = false),
                DarkFrameEvent.Uncovered,
            )
        }
        return DarkFrameDecision(
            recorded.copy(consecutiveDarkFrames = 0),
            DarkFrameEvent.None,
        )
    }

    companion object {
        /** Average luma below this (0..255) is a dark frame. iOS `darkThreshold`. */
        const val DEFAULT_DARK_THRESHOLD: Float = 15.0f

        /** Consecutive dark frames required to latch the cover. iOS `consecutiveThreshold`. */
        const val DEFAULT_CONSECUTIVE_THRESHOLD: Int = 30
    }
}
