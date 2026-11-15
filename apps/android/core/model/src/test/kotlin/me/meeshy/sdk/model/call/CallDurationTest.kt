package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallDurationTest {

    @Test
    fun `zero formats as 00 00 so a running timer starts there`() {
        assertThat(CallDuration.clock(0)).isEqualTo("00:00")
    }

    @Test
    fun `a negative count is clamped to zero`() {
        assertThat(CallDuration.clock(-5)).isEqualTo("00:00")
    }

    @Test
    fun `sub-minute pads the seconds and the minutes`() {
        assertThat(CallDuration.clock(5)).isEqualTo("00:05")
        assertThat(CallDuration.clock(59)).isEqualTo("00:59")
    }

    @Test
    fun `minute boundary rolls the seconds and keeps two minute digits`() {
        assertThat(CallDuration.clock(60)).isEqualTo("01:00")
        assertThat(CallDuration.clock(125)).isEqualTo("02:05")
        assertThat(CallDuration.clock(600)).isEqualTo("10:00")
        assertThat(CallDuration.clock(3599)).isEqualTo("59:59")
    }

    @Test
    fun `past an hour widens to H MM SS with zero-padded minutes`() {
        assertThat(CallDuration.clock(3600)).isEqualTo("1:00:00")
        assertThat(CallDuration.clock(3661)).isEqualTo("1:01:01")
        assertThat(CallDuration.clock(3725)).isEqualTo("1:02:05")
    }

    @Test
    fun `multi-hour minutes and seconds stay padded`() {
        assertThat(CallDuration.clock(7_200)).isEqualTo("2:00:00")
        assertThat(CallDuration.clock(36_000 + 9 * 60 + 3)).isEqualTo("10:09:03")
    }
}
