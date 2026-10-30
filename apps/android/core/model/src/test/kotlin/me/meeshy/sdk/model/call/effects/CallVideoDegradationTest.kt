package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallVideoDegradationTest {
    private fun CallVideoDegradation.frames(count: Int, ms: Double, blur: Boolean = true) =
        (1..count).fold(this) { ladder, _ -> ladder.recording(ms, blur) }

    @Test
    fun `ten frames over budget step the blur down one rung`() {
        val start = CallVideoDegradation()
        assertThat(start.frames(9, 30.0).tier).isEqualTo(CallBlurTier.Balanced)
        assertThat(start.frames(10, 30.0).tier).isEqualTo(CallBlurTier.Fast)
        assertThat(start.frames(20, 30.0).tier).isEqualTo(CallBlurTier.Slow)
        assertThat(start.frames(30, 30.0).tier).isEqualTo(CallBlurTier.Off)
        assertThat(start.frames(300, 30.0).isExhausted).isTrue()
    }

    @Test
    fun `without a blur an overload goes straight to the last rung`() {
        assertThat(CallVideoDegradation().frames(10, 30.0, blur = false).tier).isEqualTo(CallBlurTier.Off)
    }

    @Test
    fun `thirty frames under budget climb back one rung, straight to the top without a blur`() {
        val low = CallVideoDegradation().frames(20, 30.0)
        assertThat(low.frames(29, 5.0).tier).isEqualTo(CallBlurTier.Slow)
        assertThat(low.frames(30, 5.0).tier).isEqualTo(CallBlurTier.Fast)
        assertThat(low.frames(30, 5.0, blur = false).tier).isEqualTo(CallBlurTier.Balanced)
    }

    @Test
    fun `a frame between the budgets holds the rung and breaks the recovery`() {
        val low = CallVideoDegradation().frames(10, 30.0).frames(29, 5.0).recording(20.0, true)
        assertThat(low.frames(29, 5.0).tier).isEqualTo(CallBlurTier.Fast)
    }

    @Test
    fun `smoothing is shed from half the overload streak`() {
        assertThat(CallVideoDegradation().frames(4, 30.0).isSmoothingDegraded).isFalse()
        assertThat(CallVideoDegradation().frames(5, 30.0).isSmoothingDegraded).isTrue()
    }

    @Test
    fun `a constrained device never segments above the slow rung`() {
        assertThat(CallVideoDegradation().blurTier(isConstrained = true)).isEqualTo(CallBlurTier.Slow)
        assertThat(CallVideoDegradation().blurTier(isConstrained = false)).isEqualTo(CallBlurTier.Balanced)
        val off = CallVideoDegradation().frames(30, 30.0)
        assertThat(off.blurTier(isConstrained = true)).isEqualTo(CallBlurTier.Off)
    }

    @Test
    fun `the streaks stay bounded over a long call`() {
        val long = CallVideoDegradation().frames(10_000, 30.0)
        assertThat(long.overBudgetStreak).isAtMost(CallVideoDegradation.OVER_BUDGET_FRAMES)
        val calm = CallVideoDegradation().frames(10_000, 2.0)
        assertThat(calm.underBudgetStreak).isAtMost(CallVideoDegradation.UNDER_BUDGET_FRAMES)
    }
}
