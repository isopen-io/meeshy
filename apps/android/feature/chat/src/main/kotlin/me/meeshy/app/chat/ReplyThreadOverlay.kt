package me.meeshy.app.chat

/**
 * The minimal projection of a loaded message the reply-thread overlay needs: its own
 * id, the parent it quotes ([replyToId]), whether it is a deleted tombstone, plus the
 * sender / body / media used to render a thread row. Kept SDK-agnostic so the "which
 * messages belong to a thread / how each row reads" product decision stays a pure,
 * JVM-testable [ReplyThreadOverlay] decision, free of Compose.
 */
interface ThreadMessage {
    val id: String
    /** Id of the message this one quotes; null/blank ⇒ not a reply. */
    val replyToId: String?
    val isDeleted: Boolean
    val isOutgoing: Boolean
    /** Resolved sender label (display name or username); null ⇒ resolve from [isOutgoing]. */
    val senderName: String?
    /** Displayed textual body (already Prisme-resolved). */
    val text: String
    val hasImage: Boolean
    val hasFile: Boolean
}

/**
 * One row of the reply-thread overlay — the focused parent or one of its live replies.
 * Reuses [PinnedSnippet]/[messageSnippetOf] as the shared message-preview projection
 * (text › image › file › empty), so a thread row and a pinned row describe the same
 * message identically. The parent row may be a deleted tombstone ([isDeleted]); a reply
 * row never is (deleted replies are filtered out of the thread).
 */
data class ReplyThreadRow(
    val messageId: String,
    val senderName: String?,
    val isOutgoing: Boolean,
    val isDeleted: Boolean,
    val snippet: PinnedSnippet,
)

/**
 * The focused reply-thread overlay: the quoted [parent] and every live reply that
 * quotes it, earliest-first. [replyCount] is the number of live replies.
 */
data class ReplyThreadOverlayModel(
    val parentId: String,
    val parent: ReplyThreadRow,
    val replies: List<ReplyThreadRow>,
) {
    val replyCount: Int get() = replies.size
}

/**
 * Pure SSOT building the focused reply-thread overlay for a parent message — parity
 * with iOS's reply-thread sheet, and the read-side companion to [ReplyThreads] (whose
 * pill opens this). The reply-membership rule is kept identical to [ReplyThreads] so the
 * pill count and the overlay can never disagree:
 *  - A reply belongs to the thread when it is **not deleted**, its (trimmed)
 *    [ThreadMessage.replyToId] equals the (trimmed) parent id, and it is not a
 *    self-reference. Replies keep incoming list order (earliest-first).
 *  - The [parent] must be currently **loaded**; a paged-out parent yields `null` (there
 *    is nothing to head the overlay with). The parent may itself be a deleted tombstone —
 *    its live replies are still worth reading, so the overlay is returned with a deleted
 *    parent row (mirrors [ReplyThreads] counting replies to a deleted parent).
 *  - A parent with **no live reply** yields `null` (no thread to show).
 */
object ReplyThreadOverlay {

    fun of(parentId: String, messages: List<ThreadMessage>): ReplyThreadOverlayModel? {
        val target = parentId.trim().ifBlank { return null }
        val parent = messages.firstOrNull { it.id == target } ?: return null
        val replies = messages.filter { it.isReplyTo(target) }
        if (replies.isEmpty()) return null
        return ReplyThreadOverlayModel(
            parentId = target,
            parent = parent.toRow(),
            replies = replies.map { it.toRow() },
        )
    }

    private fun ThreadMessage.isReplyTo(parent: String): Boolean {
        if (isDeleted) return false
        val quoted = replyToId?.trim()?.ifBlank { null } ?: return false
        if (quoted == id) return false
        return quoted == parent
    }

    private fun ThreadMessage.toRow(): ReplyThreadRow = ReplyThreadRow(
        messageId = id,
        senderName = senderName?.trim()?.ifBlank { null },
        isOutgoing = isOutgoing,
        isDeleted = isDeleted,
        snippet = messageSnippetOf(text = text, hasImage = hasImage, hasFile = hasFile),
    )
}
