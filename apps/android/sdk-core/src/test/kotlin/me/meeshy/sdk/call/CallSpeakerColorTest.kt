package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.theme.DynamicColorGenerator
import org.junit.Test

class CallSpeakerColorTest {
    @Test
    fun `the same user id always gets the same colour`() {
        assertThat(CallSpeakerColor.hex("user-42")).isEqualTo(CallSpeakerColor.hex("user-42"))
    }

    @Test
    fun `the colour is the dark-adapted palette colour of the id`() {
        val id = "user-7"
        val expected = DynamicColorGenerator.adaptedColor(DynamicColorGenerator.colorForName(id), DynamicColorGenerator.ThemeMode.DARK)
        assertThat(CallSpeakerColor.hex(id)).isEqualTo(expected)
    }

    @Test
    fun `the dark colour is never darker than the raw palette colour`() {
        val id = "ada"
        assertThat(brightness(CallSpeakerColor.hex(id))).isAtLeast(brightness(DynamicColorGenerator.colorForName(id)) - 1)
    }

    private fun brightness(hex: String): Int {
        val v = hex.removePrefix("#").take(6).toInt(16)
        return maxOf((v shr 16) and 0xFF, (v shr 8) and 0xFF, v and 0xFF)
    }
}
