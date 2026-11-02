package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import org.junit.Test

class PostLanguageExplorerTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun post(
        original: String? = "es",
        translations: Map<String, ApiPostTranslationEntry>? = mapOf(
            "en" to ApiPostTranslationEntry(text = "Hello", confidenceScore = 0.87),
            "de" to ApiPostTranslationEntry(text = "Hallo"),
        ),
    ) = ApiPost(id = "p1", content = "Hola", originalLanguage = original, translations = translations)

    private fun explorer(post: ApiPost, prefs: Prefs, override: String? = null) =
        PostLanguageExplorerBuilder.build(post, prefs, FeedPostBuilder.resolveActiveCode(post, prefs, override))

    @Test
    fun `a post without any translation has no explorer`() {
        assertThat(explorer(post(translations = null), Prefs(systemLanguage = "fr"))).isNull()
        assertThat(explorer(post(translations = emptyMap()), Prefs(systemLanguage = "fr"))).isNull()
    }

    @Test
    fun `the original row carries the source text and the translations are listed by code`() {
        val result = explorer(post(), Prefs(systemLanguage = "en"))!!

        assertThat(result.originalCode).isEqualTo("es")
        assertThat(result.originalText).isEqualTo("Hola")
        assertThat(result.translations.map { it.code }).containsExactly("de", "en").inOrder()
        assertThat(result.translations.first { it.code == "en" }.confidencePercent).isEqualTo(87)
        assertThat(result.translations.first { it.code == "de" }.confidencePercent).isNull()
    }

    @Test
    fun `a blank translation is not a translation`() {
        val result = explorer(
            post(translations = mapOf("en" to ApiPostTranslationEntry(text = "  "), "de" to ApiPostTranslationEntry(text = "Hallo"))),
            Prefs(systemLanguage = "de"),
        )!!

        assertThat(result.translations.map { it.code }).containsExactly("de")
    }

    @Test
    fun `the row marked active is the language the card actually displays, at the second rank`() {
        // Le lecteur lit ["fr", "en"] : aucune traduction francaise, donc la descente sert "en"
        // (rang 2) — un temoin sur le rang 1 ne verrait pas un court-circuit « original d'abord ».
        val prefs = Prefs(systemLanguage = "fr", regionalLanguage = "en")
        val p = post()
        val displayed = FeedPostBuilder.build(p, prefs, mediaBaseUrl = null)

        val result = explorer(p, prefs)!!

        assertThat(displayed.content).isEqualTo("Hello")
        assertThat(result.translations.filter { it.isActive }.map { it.code }).containsExactly("en")
        assertThat(result.translations.first { it.isActive }.text).isEqualTo(displayed.content)
        assertThat(result.originalIsActive).isFalse()
    }

    @Test
    fun `when no translation matches the reader the original is the active row and never the first translation`() {
        val prefs = Prefs(systemLanguage = "ja")

        val result = explorer(post(), prefs)!!

        assertThat(result.originalIsActive).isTrue()
        assertThat(result.translations.none { it.isActive }).isTrue()
    }

    @Test
    fun `an original language that sits at the readers first rank stays active over a lower-rank translation`() {
        val result = explorer(post(original = "es"), Prefs(systemLanguage = "es", regionalLanguage = "en"))!!

        assertThat(result.originalIsActive).isTrue()
        assertThat(result.translations.none { it.isActive }).isTrue()
    }

    @Test
    fun `an explicit pick of the original wins over the default resolution`() {
        val prefs = Prefs(systemLanguage = "en")

        val result = explorer(post(), prefs, override = "es")!!

        assertThat(result.originalIsActive).isTrue()
    }

    @Test
    fun `the missing languages are the readers prism minus the original and the existing translations`() {
        val prefs = Prefs(systemLanguage = "fr", regionalLanguage = "en", customDestinationLanguage = "es", deviceLocale = "pt-BR")

        val result = explorer(post(), prefs)!!

        assertThat(result.missing).containsExactly("fr", "pt").inOrder()
    }

    @Test
    fun `no preference means nothing to request`() {
        assertThat(explorer(post(), Prefs())!!.missing).isEmpty()
    }

    @Test
    fun `the presentation carries the same explorer as the builder`() {
        val prefs = Prefs(systemLanguage = "fr")
        val p = post()

        assertThat(FeedPostBuilder.build(p, prefs, mediaBaseUrl = null).languageExplorer).isEqualTo(explorer(p, prefs))
    }
}
