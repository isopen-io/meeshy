package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleSkinLawTest {

    @Test
    fun `without a personal accent the sent bubble is the brand indigo with a white ink`() {
        val skin = BubbleSkinSpec.resolve(null)
        assertThat(skin.sentFillHex).isEqualTo("6366F1")
        assertThat(skin.sentInk).isEqualTo(BubbleInk.WHITE)
        assertThat(skin).isEqualTo(BubbleSkinSpec.BRAND)
    }

    @Test
    fun `a personal accent colours the sent bubble with the readable ink`() {
        val yellow = BubbleSkinSpec.resolve("#ffd60a")
        assertThat(yellow.sentFillHex).isEqualTo("FFD60A")
        assertThat(yellow.sentInk).isEqualTo(BubbleInk.BLACK)
        assertThat(BubbleSkinSpec.resolve("7F1D1D").sentInk).isEqualTo(BubbleInk.WHITE)
    }

    @Test
    fun `a malformed personal accent keeps the brand skin`() {
        assertThat(BubbleSkinSpec.resolve("zz")).isEqualTo(BubbleSkinSpec.BRAND)
    }

    @Test
    fun `accentHex follows the side of the bubble`() {
        val skin = BubbleSkinSpec.resolve("FFD60A")
        assertThat(skin.accentHex(isMe = true, receivedHex = "112233")).isEqualTo("FFD60A")
        assertThat(skin.accentHex(isMe = false, receivedHex = "112233")).isEqualTo("112233")
    }

    @Test
    fun `received fill mixes the accent into the surface`() {
        assertThat(BubbleSkinLaw.receivedFillHex("FF0000", isDark = false)).isEqualTo("FFD6D6")
        assertThat(BubbleSkinLaw.receivedFillHex("FF0000", isDark = true)).isEqualTo("4D0607")
    }

    @Test
    fun `received stroke alpha is 0_34 in dark and 0_26 in light`() {
        assertThat(BubbleSkinLaw.receivedStrokeAlpha(isDark = true)).isEqualTo(0.34f)
        assertThat(BubbleSkinLaw.receivedStrokeAlpha(isDark = false)).isEqualTo(0.26f)
    }

    @Test
    fun `received accent blends the sender into the brand indigo at 30 percent`() {
        // troncature entière iOS : 0x66 x 0,3 + 0x66 x 0,7 = 101,99 -> 0x65
        assertThat(BubbleSkinLaw.receivedAccentHex(null)).isEqualTo("6365F1")
        assertThat(BubbleSkinLaw.receivedAccentHex("000000")).isEqualTo("4547A8")
    }

    @Test
    fun `shape constants match iOS`() {
        assertThat(BubbleSkinLaw.CORNER_RADIUS_DP).isEqualTo(18f)
        assertThat(BubbleSkinLaw.MIN_SPACER_DP).isEqualTo(50f)
        assertThat(BubbleSkinLaw.RECEIVED_STROKE_WIDTH_DP).isEqualTo(1f)
    }
}
