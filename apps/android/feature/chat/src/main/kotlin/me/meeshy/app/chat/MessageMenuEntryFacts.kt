package me.meeshy.app.chat

import me.meeshy.sdk.model.MessageActionPolicy
import me.meeshy.sdk.model.MessageContentKind
import me.meeshy.sdk.model.MessageMenuEntries
import me.meeshy.sdk.model.ObjectIdGuard
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus

/** What [MessageMenuEntries] reads of a bubble: the reader's facts, never a rule. */
internal fun BubbleContent.menuEntryFacts(
    hasThread: Boolean,
    conversationIsEndToEnd: Boolean,
    nowMillis: Long,
): MessageMenuEntries.Facts {
    val source = originalText ?: text
    return MessageMenuEntries.Facts(
        isGone = isDeleted,
        isLive = !isDeleted && !isPending && deliveryStatus != DeliveryStatus.Failed && !ObjectIdGuard.isLocalId(messageId),
        isNotice = isSystem,
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        isSealed = isEndToEndSealed,
        conversationIsEndToEnd = conversationIsEndToEnd,
        hasText = !isSystem && text.isNotBlank(),
        isTranslated = isTranslated,
        kindActions = MessageActionPolicy.kindActionsOf(contentKindSubject(source), nowMillis),
        link = MessageMenuEntries.firstLink(source),
        hasThread = hasThread,
        pieces = menuPieces,
        exits = exitOffer,
    )
}

/** The pieces the menu counts, in the bubble's order: photos, then files and videos, then sounds. */
internal val BubbleContent.menuPieces: List<MessageMenuEntries.Piece>
    get() = images.map { MessageMenuEntries.Piece.IMAGE } +
        files.map { if (it.isVideo) MessageMenuEntries.Piece.VIDEO else MessageMenuEntries.Piece.FILE } +
        audios.map { MessageMenuEntries.Piece.AUDIO }

/** The attachment id behind the bubble's ONLY piece, when it has exactly one. */
internal val BubbleContent.onlyPieceId: String?
    get() = (images.map { it.attachmentId } + files.map { it.attachmentId } + audios.map { it.attachmentId }).singleOrNull()

private fun BubbleContent.contentKindSubject(source: String): MessageContentKind.Subject = MessageContentKind.Subject(
    id = messageId,
    content = source,
    messageType = if (isSystem) "system" else null,
    deletedAt = if (isDeleted) DELETED_MARK else null,
    isViewOnce = isViewOnce,
    isBlurred = isBlurred,
    expiresAt = expiresAtIso,
    metadata = MessageContentKind.Metadata(carriesLocation = locations.isNotEmpty()),
    attachments = images.map { MessageContentKind.Piece(mimeType = "image/*") } +
        files.map { MessageContentKind.Piece(mimeType = if (it.isVideo) "video/*" else null, fileName = it.name) } +
        audios.map { MessageContentKind.Piece(mimeType = "audio/*") },
    failed = deliveryStatus == DeliveryStatus.Failed,
)

private const val DELETED_MARK = "deleted"
