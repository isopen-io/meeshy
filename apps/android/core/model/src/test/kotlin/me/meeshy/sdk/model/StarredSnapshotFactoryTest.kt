package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaKindLabel
import me.meeshy.sdk.model.media.MediaKindStrings
import org.junit.Test

class StarredSnapshotFactoryTest {

    private val strings = object : MediaKindStrings {
        override fun name(kind: MediaKindLabel.Kind) = kind.name.lowercase()
        override fun summary(kind: MediaKindLabel.Kind) = "S-" + kind.name
        override val voiceMessage = "voice"
        override fun voiceRecording(formattedDuration: String) = "voice $formattedDuration"
    }

    private fun message(
        content: String = "Hello",
        original: String? = "en",
        translations: List<ApiTextTranslation> = emptyList(),
        attachments: List<ApiMessageAttachment> = emptyList(),
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        content = content,
        originalLanguage = original,
        translations = translations,
        attachments = attachments,
        createdAt = "2026-10-01T10:00:00.000Z",
        sender = ApiMessageSender(id = "u1", username = "amy"),
    )

    private fun tr(lang: String, text: String) =
        ApiTextTranslation(targetLanguage = lang, translatedContent = text)

    private fun snapshot(m: ApiMessage, prism: List<String> = listOf("fr")) =
        StarredSnapshotFactory.snapshot(
            message = m,
            conversationName = "Team",
            conversationAccentColor = "AABBCC",
            preferredLanguages = prism,
            mediaStrings = strings,
            nowMillis = 42L,
        )

    @Test
    fun `preview is the preferred Prism translation when one exists`() {
        val s = snapshot(message(translations = listOf(tr("fr", "Bonjour"))))

        assertThat(s.contentPreview).isEqualTo("Bonjour")
    }

    @Test
    fun `preview descends to a lower rank and never to an unrequested language`() {
        val m = message(translations = listOf(tr("es", "Hola"), tr("de", "Hallo")))

        assertThat(snapshot(m, listOf("fr", "de")).contentPreview).isEqualTo("Hallo")
        assertThat(snapshot(m, listOf("fr")).contentPreview).isEqualTo("Hello")
    }

    @Test
    fun `media only message falls back to the media label and kind`() {
        val att = ApiMessageAttachment(id = "a1", mimeType = "video/mp4")
        val s = snapshot(message(content = "  ", attachments = listOf(att)))

        assertThat(s.contentPreview).isEqualTo("S-VIDEO")
        assertThat(s.attachmentKind).isEqualTo(StarredAttachmentKind.VIDEO)
    }

    @Test
    fun `preview is capped at 280 characters`() {
        val s = snapshot(message(content = "x".repeat(500)))

        assertThat(s.contentPreview).hasLength(280)
    }

    @Test
    fun `snapshot carries identity timestamps and conversation context`() {
        val s = snapshot(message())

        assertThat(s.messageId).isEqualTo("m1")
        assertThat(s.conversationName).isEqualTo("Team")
        assertThat(s.conversationAccentColor).isEqualTo("AABBCC")
        assertThat(s.starredAtMillis).isEqualTo(42L)
        assertThat(s.sentAtIso).isEqualTo("2026-10-01T10:00:00.000Z")
        assertThat(s.senderName).isEqualTo("amy")
    }
}
