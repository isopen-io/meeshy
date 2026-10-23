package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

/**
 * Règle 3 du Prisme : la langue d'origine concourt à SON rang. Un texte écrit en français
 * se lit en français pour un prisme `[fr, en]`, même si une traduction anglaise existe —
 * miroir de `StoryTextObject.resolvedText` (iOS), qui délègue à `PrismTranslationResolver`.
 * Témoin écrit sur un rang AUTRE que le premier, comme l'exige la leçon 261.
 */
class StoryTextObjectPrismRankTest {

    private fun text(source: String?, translations: Map<String, String>) =
        StoryTextObject(id = "t1", text = "Bonjour", sourceLanguage = source, translations = translations)

    @Test
    fun `a text already written in the reader's first language is served as written`() {
        val resolved = StoryTextObjectProjection.resolveText(text("fr", mapOf("en" to "Hello")), listOf("fr", "en"))

        assertThat(resolved).isEqualTo("Bonjour")
    }

    @Test
    fun `a higher-ranked translation still wins over the original`() {
        val resolved = StoryTextObjectProjection.resolveText(
            text("en", mapOf("fr" to "Salut")).copy(text = "Hi"),
            listOf("fr", "en"),
        )

        assertThat(resolved).isEqualTo("Salut")
    }

    @Test
    fun `an empty translation is skipped rather than shown blank`() {
        val resolved = StoryTextObjectProjection.resolveText(
            text("de", mapOf("fr" to "  ", "en" to "Hello")),
            listOf("fr", "en"),
        )

        assertThat(resolved).isEqualTo("Hello")
    }

    @Test
    fun `exploring the source language shows the original`() {
        val resolved = StoryTextObjectProjection.resolveText(
            text("fr", mapOf("en" to "Hello")),
            listOf("en"),
            overrideLanguage = "fr",
        )

        assertThat(resolved).isEqualTo("Bonjour")
    }
}
