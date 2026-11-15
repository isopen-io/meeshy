package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

class RepostEmbedLanguagesTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun repost(
        original: String? = "fr",
        content: String? = "Bonjour",
        translations: Map<String, ApiPostTranslationEntry>? = mapOf(
            "en" to ApiPostTranslationEntry(text = "Hello"),
            "es" to ApiPostTranslationEntry(text = "Hola"),
            "de" to ApiPostTranslationEntry(text = "  "),
        ),
    ) = ApiRepostOf(id = "r1", content = content, originalLanguage = original, translations = translations)

    @Test
    fun `les langues offertes sont l original puis les traductions non vides`() {
        assertThat(RepostEmbedLanguages.available(repost())).containsExactly("fr", "en", "es").inOrder()
    }

    @Test
    fun `la langue deja lue n est pas repetee en drapeau`() {
        val flags = RepostEmbedLanguages.flags(repost(), displayed = "en", secondary = null)
        assertThat(flags.map { it.code }).containsExactly("fr", "es").inOrder()
        assertThat(flags.none { it.isActive }).isTrue()
    }

    @Test
    fun `la puce du panneau secondaire ouvert est marquee`() {
        val flags = RepostEmbedLanguages.flags(repost(), displayed = "fr", secondary = "ES")
        assertThat(flags.single { it.isActive }.code).isEqualTo("es")
    }

    @Test
    fun `une region ne duplique pas la langue`() {
        val r = repost(translations = mapOf("fr-CA" to ApiPostTranslationEntry(text = "Allo"), "en" to ApiPostTranslationEntry(text = "Hi")))
        assertThat(RepostEmbedLanguages.available(r)).containsExactly("fr", "en").inOrder()
    }

    @Test
    fun `sans contenu d origine la langue d origine n est pas offerte`() {
        assertThat(RepostEmbedLanguages.available(repost(content = ""))).containsExactly("en", "es").inOrder()
    }

    @Test
    fun `le texte secondaire vient de l original ou de la traduction et jamais d une langue vide`() {
        assertThat(RepostEmbedLanguages.textIn(repost(), "fr")).isEqualTo("Bonjour")
        assertThat(RepostEmbedLanguages.textIn(repost(), "es")).isEqualTo("Hola")
        assertThat(RepostEmbedLanguages.textIn(repost(), "de")).isNull()
        assertThat(RepostEmbedLanguages.textIn(repost(), "it")).isNull()
    }

    @Test
    fun `la langue servie suit le Prisme sur un rang autre que le premier`() {
        val r = repost(original = "fr")
        assertThat(r.servedLanguage(Prefs(systemLanguage = "pt", regionalLanguage = "es"))).isEqualTo("es")
        assertThat(r.servedLanguage(Prefs(systemLanguage = "fr"))).isEqualTo("fr")
        assertThat(r.servedLanguage(Prefs(systemLanguage = "ja"))).isEqualTo("fr")
    }
}
