package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

/**
 * Verifies [ApiRepostOf.displayContent] honours the Prisme Linguistique rules,
 * using the exact same resolution law as [ApiPost.displayContent] (single source
 * of truth — the embedded reposted post is prism-translated like any other post).
 */
class RepostPrismeTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun repost(
        content: String? = "Bonjour",
        translations: Map<String, ApiPostTranslationEntry>? = null,
    ) = ApiRepostOf(
        id = "r1",
        content = content,
        originalLanguage = "fr",
        translations = translations,
    )

    @Test
    fun displayContent_usesPreferredTranslation() {
        val r = repost(
            translations = mapOf(
                "en" to ApiPostTranslationEntry(text = "Hello"),
                "es" to ApiPostTranslationEntry(text = "Hola"),
            ),
        )
        assertThat(r.displayContent(Prefs(systemLanguage = "es"))).isEqualTo("Hola")
        assertThat(r.isTranslated(Prefs(systemLanguage = "es"))).isTrue()
    }

    @Test
    fun displayContent_matchesLanguageKeyCaseInsensitively() {
        val r = repost(translations = mapOf("EN" to ApiPostTranslationEntry(text = "Hello")))
        assertThat(r.displayContent(Prefs(systemLanguage = "en"))).isEqualTo("Hello")
        assertThat(r.isTranslated(Prefs(systemLanguage = "en"))).isTrue()
    }

    @Test
    fun displayContent_fallsBackToOriginalWhenNoMatch() {
        val r = repost(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello")))
        // Rule 1: no translation targets 'de' → show the original, never an arbitrary translation.
        assertThat(r.displayContent(Prefs(systemLanguage = "de"))).isEqualTo("Bonjour")
        assertThat(r.isTranslated(Prefs(systemLanguage = "de"))).isFalse()
    }

    @Test
    fun displayContent_ignoresBlankTranslations() {
        val r = repost(translations = mapOf("en" to ApiPostTranslationEntry(text = "   ")))
        assertThat(r.displayContent(Prefs(systemLanguage = "en"))).isEqualTo("Bonjour")
        assertThat(r.isTranslated(Prefs(systemLanguage = "en"))).isFalse()
    }

    @Test
    fun displayContent_emptyStringWhenContentNull() {
        assertThat(repost(content = null).displayContent(Prefs(systemLanguage = "en"))).isEqualTo("")
    }

    @Test
    fun displayContent_secondaryPreferredLanguageWins() {
        val r = repost(translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola")))
        val prefs = Prefs(systemLanguage = "de", regionalLanguage = "es")
        assertThat(r.displayContent(prefs)).isEqualTo("Hola")
    }
}
