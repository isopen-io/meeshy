package me.meeshy.sdk.theme

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.theme.DynamicColorGenerator.ConversationContext
import me.meeshy.sdk.theme.DynamicColorGenerator.ConversationLanguage
import me.meeshy.sdk.theme.DynamicColorGenerator.ConversationTheme
import me.meeshy.sdk.theme.DynamicColorGenerator.ConversationType
import org.junit.Test

class DynamicColorGeneratorTest {

    @Test
    fun colorForName_isDeterministicAndMatchesIosDjb2() {
        // DJB2("test") % 39 == 32 → vibrantPalette[32]
        assertThat(DynamicColorGenerator.colorForName("test")).isEqualTo("9B59B6")
        assertThat(DynamicColorGenerator.colorForName("test"))
            .isEqualTo(DynamicColorGenerator.colorForName("test"))
    }

    @Test
    fun colorFor_blendsLanguageTypeThemeWithIosWeights() {
        // french=3498DB*.3 + direct=FF6B6B*.3 + general=4ECDC4*.4 → 7B9FB0
        val palette = DynamicColorGenerator.colorFor(
            ConversationContext(
                name = "Demo",
                type = ConversationType.DIRECT,
                language = ConversationLanguage.FRENCH,
                theme = ConversationTheme.GENERAL,
            ),
        )
        assertThat(palette.primary).isEqualTo("7B9FB0")
    }

    @Test
    fun colorFor_saturationBoostScalesWithMemberCount() {
        val small = DynamicColorGenerator.colorFor(ConversationContext("A", memberCount = 0))
        val big = DynamicColorGenerator.colorFor(ConversationContext("B", memberCount = 200))
        assertThat(small.saturationBoost).isEqualTo(0.0)
        assertThat(big.saturationBoost).isEqualTo(0.2)
    }

    @Test
    fun blendTwo_averagesChannelsWithTruncation() {
        // r/g/b = 255*.5 = 127.5 → truncated 127 = 0x7F
        assertThat(DynamicColorGenerator.blendTwo("FF0000", 0.5, "0000FF", 0.5))
            .isEqualTo("7F007F")
    }

    @Test
    fun hueShift_producesValidDistinctColor() {
        val shifted = DynamicColorGenerator.hueShiftedHex("3498DB", 120.0)
        assertThat(shifted).matches("[0-9A-F]{6}")
        assertThat(shifted).isNotEqualTo("3498DB")
    }

    @Test
    fun hueShift_isApproximatelyReversible() {
        val original = "3498DB"
        val roundTrip = DynamicColorGenerator.hueShiftedHex(
            DynamicColorGenerator.hueShiftedHex(original, 120.0),
            -120.0,
        )
        // RGB <-> HSV conversions truncate; allow a small per-channel tolerance.
        for (i in listOf(0, 2, 4)) {
            val delta = channel(roundTrip, i) - channel(original, i)
            assertThat(kotlin.math.abs(delta)).isAtMost(8)
        }
    }

    private fun channel(hex: String, index: Int): Int = hex.substring(index, index + 2).toInt(16)

    @Test
    fun colorForPost_returnsValidHex() {
        val hex = DynamicColorGenerator.colorForPost("authorId123", "STORY", "en")
        assertThat(hex).matches("[0-9A-F]{6}")
    }

    @Test
    fun adaptedColor_lightModeCapsBrightness() {
        val light = DynamicColorGenerator.adaptedColor("FFFFFF", DynamicColorGenerator.ThemeMode.LIGHT)
        assertThat(light).matches("[0-9A-F]{6}")
        // White capped at brightness 0.60 → no longer pure white
        assertThat(light).isNotEqualTo("FFFFFF")
    }
}
