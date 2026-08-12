package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure video-filter auto-degradation policy: a
 * sustained over-budget streak first drops skin smoothing, then the whole
 * advanced pass; a sustained under-budget streak restores it; and both counters
 * stay bounded over a long stretch. Every transition is pinned by the observed
 * `effectiveConfig` / degrade event, never by internal wiring. Port of the
 * `updateAutoDegradation` / `isSmoothingDegraded` logic in iOS
 * `VideoFilterPipeline.swift`, extracted here as a total, side-effect-free
 * reducer (a strict upgrade — iOS buries it in a stateful `nonisolated` class).
 */
class VideoFilterDegradePolicyTest {

    // iOS defaults: degrade > 25ms, restore < 15ms, over-threshold 10, under 30.
    private val policy = VideoFilterDegradePolicy()

    private val slow = 30.0 // over the 25ms degrade budget
    private val fast = 5.0 // under the 15ms restore budget
    private val steady = 20.0 // between the two budgets (neither streak advances)

    /** Advance the state through a run of frame times, returning the last state. */
    private fun run(state: VideoFilterDegradeState, vararg elapsedMs: Double): VideoFilterDegradeState {
        var s = state
        for (ms in elapsedMs) s = policy.reduce(s, ms).state
        return s
    }

    private fun slowFrames(n: Int) = DoubleArray(n) { slow }
    private fun fastFrames(n: Int) = DoubleArray(n) { fast }

    // --- initial -------------------------------------------------------------

    @Test
    fun `initial state is not degraded with no streaks`() {
        val s = VideoFilterDegradeState.INITIAL
        assertThat(s.consecutiveOverBudgetFrames).isEqualTo(0)
        assertThat(s.consecutiveUnderBudgetFrames).isEqualTo(0)
        assertThat(s.isAutoDegraded).isFalse()
        assertThat(policy.isSmoothingDegraded(s)).isFalse()
    }

    // --- smoothing degrades before the full pass -----------------------------

    @Test
    fun `smoothing degrades at half the over-budget threshold before the full pass`() {
        // 5 slow frames = overThreshold/2 → smoothing off, blur still on.
        val s = run(VideoFilterDegradeState.INITIAL, *slowFrames(5))
        assertThat(policy.isSmoothingDegraded(s)).isTrue()
        assertThat(s.isAutoDegraded).isFalse()
    }

    @Test
    fun `smoothing is not degraded before the half threshold`() {
        val s = run(VideoFilterDegradeState.INITIAL, *slowFrames(4))
        assertThat(policy.isSmoothingDegraded(s)).isFalse()
        assertThat(s.isAutoDegraded).isFalse()
    }

    // --- full degrade latch --------------------------------------------------

    @Test
    fun `the full advanced pass degrades after the over-budget threshold`() {
        val nine = run(VideoFilterDegradeState.INITIAL, *slowFrames(9))
        assertThat(nine.isAutoDegraded).isFalse()

        val tenth = policy.reduce(nine, slow)
        assertThat(tenth.state.isAutoDegraded).isTrue()
        assertThat(tenth.event).isEqualTo(VideoFilterDegradeEvent.Degraded)
    }

    @Test
    fun `the degrade event fires exactly once while it stays over budget`() {
        val degraded = run(VideoFilterDegradeState.INITIAL, *slowFrames(10))
        assertThat(degraded.isAutoDegraded).isTrue()

        // Further slow frames stay degraded but do not re-fire the event.
        val next = policy.reduce(degraded, slow)
        assertThat(next.state.isAutoDegraded).isTrue()
        assertThat(next.event).isEqualTo(VideoFilterDegradeEvent.None)
    }

    // --- restore -------------------------------------------------------------

    @Test
    fun `a sustained under-budget streak restores the advanced pass`() {
        val degraded = run(VideoFilterDegradeState.INITIAL, *slowFrames(10))

        val twentyNine = run(degraded, *fastFrames(29))
        assertThat(twentyNine.isAutoDegraded).isTrue()

        val thirtieth = policy.reduce(twentyNine, fast)
        assertThat(thirtieth.state.isAutoDegraded).isFalse()
        assertThat(thirtieth.event).isEqualTo(VideoFilterDegradeEvent.Restored)
        // Restoring clears the over-budget streak so smoothing recovers too.
        assertThat(thirtieth.state.consecutiveOverBudgetFrames).isEqualTo(0)
        assertThat(policy.isSmoothingDegraded(thirtieth.state)).isFalse()
    }

    @Test
    fun `an under-budget frame while healthy never emits a restore`() {
        val decision = policy.reduce(VideoFilterDegradeState.INITIAL, fast)
        assertThat(decision.event).isEqualTo(VideoFilterDegradeEvent.None)
        assertThat(decision.state.isAutoDegraded).isFalse()
    }

    // --- streak book-keeping -------------------------------------------------

    @Test
    fun `an over-budget frame resets the under-budget streak`() {
        val built = run(VideoFilterDegradeState.INITIAL, *fastFrames(5))
        assertThat(built.consecutiveUnderBudgetFrames).isEqualTo(5)

        val afterSlow = policy.reduce(built, slow)
        assertThat(afterSlow.state.consecutiveUnderBudgetFrames).isEqualTo(0)
        assertThat(afterSlow.state.consecutiveOverBudgetFrames).isEqualTo(1)
    }

    @Test
    fun `a steady frame between the budgets resets only the under-budget streak`() {
        // Build an over streak (5) then an under streak (3) without full degrade.
        val overThenUnder = run(VideoFilterDegradeState.INITIAL, *slowFrames(5), *fastFrames(3))
        assertThat(overThenUnder.consecutiveOverBudgetFrames).isEqualTo(5)
        assertThat(overThenUnder.consecutiveUnderBudgetFrames).isEqualTo(3)

        val afterSteady = policy.reduce(overThenUnder, steady)
        assertThat(afterSteady.state.consecutiveUnderBudgetFrames).isEqualTo(0)
        // The over streak is untouched → smoothing stays degraded (iOS parity).
        assertThat(afterSteady.state.consecutiveOverBudgetFrames).isEqualTo(5)
        assertThat(policy.isSmoothingDegraded(afterSteady.state)).isTrue()
    }

    @Test
    fun `the over-budget counter is clamped so it never grows unbounded while degraded`() {
        // Far more slow frames than the threshold; the counter must stay bounded.
        val s = run(VideoFilterDegradeState.INITIAL, *slowFrames(1_000))
        assertThat(s.isAutoDegraded).isTrue()
        assertThat(s.consecutiveOverBudgetFrames).isEqualTo(10)
    }

    @Test
    fun `the under-budget counter is clamped so it never grows unbounded while healthy`() {
        val s = run(VideoFilterDegradeState.INITIAL, *fastFrames(1_000))
        assertThat(s.isAutoDegraded).isFalse()
        assertThat(s.consecutiveUnderBudgetFrames).isEqualTo(30)
    }

    // --- budget boundaries (strict comparisons, iOS parity) ------------------

    @Test
    fun `a frame exactly at the degrade budget does not count as over budget`() {
        val s = policy.reduce(VideoFilterDegradeState.INITIAL, 25.0)
        assertThat(s.state.consecutiveOverBudgetFrames).isEqualTo(0)
    }

    @Test
    fun `a frame exactly at the restore budget does not count as under budget`() {
        val built = run(VideoFilterDegradeState.INITIAL, *fastFrames(3))
        val s = policy.reduce(built, 15.0)
        assertThat(s.state.consecutiveUnderBudgetFrames).isEqualTo(0)
    }

    // --- effectiveConfig projection ------------------------------------------

    private val advanced = VideoFilterConfig.DEFAULT.copy(
        isEnabled = true,
        backgroundBlurEnabled = true,
        skinSmoothingEnabled = true,
    )

    @Test
    fun `a healthy state leaves both advanced filters on`() {
        val eff = policy.effectiveConfig(advanced, VideoFilterDegradeState.INITIAL)
        assertThat(eff.backgroundBlurEnabled).isTrue()
        assertThat(eff.skinSmoothingEnabled).isTrue()
    }

    @Test
    fun `smoothing-degraded state drops only skin smoothing`() {
        val smoothingOff = run(VideoFilterDegradeState.INITIAL, *slowFrames(5))
        val eff = policy.effectiveConfig(advanced, smoothingOff)
        assertThat(eff.skinSmoothingEnabled).isFalse()
        assertThat(eff.backgroundBlurEnabled).isTrue()
    }

    @Test
    fun `fully degraded state drops both advanced filters`() {
        val degraded = run(VideoFilterDegradeState.INITIAL, *slowFrames(10))
        val eff = policy.effectiveConfig(advanced, degraded)
        assertThat(eff.skinSmoothingEnabled).isFalse()
        assertThat(eff.backgroundBlurEnabled).isFalse()
    }

    @Test
    fun `the effective projection preserves colorimetry and disabled advanced filters`() {
        val degraded = run(VideoFilterDegradeState.INITIAL, *slowFrames(10))
        val warm = VideoFilterPreset.Warm.config
        val eff = policy.effectiveConfig(warm, degraded)
        // No advanced filters requested → nothing to drop, colorimetry intact.
        assertThat(eff.temperature).isEqualTo(7500f)
        assertThat(eff.saturation).isEqualTo(1.1f)
        assertThat(eff.backgroundBlurEnabled).isFalse()
        assertThat(eff.skinSmoothingEnabled).isFalse()
    }
}
