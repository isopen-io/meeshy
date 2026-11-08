package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import org.junit.Test

class FeedPostBuilderPrismRankTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun serve(originalLanguage: String, translations: Map<String, String>, prefs: Prefs): String =
        FeedPostBuilder.build(
            post = ApiPost(
                id = "p1",
                content = "original",
                originalLanguage = originalLanguage,
                translations = translations.mapValues { ApiPostTranslationEntry(text = it.value) },
            ),
            preferences = prefs,
            mediaBaseUrl = null,
        ).content

    @Test
    fun `la traduction du rang un gagne sur celle du rang trois`() {
        val served = serve("ar", mapOf("fr" to "bonjour", "es" to "hola"), Prefs("fr", "en", "es"))

        assertThat(served).isEqualTo("bonjour")
    }

    @Test
    fun `sans traduction du rang un la traduction du rang trois est servie`() {
        val served = serve("ar", mapOf("es" to "hola"), Prefs("fr", "en", "es"))

        assertThat(served).isEqualTo("hola")
    }

    @Test
    fun `la langue d'origine au rang deux bat la traduction du rang trois`() {
        val served = serve("en", mapOf("es" to "hola"), Prefs("fr", "en", "es"))

        assertThat(served).isEqualTo("original")
    }

    @Test
    fun `aucune traduction ne correspond - l'original est servi, jamais la premiere traduction`() {
        val served = serve("ar", mapOf("de" to "hallo"), Prefs("fr", "en", null))

        assertThat(served).isEqualTo("original")
    }
}
