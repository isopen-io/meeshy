package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * `StoryDurationPin` is the authoring counterpart of the reader-side SSOT
 * [StorySlideDuration]: where the reader *reads* `effects.timelineDuration`, the
 * composer *writes* it, and this object owns the one clamp that bounds what the
 * author may pin. It ports iOS `StoryComposerViewModel.currentSlideDuration`'s
 * `max(2, min(600, newValue))` exactly, plus a NaN guard the Float slider could
 * otherwise feed through. These tests pin the bounds so the two clients never drift.
 */
class StoryDurationPinTest {

    @Test
    fun `a value inside the range is left unchanged`() {
        assertThat(StoryDurationPin.clamp(8.0)).isEqualTo(8.0)
    }

    @Test
    fun `a value below the floor clamps up to the minimum`() {
        assertThat(StoryDurationPin.clamp(0.5)).isEqualTo(StoryDurationPin.MIN_SECONDS)
        assertThat(StoryDurationPin.clamp(1.9)).isEqualTo(StoryDurationPin.MIN_SECONDS)
    }

    @Test
    fun `a value above the ceiling clamps down to the maximum`() {
        assertThat(StoryDurationPin.clamp(999.0)).isEqualTo(StoryDurationPin.MAX_SECONDS)
    }

    @Test
    fun `the exact bounds are preserved`() {
        assertThat(StoryDurationPin.clamp(StoryDurationPin.MIN_SECONDS)).isEqualTo(StoryDurationPin.MIN_SECONDS)
        assertThat(StoryDurationPin.clamp(StoryDurationPin.MAX_SECONDS)).isEqualTo(StoryDurationPin.MAX_SECONDS)
    }

    @Test
    fun `the iOS bounds are 2 and 600 seconds`() {
        assertThat(StoryDurationPin.MIN_SECONDS).isEqualTo(2.0)
        assertThat(StoryDurationPin.MAX_SECONDS).isEqualTo(600.0)
    }

    @Test
    fun `positive infinity clamps to the maximum`() {
        assertThat(StoryDurationPin.clamp(Double.POSITIVE_INFINITY)).isEqualTo(StoryDurationPin.MAX_SECONDS)
    }

    @Test
    fun `negative infinity clamps to the minimum`() {
        assertThat(StoryDurationPin.clamp(Double.NEGATIVE_INFINITY)).isEqualTo(StoryDurationPin.MIN_SECONDS)
    }

    @Test
    fun `a NaN falls back to the minimum rather than propagating`() {
        assertThat(StoryDurationPin.clamp(Double.NaN)).isEqualTo(StoryDurationPin.MIN_SECONDS)
    }
}
