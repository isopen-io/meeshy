package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StoryTranslation
import org.junit.Test

class StoryLanguageExplorerTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private val item = StoryItem(
        id = "s1",
        content = "Bonjour",
        translations = listOf(
            StoryTranslation(language = "en", content = "Hello"),
            StoryTranslation(language = "es", content = "Hola"),
        ),
    )

    private fun explorer(prefs: Prefs, override: String? = null, translating: Set<String> = emptySet()): StoryLanguageExplorer {
        val resolved = StoryContentResolver.resolve(item, prefs, override)
        return StoryLanguageExplorerBuilder.build(item, prefs, resolved, override, translating)
    }

    @Test
    fun `the head card shows the text and language the slide is actually served in`() {
        val result = explorer(Prefs(systemLanguage = "fr", regionalLanguage = "es"))

        // Rang 2 : aucune traduction francaise, la descente sert « es » — texte et etiquette concordent.
        assertThat(result.current?.text).isEqualTo("Hola")
        assertThat(result.current?.code).isEqualTo("es")
        assertThat(result.rows.first { it.code == "es" }.isSelected).isTrue()
        assertThat(result.rows.count { it.isSelected }).isEqualTo(1)
    }

    @Test
    fun `when nothing matches the reader the original is served and no language row is selected`() {
        val result = explorer(Prefs(systemLanguage = "ja"))

        assertThat(result.current?.text).isEqualTo("Bonjour")
        assertThat(result.current?.code).isNull()
        assertThat(result.rows.none { it.isSelected }).isTrue()
        assertThat(result.originalSelected).isFalse()
    }

    @Test
    fun `the Original entry serves the source text whatever the reader prefers`() {
        val result = explorer(Prefs(systemLanguage = "en"), override = StoryLanguageOverride.ORIGINAL)

        assertThat(result.originalSelected).isTrue()
        assertThat(result.current?.text).isEqualTo("Bonjour")
        assertThat(result.current?.code).isNull()
        assertThat(result.rows.none { it.isSelected }).isTrue()
    }

    @Test
    fun `a row without translation offers translate and an in-flight one shows progress`() {
        val result = explorer(Prefs(systemLanguage = "en"), translating = setOf("de"))

        val german = result.rows.first { it.code == "de" }
        assertThat(german.hasContent).isFalse()
        assertThat(german.isTranslating).isTrue()
        assertThat(result.rows.first { it.code == "es" }.canRetranslate).isTrue()
    }

    @Test
    fun `a blank caption leaves no head card`() {
        val blank = item.copy(content = " ", translations = null)
        val prefs = Prefs(systemLanguage = "en")
        val result = StoryLanguageExplorerBuilder.build(blank, prefs, StoryContentResolver.resolve(blank, prefs), null, emptySet())

        assertThat(result.current).isNull()
    }

    @Test
    fun `the Original sentinel also restores each overlay to its own text`() {
        val overlay = StoryTextObject(id = "t", text = "Hello", translations = mapOf("fr" to "Bonjour"))

        assertThat(StoryTextObjectProjection.resolveText(overlay, listOf("fr"), StoryLanguageOverride.ORIGINAL))
            .isEqualTo("Hello")
        assertThat(StoryTextObjectProjection.resolveText(overlay, listOf("fr"))).isEqualTo("Bonjour")
    }

    @Test
    fun `the sentinel can never be mistaken for a language code`() {
        assertThat(StoryLanguageOverride.isOriginal("__meeshy.original__")).isTrue()
        assertThat(StoryLanguageOverride.isOriginal("en")).isFalse()
        assertThat(StoryLanguageOverride.isOriginal(null)).isFalse()
    }
}
