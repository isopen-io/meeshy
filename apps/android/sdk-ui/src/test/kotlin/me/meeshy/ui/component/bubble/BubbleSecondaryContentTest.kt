package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.BubbleSecondaryPanel
import org.junit.Test

private data class SecondaryPrefs(
    override val systemLanguage: String?,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences

class BubbleSecondaryContentTest {

    private val prefs = SecondaryPrefs(systemLanguage = "fr", regionalLanguage = "es", customDestinationLanguage = "de")

    private fun built(vararg translations: ApiTextTranslation) = BubbleContentBuilder.build(
        ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            content = "Hello",
            originalLanguage = "en",
            translations = translations.toList(),
        ),
        currentUserId = "me",
        preferences = prefs,
    )

    @Test
    fun `the bubble offers the texts of the translated languages of the footer, not the original`() {
        val content = built(
            ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"),
            ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"),
        )
        assertThat(content.secondaryTexts).containsExactly("fr", "Bonjour", "es", "Hola")
        assertThat(content.primaryLanguageCode).isEqualTo("fr")
    }

    @Test
    fun `no secondary content is offered when the bubble has no translation`() {
        assertThat(built().secondaryTexts).isEmpty()
        assertThat(built().openSecondaryCode).isNull()
    }

    @Test
    fun `the secondary panel exists only for an open language and carries its colour`() {
        val content = built(
            ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"),
            ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"),
        )
        val closed = BubbleSecondaryPanel.of(content.openSecondaryCode, "fr", content.secondaryTexts)
        val open = BubbleSecondaryPanel.of("es", "fr", content.secondaryTexts)
        assertThat(closed).isNull()
        assertThat(open?.text).isEqualTo("Hola")
        assertThat(open?.colorHex).isNotNull()
    }
}
