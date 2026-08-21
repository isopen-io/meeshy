package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTranslationMergeTest {

    private fun story(
        id: String = "s1",
        content: String? = "Bonjour",
        translations: List<StoryTranslation>? = null,
    ) = StoryItem(id = id, content = content, translations = translations)

    @Test
    fun `appends the translation to a story with no translations`() {
        val merged = StoryTranslationMerge.mergeTranslation(story(translations = null), "es", "Hola")

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations)
            .containsExactly(StoryTranslation(language = "es", content = "Hola"))
    }

    @Test
    fun `appends a new language alongside existing translations, preserving order`() {
        val merged = StoryTranslationMerge.mergeTranslation(
            story(translations = listOf(StoryTranslation(language = "en", content = "Hello"))),
            "es",
            "Hola",
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.map { it.language }).containsExactly("en", "es").inOrder()
        assertThat(merged.translations!!.first { it.language == "es" }.content).isEqualTo("Hola")
    }

    @Test
    fun `replaces an existing translation in place, preserving position and casing of the key`() {
        val merged = StoryTranslationMerge.mergeTranslation(
            story(
                translations = listOf(
                    StoryTranslation(language = "ES", content = "Hola vieja"),
                    StoryTranslation(language = "en", content = "Hello"),
                ),
            ),
            "es",
            "Hola nueva",
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.map { it.language }).containsExactly("ES", "en").inOrder()
        assertThat(merged.translations!!.first { it.language == "ES" }.content).isEqualTo("Hola nueva")
    }

    @Test
    fun `is a no-op for a blank target language`() {
        val merged = StoryTranslationMerge.mergeTranslation(story(), "   ", "Hola")

        assertThat(merged).isNull()
    }

    @Test
    fun `is a no-op for a blank translated text`() {
        val merged = StoryTranslationMerge.mergeTranslation(story(), "es", "   ")

        assertThat(merged).isNull()
    }

    @Test
    fun `trims the target language before appending`() {
        val merged = StoryTranslationMerge.mergeTranslation(story(translations = null), "  es  ", "Hola")

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.single().language).isEqualTo("es")
    }

    @Test
    fun `is idempotent when the same translation already matches`() {
        val merged = StoryTranslationMerge.mergeTranslation(
            story(translations = listOf(StoryTranslation(language = "es", content = "Hola"))),
            "es",
            "Hola",
        )

        assertThat(merged).isNull()
    }

    @Test
    fun `replaces when the language matches case-insensitively but the text differs`() {
        val merged = StoryTranslationMerge.mergeTranslation(
            story(translations = listOf(StoryTranslation(language = "es", content = "Hola"))),
            "ES",
            "Buenas",
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.single().language).isEqualTo("es")
        assertThat(merged.translations!!.single().content).isEqualTo("Buenas")
    }
}
