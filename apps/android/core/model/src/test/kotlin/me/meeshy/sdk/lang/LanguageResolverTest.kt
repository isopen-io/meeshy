package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

class LanguageResolverTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private data class Translation(
        override val targetLanguage: String,
        override val translatedContent: String,
    ) : LanguageResolver.TranslationLike

    @Test
    fun resolveUserLanguage_prefersSystemLanguage() {
        val prefs = Prefs(systemLanguage = "es", regionalLanguage = "de")
        assertThat(LanguageResolver.resolveUserLanguage(prefs)).isEqualTo("es")
    }

    @Test
    fun resolveUserLanguage_fallsBackThroughChain() {
        assertThat(LanguageResolver.resolveUserLanguage(Prefs(regionalLanguage = "de")))
            .isEqualTo("de")
        assertThat(LanguageResolver.resolveUserLanguage(Prefs(customDestinationLanguage = "it")))
            .isEqualTo("it")
    }

    @Test
    fun resolveUserLanguage_defaultsToFrench() {
        assertThat(LanguageResolver.resolveUserLanguage(Prefs())).isEqualTo("fr")
    }

    @Test
    fun resolveUserLanguage_treatsBlankAsAbsent() {
        val prefs = Prefs(systemLanguage = "   ", regionalLanguage = "de")
        assertThat(LanguageResolver.resolveUserLanguage(prefs)).isEqualTo("de")
    }

    @Test
    fun preferredContentLanguages_dedupesCaseInsensitively() {
        val prefs = Prefs(systemLanguage = "EN", regionalLanguage = "en", customDestinationLanguage = "fr")
        assertThat(LanguageResolver.preferredContentLanguages(prefs))
            .containsExactly("EN", "fr").inOrder()
    }

    @Test
    fun preferredContentLanguages_defaultsToFrench() {
        assertThat(LanguageResolver.preferredContentLanguages(Prefs())).containsExactly("fr")
    }

    @Test
    fun preferredTranslation_picksHighestPriorityMatch() {
        val prefs = Prefs(systemLanguage = "es", regionalLanguage = "de")
        val translations = listOf(
            Translation("de", "Hallo"),
            Translation("es", "Hola"),
        )
        assertThat(LanguageResolver.preferredTranslation(translations, prefs)?.translatedContent)
            .isEqualTo("Hola")
    }

    @Test
    fun preferredTranslation_returnsNullWhenNoMatch_showOriginal() {
        val prefs = Prefs(systemLanguage = "es")
        val translations = listOf(Translation("de", "Hallo"), Translation("ja", "konnichiwa"))
        assertThat(LanguageResolver.preferredTranslation(translations, prefs)).isNull()
    }

    @Test
    fun preferredTranslation_returnsNullForEmptyTranslations() {
        assertThat(LanguageResolver.preferredTranslation(emptyList<Translation>(), Prefs(systemLanguage = "es")))
            .isNull()
    }

    @Test
    fun preferredTranslation_ignoresBlankTranslatedContent() {
        val prefs = Prefs(systemLanguage = "es")
        val translations = listOf(Translation("es", "   "))
        assertThat(LanguageResolver.preferredTranslation(translations, prefs)).isNull()
    }

    @Test
    fun resolveUserTranslationLanguages_collectsSystemAndRegional() {
        assertThat(LanguageResolver.resolveUserTranslationLanguages("en", "fr"))
            .containsExactly("en", "fr").inOrder()
        assertThat(LanguageResolver.resolveUserTranslationLanguages(null, null))
            .containsExactly("fr")
    }

    // --- deviceLocale: 4th-priority Prisme extension (2026-05-26) ---

    @Test
    fun resolveUserLanguage_usesDeviceLocaleAsFourthPriority() {
        assertThat(LanguageResolver.resolveUserLanguage(Prefs(deviceLocale = "en_US")))
            .isEqualTo("en")
    }

    @Test
    fun resolveUserLanguage_normalizesDeviceLocale() {
        // A BCP-47 OS locale must collapse to the canonical translation-key code.
        assertThat(LanguageResolver.resolveUserLanguage(Prefs(deviceLocale = "pt-BR")))
            .isEqualTo("pt")
    }

    @Test
    fun resolveUserLanguage_inAppPreferencesBeatDeviceLocale() {
        val prefs = Prefs(systemLanguage = "es", deviceLocale = "en")
        assertThat(LanguageResolver.resolveUserLanguage(prefs)).isEqualTo("es")
    }

    @Test
    fun resolveUserLanguage_customDestinationStillBeatsDeviceLocale() {
        val prefs = Prefs(customDestinationLanguage = "it", deviceLocale = "en")
        assertThat(LanguageResolver.resolveUserLanguage(prefs)).isEqualTo("it")
    }

    @Test
    fun resolveUserLanguage_deviceLocaleBeatsFrenchFallback() {
        assertThat(LanguageResolver.resolveUserLanguage(Prefs(deviceLocale = "de")))
            .isEqualTo("de")
    }

    @Test
    fun resolveUserLanguage_fallsBackToFrenchWhenDeviceLocaleUnusable() {
        assertThat(LanguageResolver.resolveUserLanguage(Prefs(deviceLocale = "@@@")))
            .isEqualTo("fr")
    }

    @Test
    fun preferredContentLanguages_appendsDeviceLocaleLast() {
        val prefs = Prefs(systemLanguage = "en", deviceLocale = "es_ES")
        assertThat(LanguageResolver.preferredContentLanguages(prefs))
            .containsExactly("en", "es").inOrder()
    }

    @Test
    fun preferredContentLanguages_dedupesDeviceLocaleAgainstInAppCaseInsensitively() {
        val prefs = Prefs(systemLanguage = "EN", deviceLocale = "en_US")
        assertThat(LanguageResolver.preferredContentLanguages(prefs))
            .containsExactly("EN")
    }

    @Test
    fun preferredContentLanguages_omitsUnusableDeviceLocale() {
        val prefs = Prefs(systemLanguage = "en", deviceLocale = "   ")
        assertThat(LanguageResolver.preferredContentLanguages(prefs))
            .containsExactly("en")
    }

    @Test
    fun preferredContentLanguages_deviceLocaleAloneReplacesFrenchDefault() {
        assertThat(LanguageResolver.preferredContentLanguages(Prefs(deviceLocale = "de-DE")))
            .containsExactly("de")
    }

    @Test
    fun preferredTranslation_matchesThroughDeviceLocale() {
        val prefs = Prefs(deviceLocale = "es")
        val translations = listOf(Translation("de", "Hallo"), Translation("es", "Hola"))
        assertThat(LanguageResolver.preferredTranslation(translations, prefs)?.translatedContent)
            .isEqualTo("Hola")
    }

    @Test
    fun resolveUserLanguage_readsDeviceLocaleFromMeeshyUser() {
        val user = MeeshyUser(id = "u1", username = "jean", deviceLocale = "en-GB")
        assertThat(LanguageResolver.resolveUserLanguage(user)).isEqualTo("en")
    }
}
