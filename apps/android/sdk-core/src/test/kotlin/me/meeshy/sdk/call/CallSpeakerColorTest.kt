package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.theme.AuthorInk
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
    fun `on the thread the colour is the author ink of the scheme, the call colour untouched`() {
        val id = "user-7"
        val raw = DynamicColorGenerator.colorForName(id)
        assertThat(CallSpeakerColor.hex(id, DynamicColorGenerator.ThemeMode.LIGHT)).isEqualTo(AuthorInk.hex(raw, DynamicColorGenerator.ThemeMode.LIGHT))
        assertThat(CallSpeakerColor.hex(id, DynamicColorGenerator.ThemeMode.DARK)).isEqualTo(AuthorInk.hex(raw, DynamicColorGenerator.ThemeMode.DARK))
        assertThat(CallSpeakerColor.hex(id)).isEqualTo(DynamicColorGenerator.adaptedColor(raw, DynamicColorGenerator.ThemeMode.DARK))
    }

    @Test
    fun `the call colour of every palette entry is the lightened palette colour, never the author ink`() {
        for (raw in DynamicColorGenerator.vibrantPalette) {
            val id = idOf(raw)
            assertThat(CallSpeakerColor.hex(id)).isEqualTo(DynamicColorGenerator.adaptedColor(raw, DynamicColorGenerator.ThemeMode.DARK))
        }
    }

    @Test
    fun `a journal colour holds 4,5 to 1 on the card of both schemes`() {
        for (raw in DynamicColorGenerator.vibrantPalette) for (mode in DynamicColorGenerator.ThemeMode.entries) {
            assertThat(AuthorInk.backgrounds(mode).minOf { contrast(CallSpeakerColor.hex(idOf(raw), mode), it) }).isAtLeast(4.5)
        }
    }

    @Test
    fun `only a translated sentence takes the speaker colour, an original keeps the theme ink`() {
        assertThat(CallSpeakerColor.textHex("user-7", servesTranslation = true)).isEqualTo(CallSpeakerColor.hex("user-7"))
        assertThat(CallSpeakerColor.textHex("user-7", servesTranslation = false)).isNull()
        val light = DynamicColorGenerator.ThemeMode.LIGHT
        assertThat(CallSpeakerColor.textHex("user-7", servesTranslation = true, mode = light)).isEqualTo(CallSpeakerColor.hex("user-7", light))
        assertThat(CallSpeakerColor.textHex("user-7", servesTranslation = false, mode = light)).isNull()
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

    private fun idOf(raw: String): String =
        generateSequence(0) { it + 1 }.map { "speaker-$it" }.first { DynamicColorGenerator.colorForName(it) == raw }

    private fun contrast(a: String, b: String): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    private fun luminance(hex: String): Double {
        val v = hex.toInt(16)
        val (r, g, b) = listOf(v shr 16 and 0xFF, v shr 8 and 0xFF, v and 0xFF).map { c ->
            val s = c / 255.0
            if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
}
