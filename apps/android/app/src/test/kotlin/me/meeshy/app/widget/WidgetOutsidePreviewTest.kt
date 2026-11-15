package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

/**
 * Un widget se lit sur l'écran d'accueil, sans déverrouiller la conversation : un contenu qui
 * disparaît ou que la liste masque n'y paraît jamais en clair, ni dans sa traduction (iOS
 * `OutsidePreview.lastMessage`).
 */
class WidgetOutsidePreviewTest {

    private val now = 1_800_000_000_000L
    private val future = "2027-03-15T08:00:00.000Z"
    private val past = "2026-01-01T00:00:00.000Z"

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
        encrypted = "Message chiffré",
    )

    private fun conversation(
        type: String = "direct",
        message: ApiConversationLastMessage,
    ) = ApiConversation(
        id = "c1",
        type = type,
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-other", userId = "ana", displayName = "Ana"),
        ),
        lastMessage = message,
        lastMessageTranslations = mapOf("fr" to "Le secret traduit"),
        lastMessageOriginalLanguage = "en",
    )

    private fun message(
        isViewOnce: Boolean = false,
        isBlurred: Boolean = false,
        expiresAt: String? = null,
        effectFlags: Int? = null,
        ephemeralDuration: Int? = null,
        isEncrypted: Boolean? = null,
        attachments: List<ApiMessageAttachment>? = null,
    ) = ApiConversationLastMessage(
        id = "m1",
        content = "The secret",
        senderId = "ana",
        senderName = "Ana",
        messageType = "text",
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        expiresAt = expiresAt,
        effectFlags = effectFlags,
        ephemeralDuration = ephemeralDuration,
        isEncrypted = isEncrypted,
        attachments = attachments,
    )

    private fun recentPreview(conversation: ApiConversation): String =
        RecentConversationsWidgetPresentation.from(
            conversations = listOf(conversation),
            currentUserId = "me",
            previewLabels = labels,
            preferredLanguages = listOf("fr"),
            ephemeralLabel = "Message éphémère",
            nowMillis = now,
        ).rows.single().preview

    @Test
    fun `a view-once message shows its protection label, never its text nor its translation`() {
        assertThat(recentPreview(conversation(message = message(isViewOnce = true)))).isEqualTo("Vue unique")
    }

    @Test
    fun `a view-once attachment protects the whole preview`() {
        val piece = ApiMessageAttachment(id = "a1", isViewOnce = true)

        assertThat(recentPreview(conversation(message = message(attachments = listOf(piece))))).isEqualTo("Vue unique")
    }

    @Test
    fun `a timed flame still alive shows the ephemeral label`() {
        val flame = message(expiresAt = future, effectFlags = MessageEffectFlags.EPHEMERAL.toInt(), ephemeralDuration = 3600)

        assertThat(recentPreview(conversation(message = flame))).isEqualTo("Message éphémère")
    }

    @Test
    fun `an after-read flame shows the ephemeral label`() {
        val flame = message(effectFlags = (MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ).toInt())

        assertThat(recentPreview(conversation(message = flame))).isEqualTo("Message éphémère")
    }

    @Test
    fun `an expired message, a blurred one and an encrypted one say what the list says`() {
        assertThat(recentPreview(conversation(message = message(expiresAt = past)))).isEqualTo("Message expiré")
        assertThat(recentPreview(conversation(message = message(isBlurred = true)))).isEqualTo("Message masqué")
        assertThat(recentPreview(conversation(message = message(isEncrypted = true)))).isEqualTo("Message chiffré")
    }

    @Test
    fun `a group still says who posted the protected content`() {
        assertThat(recentPreview(conversation(type = "group", message = message(isViewOnce = true)))).isEqualTo("Ana : Vue unique")
    }

    @Test
    fun `an ordinary message keeps its prism translation`() {
        assertThat(recentPreview(conversation(message = message()))).isEqualTo("Le secret traduit")
    }

    @Test
    fun `quick reply masks a view-once message the same way`() {
        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(conversation(message = message(isViewOnce = true))),
            currentUserId = "me",
            previewLabels = labels,
            preferredLanguages = listOf("fr"),
            ephemeralLabel = "Message éphémère",
            nowMillis = now,
        )

        assertThat(presentation?.preview).isEqualTo("Vue unique")
    }
}
