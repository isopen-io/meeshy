package me.meeshy.ui.component.bubble

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentPieceClass
import me.meeshy.sdk.model.BubbleAttachmentLayout
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.ProtectionDescriptor

/** Les décisions de « genre » de la bulle (iOS `BubbleContentBuilder`, volet kind/protection/mise en page). */
internal object BubbleKindBuilder {

    /**
     * Vue unique non ouverte par CE lecteur (`consumedByMe` faux) : scellée. Jamais le compteur global du serveur.
     * Un message supprimé garde sa propre voie (pierre tombale).
     */
    fun isViewOnceSealed(message: ApiMessage, isDeleted: Boolean): Boolean =
        !isDeleted && message.effects.has(MessageEffectFlags.VIEW_ONCE) && !message.isViewOnceOpenedByMe

    fun protection(message: ApiMessage): ProtectionDescriptor = ProtectionDescriptor.of(
        effects = message.effects,
        hasExpiry = !message.expiresAt.isNullOrBlank(),
        encryptionMode = message.encryptionMode,
    )

    fun layout(attachments: List<ApiMessageAttachment>): BubbleAttachmentLayout =
        BubbleAttachmentLayout.of(
            attachments.map {
                BubbleAttachmentLayout.Companion.Piece(
                    id = it.id,
                    pieceClass = AttachmentPieceClass.classify(it.mimeType, it.originalName ?: it.fileName),
                )
            },
        )
}
