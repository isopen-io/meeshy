package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LanguageResolverTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
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
}
