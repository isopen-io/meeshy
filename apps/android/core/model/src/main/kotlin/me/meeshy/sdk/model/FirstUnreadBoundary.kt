package me.meeshy.sdk.model

/** Un message minimal tel que [FirstUnreadBoundary] en a besoin (miroir de `FirstUnreadCandidateMessage`). */
data class FirstUnreadCandidate(
    val id: String,
    val senderId: String?,
    val createdAtMillis: Long,
)

/**
 * La loi du PREMIER MESSAGE NON LU — miroir de `FirstUnreadBoundary` (iOS) et de `firstUnreadBoundary()`
 * (`packages/shared/utils/first-unread.ts`) :
 *
 * 1. jamais un message du LECTEUR (ni élu, ni compté) ;
 * 2. jamais avant NI AU curseur : rangs `lastReadMessageCreatedAt`, puis `lastReadAt`, puis `joinedAt` ;
 *    `lastReadMessageId` est de plus exclu explicitement ;
 * 3. `null` si tout est lu ;
 * 4. à `createdAt` égal, l'id départage ;
 * 5. [unreadCountHint] (#7427) : le compte serveur n'est consulté QUE sans aucun rang chronologique ;
 *    `N` ⇒ les N derniers candidats ; dès qu'un rang existe il est ignoré.
 */
object FirstUnreadBoundary {

    /** [windowCount] est le compte de la FENÊTRE, jamais de la conversation : l'annonce est le compte serveur (#7525). */
    data class Result(val firstUnreadId: String, val windowCount: Int)

    /**
     * La DESCENTE du curseur de lecture — miroir de `readCursorFloorOf()`
     * (`packages/shared/utils/read-cursor-floor.ts`, #19599), qui porte la loi complète : la
     * POSITION d'abord, l'HORLOGE en repli, et l'arbitrage `?:` contre le `min` du gateway — un
     * cliquet de NON-RÉGRESSION qui ne se transpose PAS à un séparateur, lequel descend la
     * position depuis son origine.
     *
     * Ce miroir ne peut pas importer la loi TS : il en porte donc UNE graphie, ici, appelée par
     * [resolve] comme par [orderedCandidates]. Il en portait DEUX jusqu'à #19599, dans la même
     * unité. Cliquet : `packages/shared/utils/read-cursor-floor-single-spelling.test.ts`.
     */
    fun readCursorFloorMillis(
        lastReadMessageCreatedAtMillis: Long?,
        lastReadAtMillis: Long?,
    ): Long? = lastReadMessageCreatedAtMillis ?: lastReadAtMillis

    fun resolve(
        messages: List<FirstUnreadCandidate>,
        lastReadMessageId: String?,
        lastReadAtMillis: Long?,
        lastReadMessageCreatedAtMillis: Long?,
        joinedAtMillis: Long? = null,
        viewerId: String?,
        unreadCountHint: Int? = null,
    ): Result? {
        val ordered = orderedCandidates(
            messages, lastReadMessageId, lastReadAtMillis, lastReadMessageCreatedAtMillis, joinedAtMillis, viewerId,
        )
        val hasChronologicalRank =
            (readCursorFloorMillis(lastReadMessageCreatedAtMillis, lastReadAtMillis) ?: joinedAtMillis) != null
        val candidates = if (hasChronologicalRank || unreadCountHint == null) {
            ordered
        } else {
            ordered.takeLast(unreadCountHint.coerceAtLeast(0))
        }
        val first = candidates.firstOrNull() ?: return null
        return Result(first.id, candidates.size)
    }

    private fun orderedCandidates(
        messages: List<FirstUnreadCandidate>,
        lastReadMessageId: String?,
        lastReadAtMillis: Long?,
        lastReadMessageCreatedAtMillis: Long?,
        joinedAtMillis: Long?,
        viewerId: String?,
    ): List<FirstUnreadCandidate> {
        val boundary =
            readCursorFloorMillis(lastReadMessageCreatedAtMillis, lastReadAtMillis) ?: joinedAtMillis
        return messages
            .filter { viewerId == null || it.senderId != viewerId }
            .filter { it.id != lastReadMessageId }
            .filter { boundary == null || it.createdAtMillis > boundary }
            .sortedWith(compareBy<FirstUnreadCandidate> { it.createdAtMillis }.thenBy { it.id })
    }
}
