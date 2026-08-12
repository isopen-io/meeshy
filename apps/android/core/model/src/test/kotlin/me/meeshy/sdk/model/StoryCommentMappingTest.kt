package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

class StoryCommentMappingTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun comment(
        id: String = "c1",
        content: String = "bonjour",
        translations: Map<String, ApiPostTranslationEntry>? = null,
        author: ApiAuthor? = ApiAuthor(id = "u1", username = "alice", displayName = "Alice"),
        createdAt: String? = "2026-06-20T10:00:00Z",
    ) = ApiPostComment(
        id = id,
        content = content,
        translations = translations,
        author = author,
        createdAt = createdAt,
    )

    @Test
    fun translationMatchingPreferredLanguage_isApplied() {
        val mapped = comment(
            content = "bonjour",
            translations = mapOf("en" to ApiPostTranslationEntry(text = "hello")),
        ).toStoryComment(Prefs(systemLanguage = "en"))

        assertThat(mapped.content).isEqualTo("hello")
        assertThat(mapped.isTranslated).isTrue()
    }

    @Test
    fun noTranslationForPreferredLanguage_keepsOriginal() {
        val mapped = comment(
            content = "bonjour",
            translations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
        ).toStoryComment(Prefs(systemLanguage = "en"))

        // Prisme rule 1: never fall back to an arbitrary translation.
        assertThat(mapped.content).isEqualTo("bonjour")
        assertThat(mapped.isTranslated).isFalse()
    }

    @Test
    fun blankTranslationForPreferredLanguage_keepsOriginal() {
        val mapped = comment(
            content = "bonjour",
            translations = mapOf("en" to ApiPostTranslationEntry(text = "   ")),
        ).toStoryComment(Prefs(systemLanguage = "en"))

        assertThat(mapped.content).isEqualTo("bonjour")
        assertThat(mapped.isTranslated).isFalse()
    }

    @Test
    fun authorDisplayName_preferredOverUsername() {
        val mapped = comment(author = ApiAuthor(id = "u1", username = "alice", displayName = "Alice"))
            .toStoryComment(Prefs())

        assertThat(mapped.authorName).isEqualTo("Alice")
    }

    @Test
    fun blankDisplayName_fallsBackToUsername() {
        val mapped = comment(author = ApiAuthor(id = "u1", username = "alice", displayName = "  "))
            .toStoryComment(Prefs())

        assertThat(mapped.authorName).isEqualTo("alice")
    }

    @Test
    fun nullAuthor_yieldsEmptyName() {
        val mapped = comment(author = null).toStoryComment(Prefs())

        assertThat(mapped.authorName).isEqualTo("")
    }

    @Test
    fun blankAvatar_collapsesToNull() {
        val mapped = comment(author = ApiAuthor(id = "u1", username = "alice", avatar = "   "))
            .toStoryComment(Prefs())

        assertThat(mapped.avatarUrl).isNull()
    }

    @Test
    fun mappedComment_isAlwaysSent_andNotOptimistic() {
        val mapped = comment().toStoryComment(Prefs())

        assertThat(mapped.status).isEqualTo(StoryCommentStatus.Sent)
        assertThat(mapped.clientId).isNull()
        assertThat(mapped.id).isEqualTo("c1")
        assertThat(mapped.createdAt).isEqualTo("2026-06-20T10:00:00Z")
    }
}
