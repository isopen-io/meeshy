package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MessageEffectFlags
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Test

private data class ReaderPrefs(
    override val systemLanguage: String?,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences

private val photo = ApiMessageAttachment(
    id = "p1",
    mimeType = "image/jpeg",
    fileUrl = "https://cdn.example/full.jpg",
    thumbnailUrl = "https://cdn.example/thumb.jpg",
)

private fun replyingTo(quoted: ApiMessageReplyPreview, prefs: ReaderPrefs = ReaderPrefs("fr")) =
    BubbleContentBuilder.build(
        ApiMessage(id = "m1", conversationId = "c1", senderId = "me", content = "ok", replyTo = quoted),
        currentUserId = "me",
        preferences = prefs,
    )

private fun json(raw: String): JsonObject = Json.parseToJsonElement(raw).jsonObject

private const val MISSED_CALL =
    """{"kind":"call","callId":"c-1","initiatorId":"ama","callType":"audio","outcome":"missed","durationSeconds":0,"bytesTotal":null,"bytesEstimated":false,"networkQuality":null}"""

class BubbleQuotedReplyTest {

    @Test
    fun `a quoted missed call speaks the reader language and his point of view, never the french fallback`() {
        val content = replyingTo(
            ApiMessageReplyPreview(id = "q", content = "Appel manqué", notice = json(MISSED_CALL)),
            ReaderPrefs("en"),
        )

        assertThat(content.replyToText).isEqualTo("Missed call")
    }

    @Test
    fun `a quoted notice served by an older gateway keeps its content`() {
        val content = replyingTo(ApiMessageReplyPreview(id = "q", content = "Appel manqué"), ReaderPrefs("en"))

        assertThat(content.replyToText).isEqualTo("Appel manqué")
    }

    @Test
    fun `a quotable notice bubble carries its quote in the reader language, an ordinary message none`() {
        val notice = BubbleContentBuilder.build(
            ApiMessage(
                id = "n1", conversationId = "c1", senderId = "ama", content = "Appel manqué",
                messageSource = "system", messageType = "system", metadata = json(MISSED_CALL),
            ),
            currentUserId = "me",
            preferences = ReaderPrefs("de"),
        )
        val ordinary = replyingTo(ApiMessageReplyPreview(id = "q", content = "hi"))

        assertThat(notice.quotedNoticeText).isEqualTo("Verpasster Anruf")
        assertThat(ordinary.quotedNoticeText).isNull()
    }

    @Test
    fun `a quoted view-once photo shows only the protection placeholder and no thumbnail`() {
        val content = replyingTo(
            ApiMessageReplyPreview(id = "q", content = "secret", isViewOnce = true, attachments = listOf(photo)),
        )

        assertThat(content.replyToText).isEqualTo("👁️ 🖼️")
        assertThat(content.replyToThumbnailUrl).isNull()
        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.None)
    }

    @Test
    fun `a quoted blurred text declared only by the effect bitfield is masked`() {
        val content = replyingTo(
            ApiMessageReplyPreview(id = "q", content = "secret", effectFlags = MessageEffectFlags.BLURRED),
        )

        assertThat(content.replyToText).isEqualTo("🌫️ 💬")
    }

    @Test
    fun `a quoted encrypted voice note says it is locked audio`() {
        val content = replyingTo(
            ApiMessageReplyPreview(
                id = "q",
                content = "cipher",
                isEncrypted = true,
                attachments = listOf(ApiMessageAttachment(id = "a", mimeType = "audio/m4a")),
            ),
        )

        assertThat(content.replyToText).isEqualTo("🔒 🎵")
    }

    @Test
    fun `a quoted ephemeral message stays readable in the thread`() {
        val content = replyingTo(
            ApiMessageReplyPreview(id = "q", content = "bientôt parti", expiresAt = "2099-01-01T00:00:00Z"),
        )

        assertThat(content.replyToText).isEqualTo("bientôt parti")
    }

    @Test
    fun `the quoted text is served in the reader language by the prism`() {
        val content = replyingTo(
            ApiMessageReplyPreview(
                id = "q",
                content = "Hello",
                originalLanguage = "en",
                translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")),
            ),
        )

        assertThat(content.replyToText).isEqualTo("Bonjour")
    }

    @Test
    fun `a lower rank translation is served when the primary language has none`() {
        val content = replyingTo(
            ApiMessageReplyPreview(
                id = "q",
                content = "Hola",
                originalLanguage = "es",
                translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "Hello")),
            ),
            prefs = ReaderPrefs(systemLanguage = "fr", regionalLanguage = "en"),
        )

        assertThat(content.replyToText).isEqualTo("Hello")
    }

    @Test
    fun `an encrypted translation is never served as the quoted text`() {
        val content = replyingTo(
            ApiMessageReplyPreview(
                id = "q",
                content = "Hello",
                originalLanguage = "en",
                translations = listOf(
                    ApiTextTranslation(targetLanguage = "fr", translatedContent = "x9f3==", isEncrypted = true),
                ),
            ),
        )

        assertThat(content.replyToText).isEqualTo("Hello")
    }

    @Test
    fun `a quoted message in the reader language stays original even with a foreign translation`() {
        val content = replyingTo(
            ApiMessageReplyPreview(
                id = "q",
                content = "Salut",
                originalLanguage = "fr",
                translations = listOf(ApiTextTranslation(targetLanguage = "en", translatedContent = "Hi")),
            ),
        )

        assertThat(content.replyToText).isEqualTo("Salut")
    }

    @Test
    fun `the quoted author falls back to the sender display name then username`() {
        val withDisplay = replyingTo(
            ApiMessageReplyPreview(id = "q", content = "x", sender = ApiMessageSender(displayName = "Zoé", username = "zoe")),
        )
        val withUsername = replyingTo(
            ApiMessageReplyPreview(id = "q", content = "x", sender = ApiMessageSender(username = "zoe")),
        )

        assertThat(withDisplay.replyToSenderName).isEqualTo("Zoé")
        assertThat(withUsername.replyToSenderName).isEqualTo("zoe")
    }

    @Test
    fun `an unprotected quoted photo keeps its thumbnail`() {
        val content = replyingTo(ApiMessageReplyPreview(id = "q", content = "", attachments = listOf(photo)))

        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.Image)
        assertThat(content.replyToThumbnailUrl).isEqualTo("https://cdn.example/thumb.jpg")
    }
}
