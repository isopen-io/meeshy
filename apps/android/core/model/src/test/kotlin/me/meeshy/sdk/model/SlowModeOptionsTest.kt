package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SlowModeOptionsTest {

    @Test
    fun `offers the five canonical intervals ascending with off first`() {
        assertThat(SlowModeOptions.SECONDS).containsExactly(0, 10, 30, 60, 300).inOrder()
    }

    @Test
    fun `isValid accepts an offered interval and rejects an off-menu one`() {
        assertThat(SlowModeOptions.isValid(30)).isTrue()
        assertThat(SlowModeOptions.isValid(45)).isFalse()
        assertThat(SlowModeOptions.isValid(0)).isTrue()
    }

    @Test
    fun `nearest maps null and non-positive intervals to off`() {
        assertThat(SlowModeOptions.nearest(null)).isEqualTo(0)
        assertThat(SlowModeOptions.nearest(0)).isEqualTo(0)
        assertThat(SlowModeOptions.nearest(-5)).isEqualTo(0)
    }

    @Test
    fun `nearest snaps an in-between interval to the closest offered choice`() {
        assertThat(SlowModeOptions.nearest(11)).isEqualTo(10)
        assertThat(SlowModeOptions.nearest(50)).isEqualTo(60)
        assertThat(SlowModeOptions.nearest(200)).isEqualTo(300)
    }

    @Test
    fun `nearest breaks an exact tie toward the smaller interval`() {
        assertThat(SlowModeOptions.nearest(20)).isEqualTo(10)
        assertThat(SlowModeOptions.nearest(45)).isEqualTo(30)
    }

    @Test
    fun `nearest clamps a value above the largest option to the largest option`() {
        assertThat(SlowModeOptions.nearest(600)).isEqualTo(300)
    }

    @Test
    fun `nearest returns an exact offered interval unchanged`() {
        assertThat(SlowModeOptions.nearest(60)).isEqualTo(60)
    }
}
