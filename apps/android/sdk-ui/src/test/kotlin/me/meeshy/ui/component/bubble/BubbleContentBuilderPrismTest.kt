package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

private data class PrismPrefs(
    override val systemLanguage: String? = null,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
    override val deviceLocale: String? = null,
) : LanguageResolver.ContentLanguagePreferences

private data class PrismRow(
    override val targetLanguage: String,
    override val translatedContent: String,
) : LanguageResolver.TranslationLike

class BubbleContentBuilderPrismTest {

    private fun strip(
        original: String,
        rows: List<PrismRow>,
        prefs: PrismPrefs,
        includeTranslatable: Boolean = false,
    ) = MessageLanguageStrip.build(
        originalLanguage = original,
        translations = rows,
        preferences = prefs,
        showingOriginal = false,
        includeTranslatable = includeTranslatable,
    )

    @Test
    fun `an original at rank 2 keeps the original chip active even with a translation at rank 3`() {
        val chips = strip(
            original = "en",
            rows = listOf(PrismRow("es", "Hola")),
            prefs = PrismPrefs(systemLanguage = "fr", regionalLanguage = "en", customDestinationLanguage = "es"),
        )
        assertThat(chips.single { it.isActive }.code).isEqualTo("en")
    }

    @Test
    fun `a translation at rank 2 is the active chip when rank 1 has none`() {
        val chips = strip(
            original = "en",
            rows = listOf(PrismRow("es", "Hola")),
            prefs = PrismPrefs(systemLanguage = "fr", regionalLanguage = "es"),
        )
        assertThat(chips.single { it.isActive }.code).isEqualTo("es")
    }

    @Test
    fun `the device locale at rank 4 serves its translation`() {
        val chips = strip(
            original = "en",
            rows = listOf(PrismRow("de", "Hallo")),
            prefs = PrismPrefs(deviceLocale = "de_DE"),
        )
        assertThat(chips.single { it.isActive }.code).isEqualTo("de")
    }

    @Test
    fun `without any configured language there is no strip and no french chip`() {
        val rows = listOf(PrismRow("fr", "Bonjour"))
        assertThat(strip("en", rows, PrismPrefs())).isEmpty()
        assertThat(strip("en", rows, PrismPrefs(), includeTranslatable = true)).isEmpty()
    }
}
