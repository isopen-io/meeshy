package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PullDownDismissTest {
    @Test
    fun `a pull shorter than the threshold does not dismiss`() {
        val pull = PullDownDismiss().pulled(PullDownDismiss.THRESHOLD_DP - 1f)
        assertThat(pull.shouldDismiss).isFalse()
    }

    @Test
    fun `a pull past the threshold dismisses on release`() {
        val pull = PullDownDismiss().pulled(PullDownDismiss.THRESHOLD_DP / 2).pulled(PullDownDismiss.THRESHOLD_DP / 2 + 1f)
        assertThat(pull.shouldDismiss).isTrue()
    }

    @Test
    fun `going back up gives the distance back and never goes negative`() {
        val pull = PullDownDismiss().pulled(100f).pulled(-500f)
        assertThat(pull.distanceDp).isEqualTo(0f)
        assertThat(pull.shouldDismiss).isFalse()
    }

    @Test
    fun `released resets the gesture`() {
        assertThat(PullDownDismiss().pulled(500f).released().distanceDp).isEqualTo(0f)
    }

    @Test
    fun `a fast fling down from the top dismisses even with a short pull`() {
        val pull = PullDownDismiss().pulled(PullDownDismiss.FLING_MIN_DISTANCE_DP)
        assertThat(pull.shouldDismissOnFling(velocityDpPerSecond = PullDownDismiss.FLING_VELOCITY_DP + 1f)).isTrue()
        assertThat(PullDownDismiss().shouldDismissOnFling(PullDownDismiss.FLING_VELOCITY_DP + 1f)).isFalse()
    }

    @Test
    fun `a fast scroll that only bumps into the top of the card does not dismiss`() {
        val bump = PullDownDismiss().pulled(PullDownDismiss.FLING_MIN_DISTANCE_DP - 1f)
        assertThat(bump.outcome(velocityDpPerSecond = PullDownDismiss.FLING_VELOCITY_DP * 3, keyboardOpen = false))
            .isEqualTo(PullOutcome.NONE)
    }

    @Test
    fun `with the keyboard up a full pull lowers the keyboard instead of closing`() {
        val pull = PullDownDismiss().pulled(PullDownDismiss.THRESHOLD_DP + 1f)
        assertThat(pull.outcome(velocityDpPerSecond = 0f, keyboardOpen = true)).isEqualTo(PullOutcome.HIDE_KEYBOARD)
        assertThat(pull.outcome(velocityDpPerSecond = 0f, keyboardOpen = false)).isEqualTo(PullOutcome.DISMISS)
    }

    @Test
    fun `a short slow pull does nothing whatever the keyboard`() {
        val pull = PullDownDismiss().pulled(PullDownDismiss.THRESHOLD_DP - 1f)
        assertThat(pull.outcome(velocityDpPerSecond = 0f, keyboardOpen = true)).isEqualTo(PullOutcome.NONE)
        assertThat(pull.outcome(velocityDpPerSecond = 0f, keyboardOpen = false)).isEqualTo(PullOutcome.NONE)
    }
}
