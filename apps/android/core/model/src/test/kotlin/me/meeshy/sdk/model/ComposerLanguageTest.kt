package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

/**
 * Behavioural spec for [ComposerLanguage] — the pure default + flag-glyph SSOT any
 * new-content composer (the Feed post composer today) needs. Port of iOS
 * `ComposerModels.swift`'s `DefaultComposerLanguage.resolve()` /
 * `ComposerLanguageFlag.label(for:)`.
 */
class ComposerLanguageTest {

    @Test
    fun `the default composer language is the Prisme fallback, French`() {
        assertThat(ComposerLanguage.DEFAULT).isEqualTo("fr")
        assertThat(ComposerLanguage.DEFAULT).isEqualTo(LanguageResolver.FALLBACK_LANGUAGE)
    }

    @Test
    fun `flag resolves the catalogue flag for a known code`() {
        assertThat(ComposerLanguage.flag("fr")).isEqualTo("🇫🇷")
        assertThat(ComposerLanguage.flag("es")).isEqualTo("🇪🇸")
    }

    @Test
    fun `flag matches a known code case-insensitively, like the rest of the catalogue`() {
        assertThat(ComposerLanguage.flag("FR")).isEqualTo("🇫🇷")
    }

    @Test
    fun `flag falls back to the uppercased raw code for a code outside the catalogue`() {
        assertThat(ComposerLanguage.flag("zzzznotalanguage")).isEqualTo("ZZZZNOTALANGUAGE")
    }

    @Test
    fun `flag of a blank code falls back to an empty string, never a crash`() {
        assertThat(ComposerLanguage.flag("")).isEqualTo("")
    }
}
