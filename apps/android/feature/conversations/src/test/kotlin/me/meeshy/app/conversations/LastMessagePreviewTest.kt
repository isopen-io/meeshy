package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ConversationDraft
import org.junit.Test

class LastMessagePreviewTest {

    private val labels = LastMessagePreviewLabels(
        photo = "📷 Photo",
        video = "🎬 Vidéo",
        voice = "🎵 Message vocal",
        file = "📎 Fichier",
        location = "📍 Localisation",
        none = "Aucun message",
        you = "Vous",
        senderFormat = "%1\$s : %2\$s",
        draftPrefix = "Brouillon : ",
    )

    private fun message(
        content: String = "",
        messageType: String = "text",
        senderId: String? = "other",
        senderName: String? = "Alice",
    ) = ApiConversationLastMessage(
        id = "m1",
        content = content,
        senderId = senderId,
        senderName = senderName,
        messageType = messageType,
    )

    @Test
    fun `no last message falls back to the empty label`() {
        assertThat(lastMessagePreview(null, currentUserId = "me", showSender = false, labels = labels))
            .isEqualTo("Aucun message")
    }

    @Test
    fun `text content is shown as-is in a direct conversation`() {
        val preview = lastMessagePreview(
            message(content = "Salut !"),
            currentUserId = "me",
            showSender = false,
            labels = labels,
        )

        assertThat(preview).isEqualTo("Salut !")
    }

    @Test
    fun `group conversations prefix the sender name`() {
        val preview = lastMessagePreview(
            message(content = "Salut !"),
            currentUserId = "me",
            showSender = true,
            labels = labels,
        )

        assertThat(preview).isEqualTo("Alice : Salut !")
    }

    @Test
    fun `my own message is prefixed with the you label`() {
        val preview = lastMessagePreview(
            message(content = "Salut !", senderId = "me"),
            currentUserId = "me",
            showSender = true,
            labels = labels,
        )

        assertThat(preview).isEqualTo("Vous : Salut !")
    }

    @Test
    fun `sender prefix follows the locale format`() {
        val preview = lastMessagePreview(
            message(content = "Hi!"),
            currentUserId = "me",
            showSender = true,
            labels = labels.copy(senderFormat = "%1\$s: %2\$s"),
        )

        assertThat(preview).isEqualTo("Alice: Hi!")
    }

    @Test
    fun `empty content with a media type uses the type label`() {
        fun preview(type: String) = lastMessagePreview(
            message(messageType = type),
            currentUserId = "me",
            showSender = false,
            labels = labels,
        )

        assertThat(preview("image")).isEqualTo("📷 Photo")
        assertThat(preview("video")).isEqualTo("🎬 Vidéo")
        assertThat(preview("audio")).isEqualTo("🎵 Message vocal")
        assertThat(preview("file")).isEqualTo("📎 Fichier")
        assertThat(preview("location")).isEqualTo("📍 Localisation")
    }

    @Test
    fun `a media message with a caption shows the caption`() {
        val preview = lastMessagePreview(
            message(content = "Regarde ça", messageType = "image"),
            currentUserId = "me",
            showSender = false,
            labels = labels,
        )

        assertThat(preview).isEqualTo("Regarde ça")
    }

    @Test
    fun `blank text without type falls back to the empty label`() {
        val preview = lastMessagePreview(
            message(content = "  "),
            currentUserId = "me",
            showSender = false,
            labels = labels,
        )

        assertThat(preview).isEqualTo("Aucun message")
    }

    // ---- draftPreview ----

    @Test
    fun `no draft yields no draft preview`() {
        assertThat(draftPreview(null, labels)).isNull()
    }

    @Test
    fun `an empty inert draft yields no draft preview`() {
        val draft = ConversationDraft(conversationId = "c1", text = "   ", replyToId = null)

        assertThat(draftPreview(draft, labels)).isNull()
    }

    @Test
    fun `a text draft is previewed with the draft prefix and trimmed text`() {
        val draft = ConversationDraft(conversationId = "c1", text = "  à finir  ")

        assertThat(draftPreview(draft, labels)).isEqualTo("Brouillon : à finir")
    }

    @Test
    fun `a reply-only draft is previewed as the prefix with an ellipsis`() {
        val draft = ConversationDraft(conversationId = "c1", text = "", replyToId = "m9")

        assertThat(draftPreview(draft, labels)).isEqualTo("Brouillon : …")
    }
}
