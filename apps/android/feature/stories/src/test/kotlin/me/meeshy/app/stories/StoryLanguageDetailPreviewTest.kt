package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTranslation
import org.junit.Test

class StoryLanguageDetailPreviewTest {

    private data class Prefs(
        override val systemLanguage: String? = "fr",
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = "fr",
    ) : LanguageResolver.ContentLanguagePreferences

    private fun previewOf(text: String): String? {
        val item = StoryItem(id = "s1", content = "Bonjour", translations = listOf(StoryTranslation(language = "en", content = text)))
        val resolved = StoryContentResolver.resolve(item, Prefs(), null)
        return StoryLanguageExplorerBuilder.build(item, Prefs(), resolved, null, emptySet())
            .rows.first { it.code == "en" }.preview
    }

    @Test
    fun `a short translation is previewed whole`() {
        assertThat(previewOf("Hello")).isEqualTo("Hello")
    }

    @Test
    fun `a long translation is cut at fifty characters with an ellipsis`() {
        assertThat(previewOf("x".repeat(80))).isEqualTo("x".repeat(50) + "…")
    }

    @Test
    fun `a fifty characters translation gets no ellipsis`() {
        assertThat(previewOf("y".repeat(50))).isEqualTo("y".repeat(50))
    }
}
