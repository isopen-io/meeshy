package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StoryTranslation
import org.junit.Test

class StoryReaderPrismLawsTest {

    private fun prefs(
        system: String? = null,
        regional: String? = null,
        device: String? = null,
    ) = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage = system
        override val regionalLanguage = regional
        override val customDestinationLanguage: String? = null
        override val deviceLocale = device
    }

    @Test
    fun `no preference configured gives an empty prism, never fr`() {
        val languages = StoryContentResolver.readerLanguages(prefs(), Locale.ROOT)
        assertThat(languages).isEmpty()
    }

    @Test
    fun `an anonymous reader is read in the device language and fr-FR is one language`() {
        assertThat(StoryContentResolver.readerLanguages(prefs(), Locale.CANADA_FRENCH)).containsExactly("fr")
        assertThat(StoryContentResolver.readerLanguages(prefs(system = "fr", device = "fr-FR"), Locale.ROOT))
            .containsExactly("fr")
    }

    @Test
    fun `the rank two translation is served when rank one is missing`() {
        val item = StoryItem(
            id = "s",
            content = "Hallo",
            originalLanguage = "de",
            translations = listOf(StoryTranslation("es", "Hola"), StoryTranslation("en", "Hello")),
        )
        val resolved = StoryContentResolver.resolve(item, prefs(system = "fr", regional = "en"))
        assertThat(resolved.content).isEqualTo("Hello")
        assertThat(resolved.languageCode).isEqualTo("en")
    }

    @Test
    fun `content derived from the text objects is not rendered as a caption`() {
        val item = StoryItem(
            id = "s",
            content = "Bonjour le monde",
            originalLanguage = "fr",
            translations = listOf(StoryTranslation("en", "Hello world")),
            storyEffects = StoryEffects(
                textObjects = listOf(
                    StoryTextObject(id = "a", text = "Bonjour"),
                    StoryTextObject(id = "b", text = "le monde"),
                ),
            ),
        )
        assertThat(StoryContentResolver.resolve(item, prefs(system = "en")).content).isEmpty()
        assertThat(StoryContentResolver.resolve(item.copy(content = "Ma légende", translations = null), prefs()).content)
            .isEqualTo("Ma légende")
    }
}
