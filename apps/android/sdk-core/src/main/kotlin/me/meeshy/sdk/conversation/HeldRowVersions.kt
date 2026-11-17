package me.meeshy.sdk.conversation

import me.meeshy.core.database.dao.MessageRowVersion
import me.meeshy.core.database.entity.MessageEntity

/**
 * #18915 — the newest rows of a conversation as a revalidation found them BEFORE its request. The page it receives was
 * built at some instant of the flight, so a write that landed on a row meanwhile (a reaction, a pin the socket brought)
 * may be newer than that page. Such a row — its version moved, or it did not exist yet — keeps its reactions and its
 * pin, the fields the served payload otherwise has the authority to empty ([me.meeshy.sdk.model.MessageMergePolicy]).
 */
internal class HeldRowVersions private constructor(
    private val versions: Map<String, Long>,
    private val coveredFrom: Long,
) {
    /**
     * Whether a write landed on [row] since the snapshot. A row the snapshot does not hold was written since when it is
     * newer than what the snapshot covers; an older one was only out of its reach, and is not presumed moved.
     */
    fun movedSince(row: MessageEntity): Boolean =
        versions[row.id]?.let { it != row.changeVersion } ?: (row.createdAt > coveredFrom)

    companion object {
        /** [rows]: the [limit] newest rows of the conversation ([me.meeshy.core.database.dao.MessageDao.recentVersions]). */
        fun of(rows: List<MessageRowVersion>, limit: Int): HeldRowVersions = HeldRowVersions(
            versions = rows.associate { it.id to it.changeVersion },
            coveredFrom = rows.takeIf { it.size >= limit }?.minOfOrNull { it.createdAt } ?: Long.MIN_VALUE,
        )
    }
}
