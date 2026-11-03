package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleInkTest {

    @Test
    fun `the darker indigo steps carry a white ink`() {
        listOf("4F46E5", "4338CA", "312E81").forEach {
            assertThat(BubbleInk.readableOn(it)).isEqualTo(BubbleInk.WHITE)
        }
    }

    @Test
    fun `light accents carry a black ink`() {
        listOf("FFFFFF", "FFD60A", "A5B4FC", "C7D2FE", "34D399").forEach {
            assertThat(BubbleInk.readableOn(it)).isEqualTo(BubbleInk.BLACK)
        }
    }

    @Test
    fun `dark accents carry a white ink`() {
        listOf("000000", "09090B", "7F1D1D", "1E3A8A").forEach {
            assertThat(BubbleInk.readableOn(it)).isEqualTo(BubbleInk.WHITE)
        }
    }

    @Test
    fun `the hash and the case do not change the ink`() {
        assertThat(BubbleInk.readableOn("#ffd60a")).isEqualTo(BubbleInk.BLACK)
    }

    @Test
    fun `an unreadable hex falls back on white`() {
        assertThat(BubbleInk.readableOn("not-a-color")).isEqualTo(BubbleInk.WHITE)
    }

    @Test
    fun `the elected ink never has a worse contrast than the other one`() {
        for (r in 0..255 step 51) for (g in 0..255 step 51) for (b in 0..255 step 51) {
            val hex = "%02X%02X%02X".format(r, g, b)
            val lum = me.meeshy.sdk.model.theme.HexColor.parse(hex)!!.luminance
            val onBlack = (lum + 0.05) / 0.05
            val onWhite = 1.05 / (lum + 0.05)
            val ink = BubbleInk.readableOn(hex)
            if (ink == BubbleInk.BLACK) assertThat(onBlack).isAtLeast(onWhite) else assertThat(onWhite).isAtLeast(onBlack)
        }
    }
}
