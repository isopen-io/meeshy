package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [LanguageData.colorHex] — the family colour of a language
 * (hex, no `#`), neutral for a code the catalogue does not know. Mirror of iOS
 * `LanguageData.colorHex(for:)` (LanguageData+Autonym.swift), neutral "A3A3C2".
 */
class LanguageColorTest {

    @Test
    fun `a catalogue code renders its colour`() {
        assertThat(LanguageData.colorHex("fr")).isEqualTo("3B82F6")
        assertThat(LanguageData.colorHex("ti")).isEqualTo("3B82F6")
        assertThat(LanguageData.colorHex("ksf")).isEqualTo("16A34A")
    }

    @Test
    fun `an unknown code gets the neutral colour`() {
        assertThat(LanguageData.colorHex("zz")).isEqualTo("A3A3C2")
        assertThat(LanguageData.NEUTRAL_COLOR_HEX).isEqualTo("A3A3C2")
    }

    @Test
    fun `a blank or absent code gets the neutral colour`() {
        assertThat(LanguageData.colorHex("")).isEqualTo(LanguageData.NEUTRAL_COLOR_HEX)
        assertThat(LanguageData.colorHex("   ")).isEqualTo(LanguageData.NEUTRAL_COLOR_HEX)
        assertThat(LanguageData.colorHex(null)).isEqualTo(LanguageData.NEUTRAL_COLOR_HEX)
    }

    @Test
    fun `the code is case and whitespace insensitive`() {
        assertThat(LanguageData.colorHex("FR")).isEqualTo("3B82F6")
        assertThat(LanguageData.colorHex(" fr ")).isEqualTo("3B82F6")
    }

    @Test
    fun `a regional tag takes the colour of its base language`() {
        assertThat(LanguageData.colorHex("pt-BR")).isEqualTo(LanguageData.info("pt")!!.colorHex)
        assertThat(LanguageData.colorHex("zh_Hant")).isEqualTo(LanguageData.info("zh")!!.colorHex)
    }

    @Test
    fun `the legacy filipino alias takes the catalogue colour`() {
        assertThat(LanguageData.colorHex("fil")).isEqualTo(LanguageData.info("tl")!!.colorHex)
    }

    @Test
    fun `the neutral colour is a six digit upper case hex`() {
        assertThat(LanguageData.NEUTRAL_COLOR_HEX).matches(Regex("^[0-9A-F]{6}$").toPattern())
    }

    @Test
    fun `every catalogue code agrees with its own colour`() {
        LanguageData.allLanguages.forEach {
            assertThat(LanguageData.colorHex(it.code)).isEqualTo(it.colorHex)
        }
    }
}
