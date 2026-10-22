package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [LanguageData.autonym] — the name of a language written in
 * that language ("한국어", "العربية"), so a list of spoken languages reads the same
 * for everybody whatever the interface language. Mirror of iOS
 * `LanguageData.autonym(for:)` (LanguageData+Autonym.swift): the catalogue first,
 * then the platform `Locale` for a code the catalogue ignores, then the code in
 * capitals.
 */
class LanguageAutonymTest {

    // ---- catalogue first ------------------------------------------------

    @Test
    fun `a catalogue code renders its native name in its own script`() {
        assertThat(LanguageData.autonym("ko")).isEqualTo("한국어")
        assertThat(LanguageData.autonym("ar")).isEqualTo("العربية")
        assertThat(LanguageData.autonym("ja")).isEqualTo("日本語")
        assertThat(LanguageData.autonym("ru")).isEqualTo("Русский")
    }

    @Test
    fun `a Latin catalogue code keeps its diacritics`() {
        assertThat(LanguageData.autonym("fr")).isEqualTo("Français")
        assertThat(LanguageData.autonym("es")).isEqualTo("Español")
        assertThat(LanguageData.autonym("pt")).isEqualTo("Português")
    }

    @Test
    fun `the code is case and whitespace insensitive`() {
        assertThat(LanguageData.autonym("KO")).isEqualTo("한국어")
        assertThat(LanguageData.autonym("  fr  ")).isEqualTo("Français")
    }

    @Test
    fun `a regional tag resolves through its base language`() {
        assertThat(LanguageData.autonym("pt-BR")).isEqualTo("Português")
        assertThat(LanguageData.autonym("zh-Hant")).isEqualTo("中文")
        assertThat(LanguageData.autonym("fr_CA")).isEqualTo("Français")
    }

    @Test
    fun `the legacy filipino alias resolves to the catalogue entry`() {
        assertThat(LanguageData.autonym("fil")).isEqualTo("Filipino")
    }

    @Test
    fun `the five languages added from iOS have an autonym`() {
        assertThat(LanguageData.autonym("om")).isEqualTo("Afaan Oromoo")
        assertThat(LanguageData.autonym("ti")).isEqualTo("ትግርኛ")
        assertThat(LanguageData.autonym("ny")).isEqualTo("Chinyanja")
        assertThat(LanguageData.autonym("ksf")).isEqualTo("Rikpa")
        assertThat(LanguageData.autonym("nnh")).isEqualTo("Ngiemboon")
    }

    // ---- then the platform Locale ---------------------------------------

    @Test
    fun `a code outside the catalogue is written by the platform Locale in its own language`() {
        assertThat(LanguageData.autonym("eu")).isEqualTo("Euskara")
    }

    @Test
    fun `a Locale fallback is capitalised word by word`() {
        assertThat(LanguageData.autonym("is")).isEqualTo("Íslenska")
    }

    // ---- then the code in capitals --------------------------------------

    @Test
    fun `a code nobody knows falls back to the code in capitals`() {
        assertThat(LanguageData.autonym("zz")).isEqualTo("ZZ")
        assertThat(LanguageData.autonym("qxq")).isEqualTo("QXQ")
    }

    @Test
    fun `an ill formed code falls back to the code in capitals instead of crashing`() {
        assertThat(LanguageData.autonym("1")).isEqualTo("1")
        assertThat(LanguageData.autonym("not a code")).isEqualTo("NOT A CODE")
    }

    @Test
    fun `a blank or absent code yields an empty name`() {
        assertThat(LanguageData.autonym("")).isEmpty()
        assertThat(LanguageData.autonym("   ")).isEmpty()
        assertThat(LanguageData.autonym(null)).isEmpty()
    }

    // ---- consistency -----------------------------------------------------

    @Test
    fun `every catalogue code has an autonym equal to its native name`() {
        LanguageData.allLanguages.forEach {
            assertThat(LanguageData.autonym(it.code)).isEqualTo(it.nativeName)
        }
    }
}
