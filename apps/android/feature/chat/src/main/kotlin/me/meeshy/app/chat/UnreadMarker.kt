package me.meeshy.app.chat

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.FirstUnreadBoundary
import me.meeshy.sdk.model.FirstUnreadCandidate
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Ce que l'ouverture retient de la conversation AVANT de la marquer lue : le curseur de lecture serveur
 * et le compte serveur. Il alimente [FirstUnreadBoundary], la loi du premier non lu.
 */
data class UnreadCursor(
    val lastReadMessageId: String?,
    val lastReadAtMillis: Long?,
    val lastReadMessageCreatedAtMillis: Long?,
    val joinedAtMillis: Long?,
    val serverUnreadCount: Int,
) {
    companion object {
        fun of(conversation: ApiConversation?, viewerId: String?): UnreadCursor = UnreadCursor(
            lastReadMessageId = conversation?.lastReadMessageId,
            lastReadAtMillis = isoToEpochMillisOrNull(conversation?.lastReadAt),
            lastReadMessageCreatedAtMillis = isoToEpochMillisOrNull(conversation?.lastReadMessageCreatedAt),
            joinedAtMillis = viewerId?.let { id ->
                isoToEpochMillisOrNull(conversation?.participants?.firstOrNull { it.userId == id }?.joinedAt)
            },
            serverUnreadCount = conversation?.unreadCount ?: 0,
        )
    }
}

/** Le séparateur « Nouveaux messages » : le résultat de [FirstUnreadBoundary], projeté sur les bulles chargées. */
object UnreadMarker {

    /** L'id du premier message non lu de [bubbles] (ordre croissant), ou `null` quand il n'y a rien à tracer. */
    fun firstUnreadId(bubbles: List<BubbleContent>, cursor: UnreadCursor, viewerId: String?): String? =
        FirstUnreadBoundary.resolve(
            messages = bubbles.filterNot { it.isOutgoing }.map {
                FirstUnreadCandidate(it.messageId, it.senderId ?: it.messageId, isoToEpochMillisOrNull(it.createdAtIso) ?: 0L)
            },
            lastReadMessageId = cursor.lastReadMessageId,
            lastReadAtMillis = cursor.lastReadAtMillis,
            lastReadMessageCreatedAtMillis = cursor.lastReadMessageCreatedAtMillis,
            joinedAtMillis = cursor.joinedAtMillis,
            viewerId = viewerId,
            unreadCountHint = cursor.serverUnreadCount,
        )?.firstUnreadId
}
