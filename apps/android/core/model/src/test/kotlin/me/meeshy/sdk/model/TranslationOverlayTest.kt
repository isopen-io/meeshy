package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TranslationOverlayTest {

    private fun message(
        translations: List<ApiTextTranslation> = emptyList(),
        attachments: List<ApiMessageAttachment> = emptyList(),
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        content = "hello",
        originalLanguage = "en",
        translations = translations,
        attachments = attachments,
    )

    private fun text(language: String, content: String) = StoredTextTranslation("m1", language, content)

    private fun apply(
        message: ApiMessage,
        texts: List<StoredTextTranslation> = emptyList(),
        transcriptions: List<StoredTranscription> = emptyList(),
        audio: List<StoredAudioTranslation> = emptyList(),
        prism: List<String>? = null,
    ) = TranslationOverlay.apply(message, texts, transcriptions, audio, prism)

    @Test
    fun `a stored translation is overlaid on a message that carries none`() {
        val projected = apply(message(), texts = listOf(text("fr", "Bonjour")))

        assertThat(projected.translations.single().translatedContent).isEqualTo("Bonjour")
    }

    @Test
    fun `a stored translation wins over the payload one of the same language`() {
        val held = message(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Salut")))

        val projected = apply(held, texts = listOf(text("FR", "Bonjour")))

        assertThat(projected.translations.map { it.translatedContent }).containsExactly("Bonjour")
    }

    @Test
    fun `nothing to change returns the very same instance`() {
        val held = message(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")))

        assertThat(apply(held, texts = listOf(text("fr", "Bonjour")))).isSameInstanceAs(held)
        assertThat(apply(held)).isSameInstanceAs(held)
    }

    @Test
    fun `a language outside the prism is not projected, a second rank one is`() {
        val projected = apply(message(), texts = listOf(text("de", "Hallo"), text("en", "Hello")), prism = listOf("fr", "en"))

        assertThat(projected.translations.map { it.targetLanguage }).containsExactly("en")
    }

    @Test
    fun `a deleted tombstone is never resurrected`() {
        val tomb = message().copy(deletedAt = "2026-06-01T10:00:00Z")

        assertThat(apply(tomb, texts = listOf(text("fr", "Bonjour")))).isSameInstanceAs(tomb)
    }

    @Test
    fun `transcription and voice translation land on their own attachment only`() {
        val held = message(
            attachments = listOf(
                ApiMessageAttachment(id = "a1", mimeType = "audio/m4a"),
                ApiMessageAttachment(id = "a2", mimeType = "audio/m4a"),
            ),
        )

        val projected = apply(
            held,
            transcriptions = listOf(StoredTranscription("m1", "a2", "second note", "en")),
            audio = listOf(StoredAudioTranslation("m1", "a1", "fr", "https://cdn/fr.m4a", "bonjour")),
        )

        assertThat(projected.attachments[0].transcription).isNull()
        assertThat(projected.attachments[0].translations?.get("fr")?.url).isEqualTo("https://cdn/fr.m4a")
        assertThat(projected.attachments[1].transcription?.text).isEqualTo("second note")
        assertThat(projected.attachments[1].translations).isNull()
    }

    @Test
    fun `a blank transcription or a blank voice url is ignored`() {
        val held = message(attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "audio/m4a")))

        val projected = apply(
            held,
            transcriptions = listOf(StoredTranscription("m1", "a1", "  ")),
            audio = listOf(StoredAudioTranslation("m1", "a1", "fr", " ")),
        )

        assertThat(projected).isSameInstanceAs(held)
    }
}
