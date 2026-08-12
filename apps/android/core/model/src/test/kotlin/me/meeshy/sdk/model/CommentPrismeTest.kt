package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

/**
 * Verifies [ApiPostComment.displayContent] honours the Prisme Linguistique rules,
 * using the exact same resolution law as [ApiPost.displayContent] (single source
 * of truth — a comment is prism-translated like any other content).
 */
class CommentPrismeTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun comment(
        content: String = "Bonjour",
        translations: Map<String, ApiPostTranslationEntry>? = null,
    ) = ApiPostComment(
        id = "c1",
        content = content,
        originalLanguage = "fr",
        translations = translations,
    )

    @Test
    fun displayContent_usesPreferredTranslation() {
        val c = comment(
            translations = mapOf(
                "en" to ApiPostTranslationEntry(text = "Hello"),
                "es" to ApiPostTranslationEntry(text = "Hola"),
            ),
        )
        assertThat(c.displayContent(Prefs(systemLanguage = "es"))).isEqualTo("Hola")
        assertThat(c.isTranslated(Prefs(systemLanguage = "es"))).isTrue()
    }

    @Test
    fun displayContent_matchesLanguageKeyCaseInsensitively() {
        val c = comment(translations = mapOf("EN" to ApiPostTranslationEntry(text = "Hello")))
        assertThat(c.displayContent(Prefs(systemLanguage = "en"))).isEqualTo("Hello")
        assertThat(c.isTranslated(Prefs(systemLanguage = "en"))).isTrue()
    }

    @Test
    fun displayContent_fallsBackToOriginalWhenNoMatch() {
        val c = comment(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        // Rule 1: no translation targets 'de' → show the original, never an arbitrary translation.
        assertThat(c.displayContent(Prefs(systemLanguage = "de"))).isEqualTo("Bonjour")
        assertThat(c.isTranslated(Prefs(systemLanguage = "de"))).isFalse()
    }

    @Test
    fun displayContent_ignoresBlankTranslations() {
        val c = comment(translations = mapOf("en" to ApiPostTranslationEntry(text = "   ")))
        assertThat(c.displayContent(Prefs(systemLanguage = "en"))).isEqualTo("Bonjour")
        assertThat(c.isTranslated(Prefs(systemLanguage = "en"))).isFalse()
    }

    @Test
    fun displayContent_emptyStringWhenContentBlank() {
        assertThat(comment(content = "").displayContent(Prefs(systemLanguage = "en"))).isEqualTo("")
    }

    @Test
    fun displayContent_secondaryPreferredLanguageWins() {
        val c = comment(translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola")))
        val prefs = Prefs(systemLanguage = "de", regionalLanguage = "es")
        assertThat(c.displayContent(prefs)).isEqualTo("Hola")
    }
}
