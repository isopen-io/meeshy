package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure camera-covered detector: a sustained dark
 * streak latches the cover exactly once, a single dim frame never does, light
 * restores it responsively, and the streak counter stays bounded over a long
 * covered stretch. Every branch of `reduce` is pinned by observed transitions,
 * never by internal wiring.
 */
class DarkFramePolicyTest {

    // Short threshold keeps the streak tests readable; DARK=15 matches iOS default.
    private val policy = DarkFramePolicy(darkThreshold = 15.0f, consecutiveThreshold = 3)

    private val dark = 5.0f
    private val bright = 80.0f

    /** Feed a run of samples, returning the final decision. */
    private fun run(state: DarkFrameState, vararg samples: Float): DarkFrameDecision {
        var decision = DarkFrameDecision(state, DarkFrameEvent.None)
        for (s in samples) decision = policy.reduce(decision.state, s)
        return decision
    }

    // --- initial state ---------------------------------------------------------

    @Test
    fun `initial state is uncovered with no streak and no reading`() {
        assertThat(DarkFrameState.INITIAL.consecutiveDarkFrames).isEqualTo(0)
        assertThat(DarkFrameState.INITIAL.isCovered).isFalse()
        assertThat(DarkFrameState.INITIAL.lastAverageBrightness).isNull()
    }

    // --- opening + holding the dark streak -------------------------------------

    @Test
    fun `a single dark frame opens the streak without covering`() {
        val decision = policy.reduce(DarkFrameState.INITIAL, dark)
        assertThat(decision.event).isEqualTo(DarkFrameEvent.None)
        assertThat(decision.state.consecutiveDarkFrames).isEqualTo(1)
        assertThat(decision.state.isCovered).isFalse()
    }

    @Test
    fun `dark frames below the threshold count do not cover`() {
        val decision = run(DarkFrameState.INITIAL, dark, dark)
        assertThat(decision.event).isEqualTo(DarkFrameEvent.None)
        assertThat(decision.state.isCovered).isFalse()
        assertThat(decision.state.consecutiveDarkFrames).isEqualTo(2)
    }

    // --- latching the cover ----------------------------------------------------

    @Test
    fun `reaching the consecutive threshold covers and fires Covered once`() {
        val decision = run(DarkFrameState.INITIAL, dark, dark, dark)
        assertThat(decision.event).isEqualTo(DarkFrameEvent.Covered)
        assertThat(decision.state.isCovered).isTrue()
        assertThat(decision.state.consecutiveDarkFrames).isEqualTo(3)
    }

    @Test
    fun `further dark frames while covered stay silent and do not re-fire Covered`() {
        val covered = run(DarkFrameState.INITIAL, dark, dark, dark).state
        val next = policy.reduce(covered, dark)
        assertThat(next.event).isEqualTo(DarkFrameEvent.None)
        assertThat(next.state.isCovered).isTrue()
    }

    @Test
    fun `the dark streak counter is clamped so it never grows unbounded while covered`() {
        var state = DarkFrameState.INITIAL
        repeat(1_000) { state = policy.reduce(state, dark).state }
        assertThat(state.isCovered).isTrue()
        assertThat(state.consecutiveDarkFrames).isEqualTo(3)
    }

    // --- restoring the view ----------------------------------------------------

    @Test
    fun `a bright frame while covered uncovers and fires Uncovered once`() {
        val covered = run(DarkFrameState.INITIAL, dark, dark, dark).state
        val restored = policy.reduce(covered, bright)
        assertThat(restored.event).isEqualTo(DarkFrameEvent.Uncovered)
        assertThat(restored.state.isCovered).isFalse()
        assertThat(restored.state.consecutiveDarkFrames).isEqualTo(0)
    }

    @Test
    fun `a bright frame after a partial dark streak clears it without any event`() {
        val partial = run(DarkFrameState.INITIAL, dark, dark).state
        val decision = policy.reduce(partial, bright)
        assertThat(decision.event).isEqualTo(DarkFrameEvent.None)
        assertThat(decision.state.consecutiveDarkFrames).isEqualTo(0)
        assertThat(decision.state.isCovered).isFalse()
    }

    @Test
    fun `a bright frame from the initial state is a silent no-op`() {
        val decision = policy.reduce(DarkFrameState.INITIAL, bright)
        assertThat(decision.event).isEqualTo(DarkFrameEvent.None)
        assertThat(decision.state.isCovered).isFalse()
        assertThat(decision.state.consecutiveDarkFrames).isEqualTo(0)
    }

    // --- boundary + full cycle -------------------------------------------------

    @Test
    fun `brightness exactly at the threshold is treated as bright, not dark`() {
        val decision = policy.reduce(DarkFrameState.INITIAL, 15.0f)
        assertThat(decision.event).isEqualTo(DarkFrameEvent.None)
        assertThat(decision.state.consecutiveDarkFrames).isEqualTo(0)
    }

    @Test
    fun `cover then uncover then cover again fires the events symmetrically`() {
        val covered = run(DarkFrameState.INITIAL, dark, dark, dark)
        assertThat(covered.event).isEqualTo(DarkFrameEvent.Covered)
        val uncovered = policy.reduce(covered.state, bright)
        assertThat(uncovered.event).isEqualTo(DarkFrameEvent.Uncovered)
        val reCovered = run(uncovered.state, dark, dark, dark)
        assertThat(reCovered.event).isEqualTo(DarkFrameEvent.Covered)
        assertThat(reCovered.state.isCovered).isTrue()
    }

    @Test
    fun `every frame records its brightness as the last reading`() {
        val afterDark = policy.reduce(DarkFrameState.INITIAL, dark)
        assertThat(afterDark.state.lastAverageBrightness).isEqualTo(dark)
        val afterBright = policy.reduce(afterDark.state, bright)
        assertThat(afterBright.state.lastAverageBrightness).isEqualTo(bright)
    }

    @Test
    fun `the default policy uses the iOS thresholds`() {
        val defaultPolicy = DarkFramePolicy()
        var state = DarkFrameState.INITIAL
        repeat(DarkFramePolicy.DEFAULT_CONSECUTIVE_THRESHOLD - 1) {
            state = defaultPolicy.reduce(state, 10.0f).state
        }
        assertThat(state.isCovered).isFalse()
        val decision = defaultPolicy.reduce(state, 10.0f)
        assertThat(decision.event).isEqualTo(DarkFrameEvent.Covered)
    }
}
