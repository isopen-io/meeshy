package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

/**
 * Le prisme STRICT du lecteur — rangs 1 à 4, sans repli « fr ». Miroir de
 * `ReaderPrism.swift` (`packages/MeeshySDK/.../Auth/`) : la différence, voulue, avec
 * [LanguageResolver.preferredContentLanguages] dont le repli « fr » sert les DÉFAUTS de
 * composition, jamais ce qu'on lit.
 */
class ReaderPrismTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    @Test
    fun `descends the four ranks in order`() {
        val prism = ReaderPrism.resolve(
            systemLanguage = "fr",
            regionalLanguage = "en",
            customDestinationLanguage = "es",
            deviceLocale = "de",
        )
        assertThat(prism).containsExactly("fr", "en", "es", "de").inOrder()
    }

    @Test
    fun `nothing configured and no device locale is an EMPTY prism, never the fr fallback`() {
        assertThat(ReaderPrism.resolve(Prefs())).isEmpty()
        // La différence voulue avec la composition : ce repli sert les défauts du composer.
        assertThat(LanguageResolver.preferredContentLanguages(Prefs())).containsExactly("fr")
    }

    @Test
    fun `de-duplicates case-insensitively and the first spelling wins`() {
        val prism = ReaderPrism.resolve(
            systemLanguage = "EN",
            regionalLanguage = "en",
            customDestinationLanguage = "fr",
            deviceLocale = "FR",
        )
        assertThat(prism).containsExactly("EN", "fr").inOrder()
    }

    @Test
    fun `a blank or missing rank is skipped without leaving a gap`() {
        val prism = ReaderPrism.resolve(
            systemLanguage = "  ",
            regionalLanguage = null,
            customDestinationLanguage = "it",
            deviceLocale = "",
        )
        assertThat(prism).containsExactly("it")
    }

    @Test
    fun `the device locale is normalised to its language code at rank 4`() {
        assertThat(ReaderPrism.resolve(Prefs(deviceLocale = "pt_BR"))).containsExactly("pt")
        assertThat(ReaderPrism.resolve(Prefs(deviceLocale = "zh-Hant-HK"))).containsExactly("zh")
    }

    @Test
    fun `an unparseable device locale is skipped`() {
        assertThat(ReaderPrism.resolve(Prefs(systemLanguage = "fr", deviceLocale = "@@@")))
            .containsExactly("fr")
    }

    @Test
    fun `the device locale never supplants an in-app preference, it follows it`() {
        val prism = ReaderPrism.resolve(Prefs(systemLanguage = "fr", deviceLocale = "en-US"))
        assertThat(prism).containsExactly("fr", "en").inOrder()
    }

    @Test
    fun `a device locale already served by an in-app rank is not repeated`() {
        val prism = ReaderPrism.resolve(Prefs(regionalLanguage = "en", deviceLocale = "en-GB"))
        assertThat(prism).containsExactly("en")
    }

    @Test
    fun `the stored device locale wins over the current one on a cold start`() {
        assertThat(ReaderPrism.deviceLocale(stored = "es-MX", current = Locale.FRANCE)).isEqualTo("es-MX")
    }

    @Test
    fun `a missing or blank stored device locale falls back to the current locale language`() {
        assertThat(ReaderPrism.deviceLocale(stored = null, current = Locale.FRANCE)).isEqualTo("fr")
        assertThat(ReaderPrism.deviceLocale(stored = "  ", current = Locale.GERMANY)).isEqualTo("de")
    }

    @Test
    fun `no stored locale and a language-less current locale yield no device rank`() {
        assertThat(ReaderPrism.deviceLocale(stored = null, current = Locale.ROOT)).isNull()
    }

    @Test
    fun `the cold-start prism of a reader without a stored locale reads the device language`() {
        val prism = ReaderPrism.resolve(Prefs(systemLanguage = "fr"), current = Locale.US)
        assertThat(prism).containsExactly("fr", "en").inOrder()
    }

    @Test
    fun `the cold-start prism of an anonymous reader is the device language alone`() {
        assertThat(ReaderPrism.resolve(Prefs(), current = Locale.JAPAN)).containsExactly("ja")
    }

    @Test
    fun `a legacy JVM Hebrew locale reaches the he rank`() {
        assertThat(ReaderPrism.resolve(Prefs(deviceLocale = "iw"))).containsExactly("he")
    }
}
