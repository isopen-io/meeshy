package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTextLanguageAvailabilityTest {

    private fun text(
        body: String = "Bonjour",
        source: String? = null,
        translations: Map<String, String>? = null,
    ) = StoryTextObject(id = "t", text = body, sourceLanguage = source, translations = translations)

    private fun effects(vararg texts: StoryTextObject) = StoryEffects(textObjects = texts.toList())

    @Test
    fun `fr-FR, FR and fr collapse into a single entry`() {
        val languages = StoryTextLanguageAvailability.availableLanguages(
            effects = effects(text(source = "fr-FR", translations = mapOf("FR" to "x", "fr" to "y"))),
            postTranslations = null,
        )
        assertThat(languages).containsExactly("fr")
    }

    @Test
    fun `canvas and caption languages are unioned and sorted`() {
        val languages = StoryTextLanguageAvailability.availableLanguages(
            effects = effects(text(source = "fr", translations = mapOf("es" to "Hola"))),
            postTranslations = listOf(StoryTranslation(language = "en-US", content = "Hello")),
        )
        assertThat(languages).containsExactly("en", "es", "fr").inOrder()
    }

    @Test
    fun `an empty text object and blank codes offer no language`() {
        val languages = StoryTextLanguageAvailability.availableLanguages(
            effects = effects(text(body = "  ", source = "fr", translations = mapOf("en" to "Hi")), text(source = " ")),
            postTranslations = listOf(StoryTranslation(language = "", content = "x")),
        )
        assertThat(languages).isEmpty()
    }

    @Test
    fun `translatable text exists on the canvas or in the caption`() {
        assertThat(StoryTextLanguageAvailability.hasTranslatableText(effects(text()), null)).isTrue()
        assertThat(StoryTextLanguageAvailability.hasTranslatableText(null, "Salut")).isTrue()
        assertThat(StoryTextLanguageAvailability.hasTranslatableText(effects(text(body = " ")), " ")).isFalse()
    }
}
