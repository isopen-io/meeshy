package me.meeshy.app.widget.kit

import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.app.conversations.MessageSummaryKind
import me.meeshy.app.conversations.lastMessagePreview
import me.meeshy.app.conversations.messageSummaryLine
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.contentExitPiece
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.resolvedLastMessagePreview

/**
 * L'aperçu du dernier message tel qu'il peut SORTIR de l'app — sur l'écran d'accueil, que tout
 * le monde voit sans déverrouiller la conversation. Miroir de `OutsidePreview.lastMessage` (iOS,
 * `apps/ios/Meeshy/Features/Main/Models/Message.swift`) : un contenu qui disparaît (vue unique,
 * flamme après lecture, flamme à durée) ne livre que son libellé de protection, sinon l'aperçu
 * résolu par le Prisme. Ce que la rangée de liste masque déjà (expiré, chiffré, flouté) l'est ici
 * aussi : un widget n'en dit jamais plus que la liste.
 */
internal object WidgetOutsidePreview {

    fun text(
        conversation: ApiConversation,
        currentUserId: String?,
        showSender: Boolean,
        labels: LastMessagePreviewLabels,
        ephemeralLabel: String,
        preferredLanguages: List<String>,
        nowMillis: Long,
    ): String {
        val message = conversation.lastMessage
        val masked = MessageSummaryKind.of(message, nowMillis) in MASKED_BY_THE_LIST || message.holdsBlur()
        if (masked) return masked(message, currentUserId, showSender, labels, nowMillis)
        val protection = when (ContentExitLaw.of(message?.exitSubject()).nature) {
            ContentExitLaw.Nature.ORDINARY -> null
            ContentExitLaw.Nature.VIEW_ONCE -> labels.viewOnce
            ContentExitLaw.Nature.TIMED_FLAME, ContentExitLaw.Nature.AFTER_READ_FLAME -> ephemeralLabel
        }
        if (protection != null) return withSender(message, currentUserId, showSender, labels, protection.ifBlank { labels.none })
        return lastMessagePreview(
            message = message,
            currentUserId = currentUserId,
            showSender = showSender,
            labels = labels,
            resolvedContent = conversation.resolvedLastMessagePreview(preferredLanguages),
        )
    }

    private val MASKED_BY_THE_LIST = setOf(MessageSummaryKind.EXPIRED, MessageSummaryKind.ENCRYPTED, MessageSummaryKind.HIDDEN)

    private fun masked(
        message: ApiConversationLastMessage?,
        currentUserId: String?,
        showSender: Boolean,
        labels: LastMessagePreviewLabels,
        nowMillis: Long,
    ): String {
        val kind = MessageSummaryKind.of(message, nowMillis)
        if (kind in MASKED_BY_THE_LIST) {
            return messageSummaryLine(message, currentUserId, showSender, labels, nowMillis).text
        }
        return withSender(message, currentUserId, showSender, labels, labels.hidden.ifBlank { labels.none })
    }

    private fun ApiConversationLastMessage?.holdsBlur(): Boolean {
        if (this == null) return false
        if (isBlurred || ((effectFlags ?: 0).toLong() and MessageEffectFlags.BLURRED) != 0L) return true
        return attachments.orEmpty().any { it.isBlurred == true || ((it.effectFlags ?: 0L) and MessageEffectFlags.BLURRED) != 0L }
    }

    private fun ApiConversationLastMessage.exitSubject() = ContentExitLaw.Subject(
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        effectFlags = effectFlags?.toLong(),
        ephemeralDuration = ephemeralDuration?.toDouble(),
        hasExpiry = isoToEpochMillisOrNull(expiresAt) != null,
        attachments = attachments?.map { it.contentExitPiece },
    )

    private fun withSender(
        message: ApiConversationLastMessage?,
        currentUserId: String?,
        showSender: Boolean,
        labels: LastMessagePreviewLabels,
        body: String,
    ): String {
        if (!showSender || message == null) return body
        val sender = when {
            currentUserId != null && message.senderId == currentUserId -> labels.you
            else -> message.senderName?.takeIf { it.isNotBlank() }
        }
        return if (sender == null) body else labels.senderFormat.format(sender, body)
    }
}
