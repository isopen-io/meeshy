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

    // --- Comment overload: same upsert law, comment-typed result. ---

    private fun comment(
        id: String = "c1",
        content: String = "Bonjour",
        originalLanguage: String? = "fr",
        translations: Map<String, ApiPostTranslationEntry>? = null,
    ) = ApiPostComment(
        id = id,
        content = content,
        originalLanguage = originalLanguage,
        translations = translations,
    )

    @Test
    fun `appends the translation to a comment with no translations`() {
        val merged = PostTranslationMerge.mergeTranslation(comment(translations = null), "es", "Hola")

        assertThat(merged).isNotNull()
        assertThat(merged!!.id).isEqualTo("c1")
        assertThat(merged.translations).containsExactly("es", ApiPostTranslationEntry(text = "Hola"))
    }

    @Test
    fun `replaces an existing comment translation in place, matched case-insensitively`() {
        val merged = PostTranslationMerge.mergeTranslation(
            comment(translations = mapOf("ES" to ApiPostTranslationEntry(text = "Hola vieja"))),
            "es",
            "Hola nueva",
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.keys).containsExactly("ES")
        assertThat(merged.translations!!["ES"]!!.text).isEqualTo("Hola nueva")
    }

    @Test
    fun `is a no-op when the identical comment translation is already present`() {
        val merged = PostTranslationMerge.mergeTranslation(
            comment(translations = mapOf("es" to ApiPostTranslationEntry(text = "Hola"))),
            "es",
            "Hola",
        )

        assertThat(merged).isNull()
    }

    @Test
    fun `is a no-op for a blank target language on a comment`() {
        assertThat(PostTranslationMerge.mergeTranslation(comment(), "   ", "Hola")).isNull()
    }

    @Test
    fun `is a no-op for a blank translated text on a comment`() {
        assertThat(PostTranslationMerge.mergeTranslation(comment(), "es", "   ")).isNull()
    }

    // --- Entry overload: the push-side merge that PRESERVES model/confidence/createdAt
    //     (the realtime `post:translation-updated` payload carries a full entry, not a
    //     bare string — the text-only overload above would drop that metadata). ---

    private fun entry(
        text: String = "Hola",
        model: String? = "nllb",
        confidence: Double? = 0.97,
        createdAt: String? = "2026-08-24T00:00:00Z",
    ) = ApiPostTranslationEntry(
        text = text,
        translationModel = model,
        confidenceScore = confidence,
        createdAt = createdAt,
    )

    @Test
    fun `appends a pushed entry preserving its model, confidence and timestamp`() {
        val merged = PostTranslationMerge.mergeTranslation(post(translations = null), "es", entry())

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations).containsExactly("es", entry())
    }

    @Test
    fun `appends a pushed entry alongside existing translations, preserving order`() {
        val merged = PostTranslationMerge.mergeTranslation(
            post(translations = mapOf("en" to ApiPostTranslationEntry(text = "Hello"))),
            "es",
            entry(),
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.keys).containsExactly("en", "es").inOrder()
        assertThat(merged.translations!!["es"]).isEqualTo(entry())
    }

    @Test
    fun `replaces an existing entry in place under its case-insensitively matched key`() {
        val merged = PostTranslationMerge.mergeTranslation(
            post(translations = mapOf("ES" to entry(text = "Hola vieja", confidence = 0.5))),
            "es",
            entry(text = "Hola nueva", confidence = 0.99),
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.keys).containsExactly("ES")
        assertThat(merged.translations!!["ES"]).isEqualTo(entry(text = "Hola nueva", confidence = 0.99))
    }

    @Test
    fun `is a no-op when the identical entry is already present`() {
        val merged = PostTranslationMerge.mergeTranslation(
            post(translations = mapOf("es" to entry())),
            "es",
            entry(),
        )

        assertThat(merged).isNull()
    }

    @Test
    fun `stores a metadata-only change so richer server data is never dropped`() {
        val merged = PostTranslationMerge.mergeTranslation(
            post(translations = mapOf("es" to entry(model = "nllb", confidence = 0.5))),
            "es",
            entry(model = "m2m100", confidence = 0.9),
        )

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!["es"]!!.translationModel).isEqualTo("m2m100")
        assertThat(merged.translations!!["es"]!!.confidenceScore).isEqualTo(0.9)
    }

    @Test
    fun `is a no-op for a blank target language on the entry overload`() {
        assertThat(PostTranslationMerge.mergeTranslation(post(), "   ", entry())).isNull()
    }

    @Test
    fun `is a no-op for a pushed entry whose text is blank`() {
        assertThat(PostTranslationMerge.mergeTranslation(post(), "es", entry(text = "   "))).isNull()
    }

    @Test
    fun `trims the target language before storing a pushed entry`() {
        val merged = PostTranslationMerge.mergeTranslation(post(translations = null), "  es  ", entry())

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations!!.keys).containsExactly("es")
    }
}
