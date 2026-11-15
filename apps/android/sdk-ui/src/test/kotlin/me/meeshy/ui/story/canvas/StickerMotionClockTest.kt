package me.meeshy.ui.story.canvas

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerMotionClockTest {
    private fun ms(v: Long) = v * 1_000_000L

    @Test
    fun `le premier tick pose l origine sans avancer`() {
        val clock = StickerMotionClock().apply { advance(ms(5_000)) }
        assertThat(clock.elapsedSeconds).isEqualTo(0.0)
    }

    @Test
    fun `deux ticks consecutifs cumulent leur intervalle`() {
        val clock = StickerMotionClock().apply { advance(0); advance(ms(16)); advance(ms(32)) }
        assertThat(clock.elapsedSeconds).isWithin(1e-9).of(0.032)
    }

    @Test
    fun `un trou n est pas accumule`() {
        val clock = StickerMotionClock().apply { advance(0); advance(ms(100)); advance(ms(60_000)); advance(ms(60_016)) }
        assertThat(clock.elapsedSeconds).isWithin(1e-9).of(0.116)
    }
}
