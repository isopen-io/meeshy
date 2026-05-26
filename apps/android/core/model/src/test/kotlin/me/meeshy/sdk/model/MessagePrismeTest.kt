package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

/** Verifies APIMessage.displayContent honours the Prisme Linguistique rules. */
class MessagePrismeTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun message(vararg translations: ApiTextTranslation) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        content = "Bonjour",
        originalLanguage = "fr",
        translations = translations.toList(),
    )

    @Test
    fun displayContent_usesPreferredTranslation() {
        val msg = message(
            ApiTextTranslation(targetLanguage = "en", translatedContent = "Hello"),
            ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"),
        )
        assertThat(msg.displayContent(Prefs(systemLanguage = "es"))).isEqualTo("Hola")
        assertThat(msg.isTranslated(Prefs(systemLanguage = "es"))).isTrue()
    }

    @Test
    fun displayContent_fallsBackToOriginalWhenNoMatch() {
        val msg = message(ApiTextTranslation(targetLanguage = "en", translatedContent = "Hello"))
        // No translation targets 'de' → show the original, never an arbitrary translation.
        assertThat(msg.displayContent(Prefs(systemLanguage = "de"))).isEqualTo("Bonjour")
        assertThat(msg.isTranslated(Prefs(systemLanguage = "de"))).isFalse()
    }

    @Test
    fun displayContent_originalWhenNoTranslations() {
        assertThat(message().displayContent(Prefs(systemLanguage = "en"))).isEqualTo("Bonjour")
    }
}
