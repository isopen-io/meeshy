package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleContent

/** How the newest unread message renders on the scroll-to-bottom control's preview. */
enum class UnreadPreviewKind { Text, Image, File }

/** A compact preview of the newest unread message, shown beside the scroll-to-bottom control. */
data class UnreadPreview(
    val messageId: String,
    val senderName: String?,
    val text: String,
    val kind: UnreadPreviewKind,
)

/**
 * An opaque projection of a message for the scroll affordance: only its identity,
 * direction, deleted-ness, sender and preview payload — everything the reducer needs
 * to decide the control's visibility and unread badge, and nothing the rich bubble
 * carries that it does not. Keeping it SDK-agnostic keeps [ScrollAffordance] a pure,
 * fully-testable decision.
 */
data class AffordanceMessage(
    val id: String,
    val isOutgoing: Boolean,
    val isDeleted: Boolean,
    val senderName: String?,
    val text: String,
    val kind: UnreadPreviewKind,
)

/**
 * State of the scroll-to-bottom control. [isVisible] shows the control whenever the
 * reader is not at the bottom; [unreadCount] counts the incoming messages that arrived
 * while they were scrolled away, with [preview] describing the newest such message.
 * [lastAcknowledgedId] is the newest message the reader has seen (frozen the moment
 * they scroll away), the anchor the unread count is measured from.
 */
data class ScrollAffordanceState(
    val isAtBottom: Boolean = true,
    val unreadCount: Int = 0,
    val lastAcknowledgedId: String? = null,
    val preview: UnreadPreview? = null,
) {
    val isVisible: Boolean get() = !isAtBottom
    val hasUnread: Boolean get() = unreadCount > 0
}

/**
 * Pure SSOT for the scroll-to-bottom control, mirroring the iOS
 * `ConversationScrollControlsView` book-keeping: while the reader sits at the bottom
 * every message is acknowledged and the control hides; the moment they scroll away the
 * acknowledged anchor freezes, and each subsequent incoming (non-own, undeleted) message
 * grows the unread badge and refreshes the preview. Scrolling back to the bottom clears
 * the badge and preview. History paged out from the top never resurrects as unread, and
 * a lost anchor re-baselines to the newest rather than counting the whole history.
 */
object ScrollAffordance {

    fun next(
        previous: ScrollAffordanceState,
        messages: List<AffordanceMessage>,
        isNearBottom: Boolean,
    ): ScrollAffordanceState {
        val newestId = messages.lastOrNull()?.id

        if (isNearBottom) {
            return ScrollAffordanceState(
                isAtBottom = true,
                unreadCount = 0,
                lastAcknowledgedId = newestId,
                preview = null,
            )
        }

        val anchorIndex = previous.lastAcknowledgedId
            ?.let { anchor -> messages.indexOfLast { it.id == anchor } }
            ?: -1

        val lostAnchor = messages.isNotEmpty() && anchorIndex < 0
        if (previous.lastAcknowledgedId == null || lostAnchor) {
            return previous.copy(
                isAtBottom = false,
                unreadCount = 0,
                lastAcknowledgedId = newestId,
                preview = null,
            )
        }

        val unread = messages
            .drop(anchorIndex + 1)
            .filter { !it.isOutgoing && !it.isDeleted }

        return previous.copy(
            isAtBottom = false,
            unreadCount = unread.size,
            preview = unread.lastOrNull()?.toPreview(),
        )
    }
}

private fun AffordanceMessage.toPreview() = UnreadPreview(
    messageId = id,
    senderName = senderName,
    text = text,
    kind = kind,
)

fun BubbleContent.toAffordanceMessage(): AffordanceMessage = AffordanceMessage(
    id = messageId,
    isOutgoing = isOutgoing,
    isDeleted = isDeleted,
    senderName = senderName,
    text = text,
    kind = when {
        images.isNotEmpty() -> UnreadPreviewKind.Image
        files.isNotEmpty() -> UnreadPreviewKind.File
        else -> UnreadPreviewKind.Text
    },
)
