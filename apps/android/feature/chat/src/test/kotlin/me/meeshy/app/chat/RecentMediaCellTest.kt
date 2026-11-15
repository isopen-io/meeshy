package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RecentMediaCellTest {

    @Test
    fun `video duration reads as minutes and zero padded seconds`() {
        assertThat(formatClock(75_000)).isEqualTo("1:15")
        assertThat(formatClock(5_000)).isEqualTo("0:05")
    }

    @Test
    fun `a negative duration clamps to zero`() {
        assertThat(formatClock(-3_000)).isEqualTo("0:00")
    }
}
