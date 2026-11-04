package me.meeshy.sdk.model.mood

/**
 * La porte de l'humeur hors ligne : quand un échec de publication part en file, et quand une humeur restée en file
 * est reprise comme brouillon (remplacement sans doublon).
 */
object MoodDoor {
    /** Une humeur bloquée plus longtemps que cela revient dans le composeur. */
    const val STUCK_AFTER_MILLIS = 60_000L

    /** Sans réponse du tout (réseau absent) la publication attend dans la file ; un refus de la passerelle se dit. */
    fun queuesOnFailure(httpStatus: Int?): Boolean = httpStatus == null

    fun isStuck(enqueuedAtMillis: Long, nowMillis: Long): Boolean = nowMillis - enqueuedAtMillis > STUCK_AFTER_MILLIS

    /** Ce que le composeur fait d'une humeur bloquée. */
    data class Recovery(val cmidToReplace: String)

    /**
     * Les humeurs en file, `(cmid, mise en file)` : la plus ancienne bloquée est reprise ; son `cmid` est remplacé par
     * le nouvel envoi, jamais dupliqué. `null` : rien à reprendre.
     */
    fun recovery(queued: List<Pair<String, Long>>, nowMillis: Long): Recovery? =
        queued.filter { isStuck(it.second, nowMillis) }.minByOrNull { it.second }?.let { Recovery(it.first) }
}
