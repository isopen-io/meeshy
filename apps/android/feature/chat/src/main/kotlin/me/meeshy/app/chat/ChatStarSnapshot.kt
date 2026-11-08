package me.meeshy.app.chat

import me.meeshy.sdk.model.StarredAttachmentKind
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Ce qu'un favori garde d'un message (iOS `ConversationViewModel.toggleStar`) : de quoi le lister et y revenir.
 *
 * **Le favori d'une conversation chiffrée de bout en bout ne garde pas d'extrait** (#14632, miroir de la décision iOS
 * « le clair E2EE ne s'écrit que dans le coffre ») : le magasin des favoris est un fichier ordinaire, hors du coffre ; le
 * texte qu'affiche la bulle n'y entre pas — ni celui d'un message ouvert sur cet appareil, ni celui d'un message de la
 * conversation chiffrée, quel qu'il soit.
 */
internal object ChatStarSnapshot {
    fun of(
        bubble: BubbleContent,
        conversationId: String,
        conversationName: String?,
        accentColorHex: String?,
        senderAvatarUrl: String?,
        conversationIsEndToEnd: Boolean,
        nowMillis: Long,
    ): StarredMessage = StarredMessage(
        messageId = bubble.messageId,
        conversationId = conversationId,
        conversationName = conversationName,
        conversationAccentColor = accentColorHex,
        senderName = bubble.senderName,
        senderAvatarUrl = senderAvatarUrl,
        contentPreview = if (keepsNoText(bubble, conversationIsEndToEnd)) "" else bubble.text,
        attachmentKind = when {
            bubble.images.isNotEmpty() -> StarredAttachmentKind.IMAGE
            bubble.files.isNotEmpty() -> StarredAttachmentKind.FILE
            else -> null
        },
        starredAtMillis = nowMillis,
        sentAtIso = bubble.createdAtIso,
    )

    private fun keepsNoText(bubble: BubbleContent, conversationIsEndToEnd: Boolean): Boolean =
        conversationIsEndToEnd || bubble.isEndToEndOpened || bubble.isEndToEndSealed
}
