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
     * Ce qui RESTE non lu après une lecture PARTIELLE (#7350 I-2, miroir Kotlin posé par #19662), borné
     * par la MÊME frontière que [resolve]. Le serveur n'avance son curseur que jusqu'au bout du PRÉFIXE
     * CONTIGU de messages vus depuis la frontière (`MessageReadStatusService.ts`, mode exact) : un message
     * sauté arrête le compte, et la loi le rejoue à l'identique.
     *
     * - [windowIsAtTip] : la fenêtre atteint le présent. Elle porte alors TOUS les non-lus récents — y
     *   compris ceux arrivés depuis l'ouverture. Si elle en compte MOINS que [unreadAtOpen], les manquants
     *   sont PLUS ANCIENS qu'elle : le premier non-lu réel n'y est pas, le curseur serveur ne peut pas
     *   avancer, rien n'est consommé.
     * - sinon (fenêtre ouverte SUR le séparateur), les non-lus absents sont plus RÉCENTS qu'elle et se
     *   déduisent de [unreadAtOpen].
     * - [caughtUpMessageId] : le dernier message RATTRAPÉ pendant l'affichage. Le serveur y a posé son
     *   curseur (`caughtUpToMessageId`) quels que soient les messages sautés : il devient la frontière, et
     *   rien n'était non lu à cet instant. Absent de la fenêtre, il ne déplace rien.
     *
     * Miroir de `FirstUnreadBoundary.remainingUnread` (Swift) ; les dix cas du modèle sont rejoués un pour
     * un par `FirstUnreadRemainingTest`.
     */
    fun remainingUnread(
        messages: List<FirstUnreadCandidate>,
        lastReadMessageId: String?,
        lastReadAtMillis: Long?,
        lastReadMessageCreatedAtMillis: Long?,
        joinedAtMillis: Long? = null,
        viewerId: String?,
        seenIds: Set<String>,
        unreadAtOpen: Int,
        windowIsAtTip: Boolean,
        caughtUpMessageId: String? = null,
    ): Int {
        val caughtUp = caughtUpMessageId?.let { id -> messages.firstOrNull { it.id == id } }
        if (caughtUp != null) {
            return remainingUnread(
                messages = messages,
                lastReadMessageId = caughtUp.id,
                lastReadAtMillis = null,
                lastReadMessageCreatedAtMillis = caughtUp.createdAtMillis,
                joinedAtMillis = joinedAtMillis,
                viewerId = viewerId,
                seenIds = seenIds,
                unreadAtOpen = 0,
                windowIsAtTip = windowIsAtTip,
            )
        }
        val candidates = orderedCandidates(
            messages, lastReadMessageId, lastReadAtMillis, lastReadMessageCreatedAtMillis, joinedAtMillis, viewerId,
        )
        val consumed = candidates.takeWhile { it.id in seenIds }.size
        if (!windowIsAtTip) return (unreadAtOpen - consumed).coerceAtLeast(0)
        if (candidates.size < unreadAtOpen) return unreadAtOpen.coerceAtLeast(0)
        return candidates.size - consumed
    }

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
