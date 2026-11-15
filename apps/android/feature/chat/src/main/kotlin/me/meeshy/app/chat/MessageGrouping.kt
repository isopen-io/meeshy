package me.meeshy.app.chat

import java.time.Instant
import java.time.ZoneId

/**
 * The minimal projection of a message needed to decide consecutive-sender
 * grouping: its [id], the [senderId] that authored it, whether it is one of the
 * viewer's own outgoing messages, the parsed send time in epoch millis
 * ([createdAtMillis] is null when the timestamp is missing/unparsable), and
 * [isSystem] — whether this is a system message (e.g. a join/leave notice)
 * rather than a genuine turn at talk.
 *
 * [isSystem] is orthogonal to [isOutgoing]: a join notice can concern the
 * viewer themself (`isOutgoing = true`, e.g. "You joined the conversation")
 * while still being a system message, never a spoken turn.
 */
data class MessageGroupInput(
    val id: String,
    val senderId: String?,
    val isOutgoing: Boolean,
    val createdAtMillis: Long?,
    val isSystem: Boolean = false,
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
 * Pure SSOT that clusters an ascending message list into consecutive-sender runs.
 * Web (`apps/web/utils/message-grouping.ts`) and iOS
 * (`apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayGrouping.swift`) compute
 * the identical rule; any change here must be mirrored on both.
 *
 * Two adjacent messages belong to the same run when ALL hold:
 *  - **Neither is a system message.** A system message (e.g. a join/leave
 *    notice) is never a turn at talk: it always forms its own standalone group
 *    and never continues a neighbour's run, either as predecessor or successor.
 *    This matters because a join notice is written with the arriver as its
 *    author — grouping on sender id alone would fold the newcomer's first real
 *    bubble into their own join notice's run, and the bubble would lose avatar,
 *    name, and timestamp all at once.
 *  - **Same author.** Two outgoing messages share the single "self" identity; two
 *    incoming messages match only on equal, non-null [MessageGroupInput.senderId].
 *    An incoming message with a null sender id never groups (it can't be proven to
 *    share an author), and an outgoing/incoming pair never groups.
 *  - **Same calendar day.** Comme iOS (`MessageDayGrouping.continues`), une
 *    suite ne traverse jamais minuit dans le fuseau [zone] — sans fenêtre de
 *    temps : deux messages du même auteur le même jour forment une seule suite,
 *    même à une heure d'écart. Quand l'une des dates manque, le test est sauté :
 *    le message suit la suite précédente au lieu d'en ouvrir une fausse.
 *
 * Le consommateur pose l'identité de l'auteur (avatar, nom, @pseudo) dans le pied de la
 * DERNIÈRE bulle ([MessageGroupPosition.isLastInGroup], iOS `showIdentityBar`) et
 * l'espacement sur premier/dernier : l'identité et la suite visuelle ne divergent jamais.
 */
object MessageGrouping {

    fun positions(
        messages: List<MessageGroupInput>,
        zone: ZoneId = ZoneId.systemDefault(),
    ): Map<String, MessageGroupPosition> {
        if (messages.isEmpty()) return emptyMap()
        return messages.mapIndexed { index, message ->
            val previous = messages.getOrNull(index - 1)
            val next = messages.getOrNull(index + 1)
            message.id to MessageGroupPosition(
                isFirstInGroup = !continuous(previous, message, zone),
                isLastInGroup = !continuous(message, next, zone),
            )
        }.toMap()
    }

    private fun continuous(earlier: MessageGroupInput?, later: MessageGroupInput?, zone: ZoneId): Boolean {
        if (earlier == null || later == null) return false
        if (earlier.isSystem || later.isSystem) return false
        return sameAuthor(earlier, later) && sameLocalDay(earlier, later, zone)
    }

    private fun sameAuthor(a: MessageGroupInput, b: MessageGroupInput): Boolean {
        if (a.isOutgoing != b.isOutgoing) return false
        if (a.isOutgoing) return true
        val senderId = a.senderId ?: return false
        return senderId == b.senderId
    }

    private fun sameLocalDay(a: MessageGroupInput, b: MessageGroupInput, zone: ZoneId): Boolean {
        val aMillis = a.createdAtMillis ?: return true
        val bMillis = b.createdAtMillis ?: return true
        return Instant.ofEpochMilli(aMillis).atZone(zone).toLocalDate() ==
            Instant.ofEpochMilli(bMillis).atZone(zone).toLocalDate()
    }
}
