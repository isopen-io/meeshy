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
        val pull = PullDownDismiss().pulled(20f)
        assertThat(pull.shouldDismissOnFling(velocityDpPerSecond = PullDownDismiss.FLING_VELOCITY_DP + 1f)).isTrue()
        assertThat(PullDownDismiss().shouldDismissOnFling(PullDownDismiss.FLING_VELOCITY_DP + 1f)).isFalse()
    }
}
