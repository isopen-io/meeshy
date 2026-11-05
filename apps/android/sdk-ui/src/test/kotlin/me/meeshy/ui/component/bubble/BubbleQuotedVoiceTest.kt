package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

private data class QuotedVoicePrefs(
    override val systemLanguage: String?,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences

private fun voiceNote(
    id: String = "v1",
    fileUrl: String? = "https://cdn.example/v1.m4a",
    translations: Map<String, ApiAttachmentTranslation>? = null,
    isViewOnce: Boolean? = false,
    isBlurred: Boolean? = false,
) = ApiMessageAttachment(
    id = id,
    mimeType = "audio/mp4",
    fileUrl = fileUrl,
    transcription = ApiAttachmentTranscription(transcribedText = "La reunión se mueve", language = "es"),
    translations = translations,
    isViewOnce = isViewOnce,
    isBlurred = isBlurred,
)

private fun replyingToVoice(quoted: ApiMessageReplyPreview, prefs: QuotedVoicePrefs = QuotedVoicePrefs("fr")) =
    BubbleContentBuilder.build(
        ApiMessage(id = "m1", conversationId = "c1", senderId = "me", content = "ok", replyTo = quoted),
        currentUserId = "me",
        preferences = prefs,
    )

/** Toucher la citation d'un vocal le joue (iOS `ConversationViewModel+QuotedAudio`) : la citation porte sa piste servie, jamais celle d'un protégé. */
class BubbleQuotedVoiceTest {

    @Test
    fun `un vocal cite ordinaire porte sa piste servie par le prisme`() {
        val french = mapOf("fr" to ApiAttachmentTranslation(transcription = "La réunion se déplace", url = "https://cdn.example/v1-fr.m4a"))
        val content = replyingToVoice(ApiMessageReplyPreview(id = "q", content = "", attachments = listOf(voiceNote(translations = french))))

        assertThat(content.replyToAudio?.attachmentId).isEqualTo("v1")
        assertThat(content.replyToAudio?.url).isEqualTo("https://cdn.example/v1-fr.m4a")
        assertThat(content.replyToAudio?.audioLanguage).isEqualTo("fr")
    }

    @Test
    fun `au rang 2 la citation joue la piste anglaise`() {
        val english = mapOf("en" to ApiAttachmentTranslation(transcription = "The meeting moves", url = "https://cdn.example/v1-en.m4a"))
        val content = replyingToVoice(
            ApiMessageReplyPreview(id = "q", content = "", attachments = listOf(voiceNote(translations = english))),
            prefs = QuotedVoicePrefs(systemLanguage = "de", regionalLanguage = "en"),
        )

        assertThat(content.replyToAudio?.audioLanguage).isEqualTo("en")
        assertThat(content.replyToAudio?.url).isEqualTo("https://cdn.example/v1-en.m4a")
    }

    @Test
    fun `un vocal cite protege ne porte rien`() {
        val sealed = replyingToVoice(ApiMessageReplyPreview(id = "q", content = "", isViewOnce = true, attachments = listOf(voiceNote())))
        val blurred = replyingToVoice(ApiMessageReplyPreview(id = "q", content = "", effectFlags = MessageEffectFlags.BLURRED, attachments = listOf(voiceNote())))
        val encrypted = replyingToVoice(ApiMessageReplyPreview(id = "q", content = "", isEncrypted = true, attachments = listOf(voiceNote())))

        assertThat(sealed.replyToAudio).isNull()
        assertThat(blurred.replyToAudio).isNull()
        assertThat(encrypted.replyToAudio).isNull()
    }

    @Test
    fun `un vocal dont la piece est a vue unique ne porte rien`() {
        val content = replyingToVoice(ApiMessageReplyPreview(id = "q", content = "", attachments = listOf(voiceNote(isViewOnce = true))))

        assertThat(content.replyToAudio).isNull()
    }

    @Test
    fun `un vocal cite dont la piece ne declare pas sa protection ne porte rien`() {
        val silent = voiceNote(isViewOnce = null, isBlurred = null)
        val content = replyingToVoice(ApiMessageReplyPreview(id = "q", content = "", attachments = listOf(silent)))

        assertThat(content.replyToAudio).isNull()
    }

    @Test
    fun `un vocal cite ephemere ne porte rien`() {
        val content = replyingToVoice(
            ApiMessageReplyPreview(id = "q", content = "", expiresAt = "2026-11-05T08:00:00Z", attachments = listOf(voiceNote())),
        )

        assertThat(content.replyToAudio).isNull()
    }

    @Test
    fun `un vocal cite supprime ne porte rien`() {
        val content = replyingToVoice(
            ApiMessageReplyPreview(id = "q", content = "", deletedAt = "2026-11-04T08:00:00Z", attachments = listOf(voiceNote())),
        )

        assertThat(content.replyToAudio).isNull()
    }

    @Test
    fun `un vocal cite sans adresse ne porte rien`() {
        val content = replyingToVoice(ApiMessageReplyPreview(id = "q", content = "", attachments = listOf(voiceNote(fileUrl = null))))

        assertThat(content.replyToAudio).isNull()
    }

    @Test
    fun `la citation d'une photo ne porte pas de vocal`() {
        val photo = ApiMessageAttachment(id = "p1", mimeType = "image/jpeg", fileUrl = "https://cdn.example/p.jpg")

        assertThat(replyingToVoice(ApiMessageReplyPreview(id = "q", content = "", attachments = listOf(photo))).replyToAudio).isNull()
    }
}
