package me.meeshy.ui.component.focal

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.MessageSourceKind
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus

/**
 * La valeur d'entrée STABLE de la rangée plate (iOS `FocalRowInput`) : des primitives et des
 * énumérations, jamais un rappel ni un flux. Deux projections du même message sont égales, la
 * rangée est donc sautée par Compose tant que rien de visible n'a changé ; les gestes voyagent à
 * part, dans `BubbleCallbacks`.
 */
@Immutable
public data class FocalRowInput(
    val messageId: String,
    val isMe: Boolean,
    val isFirstInGroup: Boolean,
    val isLastInGroup: Boolean,
    val senderName: String?,
    val senderUserId: String?,
    val senderAvatarUrl: String?,
    val senderColorHex: String?,
    val senderIsAnonymous: Boolean,
    val isAgentAuthored: Boolean,
    val viewingConversationId: String?,
    val createdAtIso: String?,
    val deliveryStatus: DeliveryStatus,
    val isSlowSend: Boolean,
    val isEdited: Boolean,
    val isOptimistic: Boolean,
    /** Le contour équipé de l'expéditeur, tel que servi : l'avatar le résout par le catalogue. */
    val senderRing: ServedProfileDecorItem? = null,
) {
    public companion object {
        public fun of(content: BubbleContent): FocalRowInput = FocalRowInput(
            messageId = content.messageId,
            isMe = content.isOutgoing,
            isFirstInGroup = content.isFirstInGroup,
            isLastInGroup = content.isLastInGroup,
            senderName = content.senderName?.takeIf { it.isNotBlank() },
            senderUserId = content.senderProfile?.userId,
            senderAvatarUrl = content.senderAvatarUrl,
            senderColorHex = content.senderColorHex,
            senderIsAnonymous = content.senderIsAnonymous,
            isAgentAuthored = content.sourceKind == MessageSourceKind.Agent,
            viewingConversationId = content.viewingConversationId,
            createdAtIso = content.createdAtIso,
            deliveryStatus = content.deliveryStatus,
            isSlowSend = content.isSlowSend,
            isEdited = content.isEdited,
            isOptimistic = content.isPending,
            senderRing = content.senderRing,
        )
    }
}
