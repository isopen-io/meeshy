package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ObjectIdGuard
import me.meeshy.sdk.model.PinAction
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus

/**
 * The law's reading of [this] bubble: the ONE factory of [MessageActionContext], shared by the
 * long-press menu, the swipe-to-reply gesture and the TalkBack actions of the bubble (#12760).
 * A path that composed its own context would offer what the menu refuses.
 */
internal fun BubbleContent.actionContext(
    canWrite: Boolean,
    canEdit: Boolean = false,
    canDeleteForEveryone: Boolean = false,
    pinAction: PinAction = PinAction.Unavailable,
    hostedEntries: Set<MessageAction> = emptySet(),
): MessageActionContext = MessageActionContext(
    isDeleted = isDeleted,
    isPending = isPending,
    isFailed = deliveryStatus == DeliveryStatus.Failed,
    isOutgoing = isOutgoing,
    isTranslated = isTranslated,
    isShowingOriginal = isShowingOriginal,
    isStarred = isStarred,
    canEdit = canEdit,
    canDeleteForEveryone = canDeleteForEveryone,
    pinAction = pinAction,
    hasOpenableFile = !isDeleted && files.isNotEmpty(),
    isEdited = isEdited,
    hasText = text.isNotBlank(),
    hostedEntries = hostedEntries,
    exitOffer = exitOffer,
    isNotice = isSystem,
    isViewOnce = isViewOnce,
    isUnconfirmed = ObjectIdGuard.isLocalId(messageId),
    canWrite = canWrite,
)

/** A gesture a message row offers outside the long-press menu. */
internal enum class MessageRowAction { Reply, Forward }

/**
 * What a message ROW offers outside its long-press menu — the swipe and the TalkBack actions —
 * read from [MessageActionMenu], never recomposed. Miroir de `MessageRowOffer` (iOS, #12626) :
 * a side the law refuses does not arm, and an action it refuses is not exposed.
 */
@Immutable
internal data class MessageRowOffer(
    val canReply: Boolean,
    val canForward: Boolean,
) {
    /** The TalkBack actions of the bubble, in the menu's order. */
    val accessibilityActions: List<MessageRowAction>
        get() = listOfNotNull(
            MessageRowAction.Reply.takeIf { canReply },
            MessageRowAction.Forward.takeIf { canForward },
        )

    companion object {
        fun of(bubble: BubbleContent, canWrite: Boolean): MessageRowOffer {
            val offered = MessageActionMenu.actions(bubble.actionContext(canWrite = canWrite))
            return MessageRowOffer(
                canReply = MessageAction.Reply in offered,
                canForward = MessageAction.Forward in offered,
            )
        }
    }
}
