package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Quelle version linguistique le lecteur a-t-il RÉELLEMENT sous les yeux. Miroir de
 * `ConsumedLanguageResolverTests.swift` (iOS) : la règle suit celle qui choisit le TEXTE
 * affiché, sans quoi la même lecture serait comptabilisée dans deux langues différentes
 * selon la plateforme — et un accusé de lecture déclarerait une langue que le lecteur n'a
 * jamais vue.
 */
class ConsumedLanguageResolverTest {

    private fun consumed(
        original: String?,
        translations: List<String>,
        prism: List<String>,
        manual: String? = null,
    ): String? = ConsumedLanguageResolver.resolve(
        originalLanguage = original,
        availableTranslations = translations,
        preferredLanguages = prism,
        manualSelection = manual,
    )

    // --- l'original prime ---

    @Test
    fun `the original in the preferred languages is the version read`() {
        assertThat(consumed("fr", listOf("en"), listOf("fr", "en"))).isEqualTo("fr")
    }

    @Test
    fun `the original wins even when a translation exists in a lower preferred language`() {
        assertThat(consumed("en", listOf("fr"), listOf("en", "fr"))).isEqualTo("en")
    }

    @Test
    fun `a translation ranked above the original is the version read`() {
        assertThat(consumed("en", listOf("fr"), listOf("fr", "en"))).isEqualTo("fr")
    }

    // --- sinon, la première préférence traduite ---

    @Test
    fun `the first translated preference wins`() {
        assertThat(consumed("de", listOf("en", "fr"), listOf("fr", "en"))).isEqualTo("fr")
        assertThat(consumed("de", listOf("en", "fr"), listOf("en", "fr"))).isEqualTo("en")
    }

    @Test
    fun `preferences without a translation are skipped`() {
        assertThat(consumed("de", listOf("fr"), listOf("es", "it", "fr"))).isEqualTo("fr")
    }

    // --- le repli est l'original, jamais une langue tierce ---

    @Test
    fun `no preferred translation falls back to the original`() {
        assertThat(consumed("de", listOf("it"), listOf("en"))).isEqualTo("de")
    }

    @Test
    fun `never falls back to an unrelated translation`() {
        assertThat(consumed("de", listOf("it", "es"), listOf("en"))).isEqualTo("de")
    }

    @Test
    fun `no translations at all reads the original`() {
        assertThat(consumed("de", emptyList(), listOf("en"))).isEqualTo("de")
    }

    @Test
    fun `an empty prism reads the original`() {
        assertThat(consumed("de", listOf("en"), emptyList())).isEqualTo("de")
    }

    // --- normalisation ---

    @Test
    fun `locale identifiers are normalised`() {
        assertThat(consumed("de", listOf("fr-FR"), listOf("fr_FR"))).isEqualTo("fr")
    }

    @Test
    fun `case is ignored`() {
        assertThat(consumed("FR", emptyList(), listOf("fr"))).isEqualTo("fr")
    }

    @Test
    fun `three-letter codes are not truncated`() {
        assertThat(consumed("fr", listOf("bas"), listOf("bas"))).isEqualTo("bas")
    }

    @Test
    fun `a region-tagged original competes at its canonical rank`() {
        assertThat(consumed("en-US", listOf("fr"), listOf("en", "fr"))).isEqualTo("en")
    }

    // --- rien à déclarer ---

    @Test
    fun `an unknown original and no match is undeterminable`() {
        assertThat(consumed(null, listOf("it"), listOf("en"))).isNull()
    }

    @Test
    fun `an unknown original with a preferred translation reads that translation`() {
        assertThat(consumed(null, listOf("en"), listOf("en"))).isEqualTo("en")
    }

    @Test
    fun `an illegible original is undeterminable`() {
        assertThat(consumed("@@@", emptyList(), listOf("en"))).isNull()
    }

    // --- bascule manuelle ---

    @Test
    fun `a manual switch overrides every preference`() {
        assertThat(consumed("fr", listOf("en", "es"), listOf("fr"), manual = "es")).isEqualTo("es")
    }

    @Test
    fun `a manual switch to an absent version is ignored`() {
        assertThat(consumed("fr", listOf("en"), listOf("fr"), manual = "es")).isEqualTo("fr")
    }

    @Test
    fun `a manual switch back to the original is honoured`() {
        assertThat(consumed("fr", listOf("en"), listOf("en"), manual = "fr")).isEqualTo("fr")
    }

    @Test
    fun `a blank manual switch follows the prism`() {
        assertThat(consumed("fr", listOf("en"), listOf("en"), manual = "  ")).isEqualTo("en")
    }
}
