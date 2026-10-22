package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

/** Verifies ApiPost.displayContent honours the Prisme Linguistique rules. */
class PostPrismeTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun post(
        content: String? = "Bonjour",
        translations: Map<String, ApiPostTranslationEntry>? = null,
    ) = ApiPost(
        id = "p1",
        content = content,
        originalLanguage = "fr",
        translations = translations,
    )

    @Test
    fun displayContent_usesPreferredTranslation() {
        val p = post(
            translations = mapOf(
                "en" to ApiPostTranslationEntry(text = "Hello"),
                "es" to ApiPostTranslationEntry(text = "Hola"),
            ),
        )
        assertThat(p.displayContent(Prefs(systemLanguage = "es"))).isEqualTo("Hola")
        assertThat(p.isTranslated(Prefs(systemLanguage = "es"))).isTrue()
    }

    @Test
    fun displayContent_matchesLanguageKeyCaseInsensitively() {
        val p = post(translations = mapOf("EN" to ApiPostTranslationEntry(text = "Hello")))
        assertThat(p.displayContent(Prefs(systemLanguage = "en"))).isEqualTo("Hello")
        assertThat(p.isTranslated(Prefs(systemLanguage = "en"))).isTrue()
    }

    @Test
    fun displayContent_fallsBackToOriginalWhenNoMatch() {
        val p = post(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        // Rule 1: no translation targets 'de' → show the original, never an arbitrary translation.
        assertThat(p.displayContent(Prefs(systemLanguage = "de"))).isEqualTo("Bonjour")
        assertThat(p.isTranslated(Prefs(systemLanguage = "de"))).isFalse()
    }

    @Test
    fun displayContent_ignoresBlankTranslations() {
        val p = post(translations = mapOf("en" to ApiPostTranslationEntry(text = "   ")))
        assertThat(p.displayContent(Prefs(systemLanguage = "en"))).isEqualTo("Bonjour")
        assertThat(p.isTranslated(Prefs(systemLanguage = "en"))).isFalse()
    }

    @Test
    fun displayContent_originalWhenNoTranslations() {
        assertThat(post().displayContent(Prefs(systemLanguage = "en"))).isEqualTo("Bonjour")
    }

    @Test
    fun displayContent_emptyStringWhenContentNull() {
        assertThat(post(content = null).displayContent(Prefs(systemLanguage = "en"))).isEqualTo("")
    }

    @Test
    fun displayContent_secondaryPreferredLanguageWins() {
        val p = post(translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola")))
        // system 'de' has no translation, regional 'es' does → resolve to Spanish.
        val prefs = Prefs(systemLanguage = "de", regionalLanguage = "es")
        assertThat(p.displayContent(prefs)).isEqualTo("Hola")
    }

    @Test
    fun displayContent_postWrittenInThePrimaryLanguageStaysOriginal() {
        val p = post(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        val prefs = Prefs(systemLanguage = "fr", regionalLanguage = "en")
        assertThat(p.displayContent(prefs)).isEqualTo("Bonjour")
        assertThat(p.isTranslated(prefs)).isFalse()
    }

    @Test
    fun displayContent_originalLanguageOnALaterRankStopsTheDescent() {
        // Témoin de rang : l'origine (fr) est au rang 2, la traduction (it) au rang 3.
        val p = post(translations = mapOf("it" to ApiPostTranslationEntry(text = "Ciao")))
        val prefs = Prefs(systemLanguage = "de", regionalLanguage = "fr", customDestinationLanguage = "it")
        assertThat(p.displayContent(prefs)).isEqualTo("Bonjour")
    }

    @Test
    fun displayContent_deviceLocaleRankServesItsTranslation() {
        val p = post(translations = mapOf("pt-BR" to ApiPostTranslationEntry(text = "Olá")))
        assertThat(p.displayContent(Prefs(systemLanguage = "de", deviceLocale = "pt_PT"))).isEqualTo("Olá")
    }

    @Test
    fun displayContent_noLanguageConfiguredKeepsTheOriginal() {
        val p = post(translations = mapOf("fr" to ApiPostTranslationEntry(text = "Salut")))
        assertThat(p.displayContent(Prefs())).isEqualTo("Bonjour")
        assertThat(p.isTranslated(Prefs())).isFalse()
    }
}
