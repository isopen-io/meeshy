package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostTranslationMergeTest {

    private fun post(
        id: String = "p1",
        content: String? = "Bonjour",
        originalLanguage: String? = "fr",
        translations: Map<String, ApiPostTranslationEntry>? = null,
    ) = ApiPost(
        id = id,
        content = content,
        originalLanguage = originalLanguage,
        translations = translations,
    )

    @Test
    fun `appends the translation to a post with no translations`() {
        val merged = PostTranslationMerge.mergeTranslation(post(translations = null), "es", "Hola")

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations).containsExactly("es", ApiPostTranslationEntry(text = "Hola"))
    }

    @Test
    fun `appends a new language alongside existing translations, preserving order`() {
        val merged = PostTranslationMerge.mergeTranslation(
            post(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello"))),
            "es",
            "Hola",
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.keys).containsExactly("en", "es").inOrder()
        assertThat(merged.translations!!["es"]!!.text).isEqualTo("Hola")
    }

    @Test
    fun `replaces an existing translation in place under its original key`() {
        val merged = PostTranslationMerge.mergeTranslation(
            post(translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola vieja"))),
            "es",
            "Hola nueva",
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!["es"]!!.text).isEqualTo("Hola nueva")
    }

    @Test
    fun `matches an existing key case-insensitively and keeps that key`() {
        val merged = PostTranslationMerge.mergeTranslation(
            post(translations = mapOf("ES" to ApiPostTranslationEntry(text = "Hola vieja"))),
            "es",
            "Hola nueva",
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.keys).containsExactly("ES")
        assertThat(merged.translations!!["ES"]!!.text).isEqualTo("Hola nueva")
    }

    @Test
    fun `is a no-op when the identical translation is already present`() {
        val merged = PostTranslationMerge.mergeTranslation(
            post(translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola"))),
            "es",
            "Hola",
        )

        assertThat(merged).isNull()
    }

    @Test
    fun `is a no-op for a blank target language`() {
        val merged = PostTranslationMerge.mergeTranslation(post(), "   ", "Hola")

        assertThat(merged).isNull()
    }

    @Test
    fun `is a no-op for a blank translated text`() {
        val merged = PostTranslationMerge.mergeTranslation(post(), "es", "   ")

        assertThat(merged).isNull()
    }

    @Test
    fun `trims the target language before storing a new entry`() {
        val merged = PostTranslationMerge.mergeTranslation(post(translations = null), "  es  ", "Hola")

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.keys).containsExactly("es")
    }
}
