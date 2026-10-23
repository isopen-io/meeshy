package me.meeshy.sdk.model.session

/**
 * Le retrait optimiste d'une ou plusieurs sessions, et sa remise EXACTE si l'appel échoue.
 * Miroir de `revokeSession` / `revokeAllOtherSessions` et d'`OptimisticRollback.restoring`.
 *
 * On défait CES retraits, pas l'écran d'avant l'attente : une relecture arrivée entre-temps (ou
 * une session déjà revenue) reste.
 */
public object SessionsListReducer {

    public data class Removed(val session: UserSession, val index: Int)

    public data class Outcome(val sessions: List<UserSession>, val removed: List<Removed>)

    /** Retire [sessionId] ; la courante et un id inconnu sont inertes. */
    public fun revoke(sessions: List<UserSession>, sessionId: String): Outcome {
        val index = sessions.indexOfFirst { it.id == sessionId }
        if (index < 0 || sessions[index].isCurrentSession) return Outcome(sessions, emptyList())
        return Outcome(
            sessions = sessions.filterIndexed { i, _ -> i != index },
            removed = listOf(Removed(sessions[index], index)),
        )
    }

    /** Ne garde que la courante. */
    public fun revokeOthers(sessions: List<UserSession>): Outcome {
        val removed = sessions.mapIndexedNotNull { i, s -> if (s.isCurrentSession) null else Removed(s, i) }
        return Outcome(sessions.filter { it.isCurrentSession }, removed)
    }

    /** Remet chaque session retirée à son index d'origine (borné), sauf si elle est déjà revenue. */
    public fun restore(sessions: List<UserSession>, removed: List<Removed>): List<UserSession> =
        removed.sortedBy { it.index }.fold(sessions) { acc, r ->
            if (acc.any { it.id == r.session.id }) acc
            else acc.toMutableList().apply { add(r.index.coerceIn(0, size), r.session) }
        }
}
