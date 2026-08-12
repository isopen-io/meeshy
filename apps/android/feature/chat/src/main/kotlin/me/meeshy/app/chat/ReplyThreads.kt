package me.meeshy.app.chat

/**
 * A reply-thread summary for one parent message: how many live replies quote it
 * ([count]) and the id of the earliest such reply in list order ([firstReplyId]),
 * used as the jump anchor when the reply-count pill is tapped.
 */
data class ReplyThread(
    val parentId: String,
    val count: Int,
    val firstReplyId: String,
)

/**
 * Pure SSOT grouping loaded messages into reply threads — parity with iOS's
 * reply-count pills. The "how to count / which reply anchors the thread" product
 * decision is kept out of the Composable so it stays JVM-testable.
 *
 * Rules:
 *  - A message counts toward a thread only when it is a reply: its [ReplyLink.replyToId]
 *    is non-blank (trimmed) and not equal to its own id (a self-reference is inert),
 *    and the reply itself is not deleted (a deleted reply never inflates the count).
 *  - Replies are grouped by their (trimmed) parent id. A reply to a paged-out parent is
 *    still grouped under that parent id; the consumer simply never reads a thread whose
 *    parent isn't on screen.
 *  - [ReplyThread.firstReplyId] is the first live reply encountered in the given list
 *    order, so tapping the pill jumps to the earliest reply.
 *  - A parent whose every reply is deleted (or absent) has no thread.
 */
class ReplyThreads private constructor(private val byParent: Map<String, ReplyThread>) {

    val size: Int get() = byParent.size

    fun threadFor(messageId: String): ReplyThread? = byParent[messageId]

    companion object {
        val EMPTY: ReplyThreads = ReplyThreads(emptyMap())

        fun of(messages: List<ReplyLink>): ReplyThreads {
            if (messages.isEmpty()) return EMPTY
            val byParent = LinkedHashMap<String, ReplyThread>()
            messages.forEach { link ->
                if (link.isDeleted) return@forEach
                val parent = link.replyToId?.trim()?.ifBlank { null } ?: return@forEach
                if (parent == link.id) return@forEach
                val existing = byParent[parent]
                byParent[parent] = existing?.copy(count = existing.count + 1)
                    ?: ReplyThread(parentId = parent, count = 1, firstReplyId = link.id)
            }
            return if (byParent.isEmpty()) EMPTY else ReplyThreads(byParent)
        }
    }
}
