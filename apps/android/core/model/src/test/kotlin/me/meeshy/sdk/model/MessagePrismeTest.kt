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
        override val deviceLocale: String? = null,
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

    @Test
    fun displayContent_messageWrittenInThePrimaryLanguageStaysOriginal() {
        // Prisme [fr, en], message écrit en fr avec une traduction en : on sert l'original.
        val msg = message(ApiTextTranslation(targetLanguage = "en", translatedContent = "Hello"))
        val prefs = Prefs(systemLanguage = "fr", regionalLanguage = "en")
        assertThat(msg.displayContent(prefs)).isEqualTo("Bonjour")
        assertThat(msg.isTranslated(prefs)).isFalse()
    }

    @Test
    fun displayContent_messageWrittenInALowerRankLanguageIsServedInThePrimaryOne() {
        // Message écrit en en, traduction fr : la langue primaire du lecteur gagne.
        val msg = ApiMessage(
            id = "m2",
            conversationId = "c1",
            content = "Hello",
            originalLanguage = "en",
            translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")),
        )
        val prefs = Prefs(systemLanguage = "fr", regionalLanguage = "en")
        assertThat(msg.displayContent(prefs)).isEqualTo("Bonjour")
        assertThat(msg.isTranslated(prefs)).isTrue()
    }

    @Test
    fun displayContent_deviceLocaleRankDoesNotDemoteThePrimaryTranslation() {
        // La locale appareil (en, rang 4) place la langue d'origine sous la primaire :
        // elle ne doit jamais faire servir l'original à la place de la traduction fr.
        val msg = ApiMessage(
            id = "m3",
            conversationId = "c1",
            content = "Hello",
            originalLanguage = "en-US",
            translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")),
        )
        val prefs = Prefs(systemLanguage = "fr", deviceLocale = "en_US")
        assertThat(msg.displayContent(prefs)).isEqualTo("Bonjour")
    }

    @Test
    fun displayContent_noLanguageConfiguredKeepsTheOriginal() {
        val msg = message(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Salut"))
        // Aucun repli « fr » : la lecture est stricte.
        assertThat(msg.displayContent(Prefs())).isEqualTo("Bonjour")
        assertThat(msg.isTranslated(Prefs())).isFalse()
    }

    @Test
    fun displayContent_regionTaggedTranslationKeyMatchesTheReaderLanguage() {
        val msg = message(ApiTextTranslation(targetLanguage = "pt-BR", translatedContent = "Olá"))
        assertThat(msg.displayContent(Prefs(systemLanguage = "pt"))).isEqualTo("Olá")
    }
}
