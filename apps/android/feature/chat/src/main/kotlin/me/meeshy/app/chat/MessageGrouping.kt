package me.meeshy.app.chat

import kotlin.math.abs

/**
 * The minimal projection of a message needed to decide consecutive-sender
 * grouping: its [id], the [senderId] that authored it, whether it is one of the
 * viewer's own outgoing messages, and the parsed send time in epoch millis
 * ([createdAtMillis] is null when the timestamp is missing/unparsable).
 */
data class MessageGroupInput(
    val id: String,
    val senderId: String?,
    val isOutgoing: Boolean,
    val createdAtMillis: Long?,
)

/**
 * Where a message sits inside its consecutive-sender run: the first message of a
 * run shows the sender header and a top gap, the last closes the run with a
 * bottom gap, and messages inside a run render tightly stacked (WhatsApp/iMessage
 * style). A message that is both first and last is [isStandalone].
 */
data class MessageGroupPosition(
    val isFirstInGroup: Boolean,
    val isLastInGroup: Boolean,
) {
    /** True when the message forms a run of one — its own first and last. */
    val isStandalone: Boolean get() = isFirstInGroup && isLastInGroup
}

/**
 * Pure SSOT that clusters an ascending message list into consecutive-sender runs
 * — the grouping iOS never actually computed (it hardcodes `isLastInGroup: true`
 * and always shows the avatar), so Android renders genuinely grouped bubbles.
 *
 * Two adjacent messages belong to the same run when BOTH hold:
 *  - **Same author.** Two outgoing messages share the single "self" identity; two
 *    incoming messages match only on equal, non-null [MessageGroupInput.senderId].
 *    An incoming message with a null sender id never groups (it can't be proven to
 *    share an author), and an outgoing/incoming pair never groups.
 *  - **Within the time gap.** Their send times differ by at most [gapMillis]
 *    (compared on the absolute delta, so an out-of-order pair is judged by
 *    proximity, not sign). When either timestamp is missing the time test is
 *    skipped — a message with no timestamp rides with the previous same-author
 *    message rather than opening a spurious new run.
 *
 * The consumer derives `showSenderName` from [MessageGroupPosition.isFirstInGroup]
 * and the inter-bubble spacing from first/last, so the header and the visual run
 * can never disagree.
 */
object MessageGrouping {

    /** Default same-author window before a new run starts: five minutes. */
    const val DEFAULT_GAP_MILLIS: Long = 5 * 60 * 1000L

    fun positions(
        messages: List<MessageGroupInput>,
        gapMillis: Long = DEFAULT_GAP_MILLIS,
    ): Map<String, MessageGroupPosition> {
        if (messages.isEmpty()) return emptyMap()
        return messages.mapIndexed { index, message ->
            val previous = messages.getOrNull(index - 1)
            val next = messages.getOrNull(index + 1)
            message.id to MessageGroupPosition(
                isFirstInGroup = !continuous(previous, message, gapMillis),
                isLastInGroup = !continuous(message, next, gapMillis),
            )
        }.toMap()
    }

    private fun continuous(earlier: MessageGroupInput?, later: MessageGroupInput?, gapMillis: Long): Boolean {
        if (earlier == null || later == null) return false
        return sameAuthor(earlier, later) && withinGap(earlier, later, gapMillis)
    }

    private fun sameAuthor(a: MessageGroupInput, b: MessageGroupInput): Boolean {
        if (a.isOutgoing != b.isOutgoing) return false
        if (a.isOutgoing) return true
        val senderId = a.senderId ?: return false
        return senderId == b.senderId
    }

    private fun withinGap(a: MessageGroupInput, b: MessageGroupInput, gapMillis: Long): Boolean {
        val earlierMillis = a.createdAtMillis ?: return true
        val laterMillis = b.createdAtMillis ?: return true
        return abs(laterMillis - earlierMillis) <= gapMillis
    }
}
