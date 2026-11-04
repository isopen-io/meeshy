package me.meeshy.app.game.photo

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.GloryFrameFontFamily
import me.meeshy.ui.theme.GloryFrameFontLoader
import me.meeshy.ui.theme.GloryFrameScript
import org.junit.Test

class GloryFrameScriptTest {

    private val latinRanges = listOf(
        0x0000..0x024F, 0x0250..0x02FF, 0x0300..0x036F, 0x1AB0..0x1AFF, 0x1DC0..0x1DFF, 0x1E00..0x1EFF,
        0x2000..0x206F, 0x20A0..0x20CF, 0x2100..0x214F, 0x2C60..0x2C7F, 0xA720..0xA7FF, 0xFB00..0xFB06,
    )

    @Test
    fun `the twelve latin ranges keep the display font, edges included`() {
        assertThat(latinRanges).hasSize(12)
        latinRanges.forEach { range ->
            listOf(range.first, range.last).filter { it != 0x2122 && it != 0x2139 }.forEach { cp ->
                val text = "Ab" + String(Character.toChars(cp))
                assertThat(GloryFrameScript.needsSystemFont(text)).isFalse()
            }
        }
    }

    @Test
    fun `an emoji or a non latin script takes the system stack for the whole text`() {
        listOf("Bravo 🎉", "Привет", "Γειά", "שלום", "مرحبا", "你好", "नमस्ते", "こんにちは", "Hello ™").forEach {
            assertThat(GloryFrameScript.needsSystemFont(it)).isTrue()
        }
        assertThat(GloryFrameScript.needsSystemFont("Héloïse – 100 € ½")).isFalse()
    }

    @Test
    fun `the loader opens nothing before the first use and falls back for a non latin text`() {
        val opened = mutableListOf<String>()
        val loader = GloryFrameFontLoader(fallback = "system") { path, _ -> path.also { opened += it } }

        assertThat(opened).isEmpty()
        assertThat(loader.resolve("Cinzel", 600, text = "Привет")).isEqualTo("system")
        assertThat(opened).isEmpty()
        assertThat(loader.resolve("Cinzel", 600, text = "Mee")).isEqualTo("fonts/glory/Cinzel[wght].ttf")
        assertThat(loader.resolve("Cinzel", 600, text = "Meo")).isEqualTo("fonts/glory/Cinzel[wght].ttf")
        assertThat(opened).hasSize(1)
        assertThat(loader.resolve("Comic Sans", 400, text = "Mee")).isEqualTo("system")
    }

    @Test
    fun `the closed list holds exactly the five families`() {
        assertThat(GloryFrameFontFamily.entries.map { it.displayName })
            .containsExactly("Cinzel", "Cinzel Decorative", "Cormorant Garamond", "Fraunces", "Manrope")
    }
}
