package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostTranslationEntry
import org.junit.Test

private data class PostStripPrefs(
    override val systemLanguage: String?,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences

class PostLanguageStripTest {

    private val french = PostStripPrefs(systemLanguage = "fr")
    private val english = PostStripPrefs(systemLanguage = "en")

    private fun entries(vararg pairs: Pair<String, String>): Map<String, ApiPostTranslationEntry> =
        pairs.associate { (code, text) -> code to ApiPostTranslationEntry(text = text) }

    @Test
    fun `no strip when the post has no translation map`() {
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = null,
            preferences = french,
        )

        assertThat(chips).isEmpty()
    }

    @Test
    fun `no strip when the translation map is empty`() {
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = emptyMap(),
            preferences = french,
        )

        assertThat(chips).isEmpty()
    }

    @Test
    fun `no strip when translations exist but none targets a preferred language`() {
        // Prisme rule 1: original content is shown, so nothing to explore → no strip.
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = entries("es" to "Hola"),
            preferences = french,
        )

        assertThat(chips).isEmpty()
    }

    @Test
    fun `no strip when the preferred translation entry is blank`() {
        // A blank entry is treated as no-content — the post reads as untranslated.
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = entries("fr" to "   "),
            preferences = french,
        )

        assertThat(chips).isEmpty()
    }

    @Test
    fun `strip anchors the original and marks the preferred translation active`() {
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = entries("fr" to "Bonjour"),
            preferences = french,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr").inOrder()
        val original = chips.first { it.code == "en" }
        val translated = chips.first { it.code == "fr" }
        assertThat(original.isOriginal).isTrue()
        assertThat(original.isActive).isFalse()
        assertThat(translated.isOriginal).isFalse()
        assertThat(translated.isActive).isTrue()
    }

    @Test
    fun `matching is case-insensitive on the map key`() {
        val chips = PostLanguageStrip.build(
            originalLanguage = "EN",
            translations = entries("FR" to "Bonjour"),
            preferences = french,
        )

        // Codes are normalized to lowercase and the FR entry still resolves as preferred.
        assertThat(chips.map { it.code }).containsExactly("en", "fr").inOrder()
        assertThat(chips.first { it.code == "fr" }.isActive).isTrue()
    }

    @Test
    fun `showingOriginal marks the original chip active instead of the translation`() {
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = entries("fr" to "Bonjour"),
            preferences = french,
            showingOriginal = true,
        )

        assertThat(chips.first { it.code == "en" }.isActive).isTrue()
        assertThat(chips.first { it.code == "fr" }.isActive).isFalse()
    }

    @Test
    fun `activeCodeOverride wins and highlights the switched language`() {
        val prefs = PostStripPrefs(systemLanguage = "fr", regionalLanguage = "es")
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = entries("fr" to "Bonjour", "es" to "Hola"),
            preferences = prefs,
            activeCodeOverride = "es",
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr", "es").inOrder()
        assertThat(chips.first { it.code == "es" }.isActive).isTrue()
        assertThat(chips.first { it.code == "fr" }.isActive).isFalse()
    }

    @Test
    fun `read-only strip omits configured languages that have no content`() {
        val prefs = PostStripPrefs(systemLanguage = "fr", regionalLanguage = "de")
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = entries("fr" to "Bonjour"),
            preferences = prefs,
        )

        // de is configured but absent — the discrete strip does not dump it.
        assertThat(chips.map { it.code }).containsExactly("en", "fr").inOrder()
    }

    @Test
    fun `includeTranslatable appends a configured language missing content as translatable`() {
        val prefs = PostStripPrefs(systemLanguage = "fr", regionalLanguage = "de")
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = entries("fr" to "Bonjour"),
            preferences = prefs,
            includeTranslatable = true,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr", "de").inOrder()
        val translatable = chips.first { it.code == "de" }
        assertThat(translatable.isTranslatable).isTrue()
        assertThat(translatable.isActive).isFalse()
        assertThat(translatable.isOriginal).isFalse()
    }

    @Test
    fun `no original chip is anchored when the post has no original language`() {
        val chips = PostLanguageStrip.build(
            originalLanguage = null,
            translations = entries("fr" to "Bonjour"),
            preferences = french,
        )

        assertThat(chips.map { it.code }).containsExactly("fr")
        assertThat(chips.single().isActive).isTrue()
        assertThat(chips.single().isOriginal).isFalse()
    }

    @Test
    fun `chip carries language metadata when the code is known`() {
        val chips = PostLanguageStrip.build(
            originalLanguage = "en",
            translations = entries("fr" to "Bonjour"),
            preferences = english.copy(regionalLanguage = "fr"),
        )

        val french = chips.first { it.code == "fr" }
        assertThat(french.info).isNotNull()
    }
}
