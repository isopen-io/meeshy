package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationLastMessage
import org.junit.Test

/**
 * `messageSummaryLine` composes what a conversation row shows once typing/draft have
 * been ruled out: the classified kind, its localized label, and — for HIDDEN and
 * VIEW_ONCE — the same sender prefix as [lastMessagePreview]. EXPIRED drops the sender
 * (parity with iOS `ThemedConversationRow` `.expired` arm, which renders the label alone).
 *
 * Every classifier arm × sender-visibility combination is exercised. When the label
 * is missing/blank we still show the sender-prefixed body (or the empty-message
 * fallback) so a partial locale never blanks a row.
 */
class MessageSummaryLineTest {

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
        hidden = "Contenu masqué",
        viewOnce = "Vue unique",
    )

    private val now = 1_700_000_000_000L
    private val isoNow = "2023-11-14T22:13:20Z"

    private fun message(
        content: String = "Salut !",
        senderId: String? = "other",
        senderName: String? = "Alice",
        messageType: String = "text",
        isBlurred: Boolean = false,
        isViewOnce: Boolean = false,
        expiresAt: String? = null,
    ) = ApiConversationLastMessage(
        id = "m1",
        content = content,
        senderId = senderId,
        senderName = senderName,
        messageType = messageType,
        isBlurred = isBlurred,
        isViewOnce = isViewOnce,
        expiresAt = expiresAt,
    )

    @Test
    fun `standard message reuses lastMessagePreview text and kind is STANDARD`() {
        val line = messageSummaryLine(
            message = message(),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.STANDARD)
        assertThat(line.text).isEqualTo("Salut !")
    }

    @Test
    fun `standard message in a group prepends the sender`() {
        val line = messageSummaryLine(
            message = message(),
            currentUserId = "me",
            showSender = true,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.STANDARD)
        assertThat(line.text).isEqualTo("Alice : Salut !")
    }

    @Test
    fun `null message keeps STANDARD kind with the empty-message fallback text`() {
        val line = messageSummaryLine(
            message = null,
            currentUserId = "me",
            showSender = false,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.STANDARD)
        assertThat(line.text).isEqualTo("Aucun message")
    }

    @Test
    fun `expired message drops the sender and shows the expired label`() {
        val line = messageSummaryLine(
            message = message(expiresAt = "2023-11-14T22:00:00Z"),
            currentUserId = "me",
            showSender = true,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.EXPIRED)
        assertThat(line.text).isEqualTo("Message expiré")
    }

    @Test
    fun `hidden message in a group prefixes the sender before the hidden label`() {
        val line = messageSummaryLine(
            message = message(isBlurred = true),
            currentUserId = "me",
            showSender = true,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.HIDDEN)
        assertThat(line.text).isEqualTo("Alice : Contenu masqué")
    }

    @Test
    fun `hidden message in a direct chat shows the hidden label alone`() {
        val line = messageSummaryLine(
            message = message(isBlurred = true),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.HIDDEN)
        assertThat(line.text).isEqualTo("Contenu masqué")
    }

    @Test
    fun `view-once message in a group prefixes the sender`() {
        val line = messageSummaryLine(
            message = message(isViewOnce = true),
            currentUserId = "me",
            showSender = true,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.VIEW_ONCE)
        assertThat(line.text).isEqualTo("Alice : Vue unique")
    }

    @Test
    fun `view-once message from me uses the you prefix`() {
        val line = messageSummaryLine(
            message = message(isViewOnce = true, senderId = "me"),
            currentUserId = "me",
            showSender = true,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.VIEW_ONCE)
        assertThat(line.text).isEqualTo("Vous : Vue unique")
    }

    @Test
    fun `ephemeral active message reuses the standard body text with EPHEMERAL kind`() {
        val line = messageSummaryLine(
            message = message(expiresAt = "2023-11-14T22:14:00Z"),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.EPHEMERAL_ACTIVE)
        assertThat(line.text).isEqualTo("Salut !")
    }

    @Test
    fun `ephemeral active message in a group keeps the sender prefix`() {
        val line = messageSummaryLine(
            message = message(expiresAt = "2023-11-14T22:14:00Z"),
            currentUserId = "me",
            showSender = true,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.EPHEMERAL_ACTIVE)
        assertThat(line.text).isEqualTo("Alice : Salut !")
    }

    @Test
    fun `expired boundary uses inclusive comparison at now`() {
        val line = messageSummaryLine(
            message = message(expiresAt = isoNow),
            currentUserId = "me",
            showSender = false,
            labels = labels,
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.EXPIRED)
        assertThat(line.text).isEqualTo("Message expiré")
    }

    @Test
    fun `blank expired label falls back to the sender-less body`() {
        val line = messageSummaryLine(
            message = message(expiresAt = "2023-11-14T22:00:00Z"),
            currentUserId = "me",
            showSender = true,
            labels = labels.copy(expired = "   "),
            nowMillis = now,
        )

        // A partial locale must not leave the row visually blank — we fall
        // through to the standard body so at least the message content shows.
        assertThat(line.kind).isEqualTo(MessageSummaryKind.EXPIRED)
        assertThat(line.text).isEqualTo("Salut !")
    }

    @Test
    fun `blank hidden label falls back to the sender-prefixed body`() {
        val line = messageSummaryLine(
            message = message(isBlurred = true),
            currentUserId = "me",
            showSender = true,
            labels = labels.copy(hidden = ""),
            nowMillis = now,
        )

        assertThat(line.kind).isEqualTo(MessageSummaryKind.HIDDEN)
        assertThat(line.text).isEqualTo("Alice : Salut !")
    }
}
