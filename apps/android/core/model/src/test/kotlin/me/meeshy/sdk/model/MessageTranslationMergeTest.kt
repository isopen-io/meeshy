package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageTranslationMergeTest {

    private fun message(
        id: String = "m1",
        content: String = "Hello",
        originalLanguage: String? = "en",
        deletedAt: String? = null,
        translations: List<ApiTextTranslation> = emptyList(),
    ) = ApiMessage(
        id = id,
        conversationId = "c1",
        content = content,
        originalLanguage = originalLanguage,
        deletedAt = deletedAt,
        translations = translations,
    )

    private fun translation(target: String, content: String) =
        ApiTextTranslation(targetLanguage = target, translatedContent = content)

    @Test
    fun `appends the translation to an empty list`() {
        val merged = MessageTranslationMerge.mergeTranslation(message(), "fr", "Bonjour")

        assertThat(merged).isNotNull()
        assertThat(merged!!.translations).hasSize(1)
        assertThat(merged.translations.single().targetLanguage).isEqualTo("fr")
        assertThat(merged.translations.single().translatedContent).isEqualTo("Bonjour")
    }

    @Test
    fun `stamps the appended translation with the message id and source language`() {
        val merged = MessageTranslationMerge.mergeTranslation(
            message(id = "abc", originalLanguage = "en"),
            "fr",
            "Bonjour",
        )!!

        val entry = merged.translations.single()
        assertThat(entry.messageId).isEqualTo("abc")
        assertThat(entry.sourceLanguage).isEqualTo("en")
    }

    @Test
    fun `a null original language yields a blank source language`() {
        val merged = MessageTranslationMerge.mergeTranslation(
            message(originalLanguage = null),
            "fr",
            "Bonjour",
        )!!

        assertThat(merged.translations.single().sourceLanguage).isEqualTo("")
    }

    @Test
    fun `appends a new language while keeping existing translations`() {
        val merged = MessageTranslationMerge.mergeTranslation(
            message(translations = listOf(translation("es", "Hola"))),
            "fr",
            "Bonjour",
        )!!

        assertThat(merged.translations.map { it.targetLanguage }).containsExactly("es", "fr").inOrder()
        assertThat(merged.translations.map { it.translatedContent }).containsExactly("Hola", "Bonjour").inOrder()
    }

    @Test
    fun `replaces an existing translation for the same language in place`() {
        val merged = MessageTranslationMerge.mergeTranslation(
            message(
                translations = listOf(
                    translation("es", "Hola"),
                    translation("fr", "Salut"),
                    translation("de", "Hallo"),
                ),
            ),
            "fr",
            "Bonjour",
        )!!

        assertThat(merged.translations.map { it.targetLanguage }).containsExactly("es", "fr", "de").inOrder()
        assertThat(merged.translations[1].translatedContent).isEqualTo("Bonjour")
        assertThat(merged.translations[0].translatedContent).isEqualTo("Hola")
        assertThat(merged.translations[2].translatedContent).isEqualTo("Hallo")
    }

    @Test
    fun `matches an existing language case-insensitively when replacing`() {
        val merged = MessageTranslationMerge.mergeTranslation(
            message(translations = listOf(translation("FR", "Salut"))),
            "fr",
            "Bonjour",
        )!!

        assertThat(merged.translations).hasSize(1)
        assertThat(merged.translations.single().translatedContent).isEqualTo("Bonjour")
    }

    @Test
    fun `an identical translation already present is a no-op`() {
        val original = message(translations = listOf(translation("fr", "Bonjour")))

        assertThat(MessageTranslationMerge.mergeTranslation(original, "fr", "Bonjour")).isNull()
    }

    @Test
    fun `an identical translation matched case-insensitively is a no-op`() {
        val original = message(translations = listOf(translation("fr", "Bonjour")))

        assertThat(MessageTranslationMerge.mergeTranslation(original, "FR", "Bonjour")).isNull()
    }

    @Test
    fun `a blank target language is a no-op`() {
        assertThat(MessageTranslationMerge.mergeTranslation(message(), "", "Bonjour")).isNull()
    }

    @Test
    fun `a whitespace-only target language is a no-op`() {
        assertThat(MessageTranslationMerge.mergeTranslation(message(), "   ", "Bonjour")).isNull()
    }

    @Test
    fun `a blank translated content is a no-op`() {
        assertThat(MessageTranslationMerge.mergeTranslation(message(), "fr", "")).isNull()
    }

    @Test
    fun `a whitespace-only translated content is a no-op`() {
        assertThat(MessageTranslationMerge.mergeTranslation(message(), "fr", "   ")).isNull()
    }

    @Test
    fun `a deleted tombstone is never given a translation`() {
        val deleted = message(deletedAt = "2026-07-10T10:00:00Z", translations = emptyList())

        assertThat(MessageTranslationMerge.mergeTranslation(deleted, "fr", "Bonjour")).isNull()
    }

    @Test
    fun `the target language is trimmed before upsert`() {
        val merged = MessageTranslationMerge.mergeTranslation(message(), "  fr  ", "Bonjour")!!

        assertThat(merged.translations.single().targetLanguage).isEqualTo("fr")
    }

    @Test
    fun `unrelated message fields are preserved`() {
        val merged = MessageTranslationMerge.mergeTranslation(
            message(id = "keep", content = "Hello"),
            "fr",
            "Bonjour",
        )!!

        assertThat(merged.id).isEqualTo("keep")
        assertThat(merged.content).isEqualTo("Hello")
    }
}
