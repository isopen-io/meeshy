package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.preview.ConversationPreviewSticker
import org.junit.Test

/** Un sticker part en `image` avec `metadata.sticker` : la ligne dit « Sticker », comme iOS `ConversationPreviewBody.of`. */
class LastMessagePreviewStickerTest {

    private val labels = LastMessagePreviewLabels(
        photo = "📷 Photo",
        video = "🎬 Vidéo",
        voice = "🎵 Message vocal",
        file = "📎 Fichier",
        location = "📍 Localisation",
        none = "Aucun message",
        you = "Vous",
        senderFormat = "%1\$s : %2\$s",
        draftPrefix = "Brouillon :",
        sticker = "Sticker",
    )

    private fun sticker(alt: String? = null, messageType: String = "image") = ApiConversationLastMessage(
        id = "m1",
        content = "",
        senderId = "other",
        senderName = "Alice",
        messageType = messageType,
        attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "image/png", alt = alt)),
        sticker = ConversationPreviewSticker(emoji = "🥳"),
    )

    @Test
    fun `a sticker sent as an image says Sticker, never Photo`() {
        assertThat(lastMessagePreview(sticker(), currentUserId = "me", showSender = false, labels = labels))
            .isEqualTo("Sticker")
    }

    @Test
    fun `a sticker keeps the sender prefix in a group`() {
        assertThat(lastMessagePreview(sticker(), currentUserId = "me", showSender = true, labels = labels))
            .isEqualTo("Alice : Sticker")
    }

    @Test
    fun `a text sticker says its alternative text`() {
        assertThat(lastMessagePreview(sticker(alt = "  Bonne nuit  "), currentUserId = "me", showSender = false, labels = labels))
            .isEqualTo("Bonne nuit")
    }

    @Test
    fun `a sticker message type without metadata still says Sticker`() {
        val message = sticker(messageType = "sticker").copy(sticker = null)
        assertThat(lastMessagePreview(message, currentUserId = "me", showSender = false, labels = labels))
            .isEqualTo("Sticker")
    }

    @Test
    fun `a plain photo still says Photo`() {
        val message = sticker().copy(sticker = null)
        assertThat(lastMessagePreview(message, currentUserId = "me", showSender = false, labels = labels))
            .isEqualTo("📷 Photo")
    }

    @Test
    fun `a locale without the sticker word falls back to the photo label rather than a blank row`() {
        assertThat(lastMessagePreview(sticker(), currentUserId = "me", showSender = false, labels = labels.copy(sticker = "")))
            .isEqualTo("📷 Photo")
    }
}
