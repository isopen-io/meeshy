package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTranslation
import org.junit.Test

class StoryContentResolverTest {

    private fun prefs(
        system: String? = null,
        regional: String? = null,
        custom: String? = null,
    ) = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage = system
        override val regionalLanguage = regional
        override val customDestinationLanguage = custom
    }

    private fun item(content: String?, translations: List<StoryTranslation>? = null) =
        StoryItem(id = "s1", content = content, translations = translations)

    @Test
    fun `returns the preferred-language translation when available`() {
        val resolved = StoryContentResolver.resolve(
            item("bonjour", listOf(StoryTranslation(language = "en", content = "hello"))),
            prefs(system = "en"),
        )
        assertThat(resolved.content).isEqualTo("hello")
        assertThat(resolved.isTranslated).isTrue()
    }

    @Test
    fun `falls back to the original when no translation matches (Prisme rule 1)`() {
        val resolved = StoryContentResolver.resolve(
            item("bonjour", listOf(StoryTranslation(language = "es", content = "hola"))),
            prefs(system = "de"),
        )
        assertThat(resolved.content).isEqualTo("bonjour")
        assertThat(resolved.isTranslated).isFalse()
    }

    @Test
    fun `original is shown when there are no translations`() {
        val resolved = StoryContentResolver.resolve(item("bonjour"), prefs(system = "en"))
        assertThat(resolved.content).isEqualTo("bonjour")
        assertThat(resolved.isTranslated).isFalse()
    }

    @Test
    fun `regional language is honoured when system has no match`() {
        val resolved = StoryContentResolver.resolve(
            item("bonjour", listOf(StoryTranslation(language = "es", content = "hola"))),
            prefs(system = "de", regional = "es"),
        )
        assertThat(resolved.content).isEqualTo("hola")
        assertThat(resolved.isTranslated).isTrue()
    }

    @Test
    fun `without override the Prisme picks the preferred translation`() {
        val resolved = StoryContentResolver.resolve(
            item("original english", listOf(
                StoryTranslation(language = "fr", content = "texte francais"),
                StoryTranslation(language = "es", content = "texto espanol"),
            )),
            prefs(system = "fr"),
        )
        assertThat(resolved.content).isEqualTo("texte francais")
        assertThat(resolved.isTranslated).isTrue()
        assertThat(resolved.languageCode).isEqualTo("fr")
    }

    @Test
    fun `an override wins over the preferred chain`() {
        val resolved = StoryContentResolver.resolve(
            item("original english", listOf(
                StoryTranslation(language = "fr", content = "texte francais"),
                StoryTranslation(language = "es", content = "texto espanol"),
            )),
            prefs(system = "fr"),
            overrideLanguage = "es",
        )
        assertThat(resolved.content).isEqualTo("texto espanol")
        assertThat(resolved.languageCode).isEqualTo("es")
    }

    @Test
    fun `the override match is case-insensitive`() {
        val resolved = StoryContentResolver.resolve(
            item("original english", listOf(
                StoryTranslation(language = "fr", content = "texte francais"),
                StoryTranslation(language = "es", content = "texto espanol"),
            )),
            prefs(system = "fr"),
            overrideLanguage = "ES",
        )
        assertThat(resolved.content).isEqualTo("texto espanol")
    }

    @Test
    fun `an override without a matching translation falls back to the preferred chain`() {
        val resolved = StoryContentResolver.resolve(
            item("original english", listOf(
                StoryTranslation(language = "fr", content = "texte francais"),
                StoryTranslation(language = "es", content = "texto espanol"),
            )),
            prefs(system = "fr"),
            overrideLanguage = "de",
        )
        assertThat(resolved.content).isEqualTo("texte francais")
    }

    @Test
    fun `no matching translation at all shows the original, never an arbitrary one`() {
        val resolved = StoryContentResolver.resolve(
            item("original english", listOf(
                StoryTranslation(language = "it", content = "testo"),
            )),
            prefs(system = "fr"),
        )
        assertThat(resolved.content).isEqualTo("original english")
        assertThat(resolved.isTranslated).isFalse()
        assertThat(resolved.languageCode).isNull()
    }
}
