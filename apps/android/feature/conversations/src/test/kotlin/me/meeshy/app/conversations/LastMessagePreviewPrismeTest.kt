package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationLastMessage
import org.junit.Test

/**
 * The row's own line, once the Prisme has been resolved upstream
 * ([me.meeshy.sdk.model.resolvedLastMessagePreview]).
 *
 * `resolvedContent` substitutes for [ApiConversationLastMessage.content] and for
 * nothing else — the sender prefix, the media-type labels and the kind-aware branches
 * keep the behaviour they had. The hard-press preview card
 * ([ConversationPreviewMessages]) already resolved the Prisme per message from the same
 * `currentUserPrefs`; the row behind it rendered the sender's language.
 */
class LastMessagePreviewPrismeTest {

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
        expired = "Message expiré",
        hidden = "Message masqué",
        viewOnce = "Vue unique",
    )

    private fun message(
        content: String = "Hello everyone",
        messageType: String = "text",
        senderId: String? = "other",
        senderName: String? = "Alice",
        isBlurred: Boolean = false,
        isViewOnce: Boolean = false,
    ) = ApiConversationLastMessage(
        id = "m1",
        content = content,
        senderId = senderId,
        senderName = senderName,
        messageType = messageType,
        originalLanguage = "en",
        isBlurred = isBlurred,
        isViewOnce = isViewOnce,
    )

    @Test
    fun `the resolved text replaces the original content`() {
        val preview = lastMessagePreview(
            message(),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            resolvedContent = "Bonjour à tous",
        )

        assertThat(preview).isEqualTo("Bonjour à tous")
    }

    @Test
    fun `the sender prefix still wraps the resolved text in a group row`() {
        val preview = lastMessagePreview(
            message(),
            currentUserId = "me",
            showSender = true,
            labels = labels,
            resolvedContent = "Bonjour à tous",
        )

        assertThat(preview).isEqualTo("Alice : Bonjour à tous")
    }

    @Test
    fun `omitting the resolved text keeps the original content`() {
        // The default is what every caller with no reader prism at hand relies on —
        // the widgets, and the preview card, which resolves per message on its own.
        val preview = lastMessagePreview(
            message(),
            currentUserId = "me",
            showSender = false,
            labels = labels,
        )

        assertThat(preview).isEqualTo("Hello everyone")
    }

    @Test
    fun `a media message with no caption keeps its type label`() {
        // The Prisme only ever applies to TEXT: the media branch is reached exactly
        // when there is no text, so there is nothing to translate there. A resolver
        // returning the empty raw preview must not blank the row.
        val preview = lastMessagePreview(
            message(content = "", messageType = "image"),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            resolvedContent = "",
        )

        assertThat(preview).isEqualTo("📷 Photo")
    }

    @Test
    fun `the summary line carries the resolved text on a standard message`() {
        val summary = messageSummaryLine(
            message = message(),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            nowMillis = 0L,
            resolvedContent = "Bonjour à tous",
        )

        assertThat(summary.kind).isEqualTo(MessageSummaryKind.STANDARD)
        assertThat(summary.text).isEqualTo("Bonjour à tous")
    }

    @Test
    fun `a hidden message keeps its kind label, never the resolved text`() {
        val summary = messageSummaryLine(
            message = message(isBlurred = true),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            nowMillis = 0L,
            resolvedContent = "Bonjour à tous",
        )

        assertThat(summary.kind).isEqualTo(MessageSummaryKind.HIDDEN)
        assertThat(summary.text).isEqualTo("Message masqué")
    }

    @Test
    fun `a view-once message keeps its kind label, never the resolved text`() {
        val summary = messageSummaryLine(
            message = message(isViewOnce = true),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            nowMillis = 0L,
            resolvedContent = "Bonjour à tous",
        )

        assertThat(summary.kind).isEqualTo(MessageSummaryKind.VIEW_ONCE)
        assertThat(summary.text).isEqualTo("Vue unique")
    }
}
