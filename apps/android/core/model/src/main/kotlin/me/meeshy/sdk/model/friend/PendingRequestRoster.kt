package me.meeshy.sdk.model.friend

import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.UserUpdatedEvent

/**
 * Les lois pures de la liste des demandes en attente (iso `RequestsViewModel` d'iOS) : seules les demandes
 * `pending` sont listées, une page suivante n'apporte que ce qui n'est pas déjà affiché, et une ligne
 * refusée par la file revient SEULE à sa place (jamais un instantané de toute la liste).
 */
object PendingRequestRoster {
    private const val PENDING = "pending"

    /** Une demande sans statut servi reste affichée : la route est déjà filtrée `status=pending` côté serveur. */
    fun pendingOnly(requests: List<FriendRequest>): List<FriendRequest> =
        requests.filter { it.status.isBlank() || it.status == PENDING }

    /** Ajoute les demandes d'une page suivante sans reprendre celles déjà affichées. */
    fun appendingNew(shown: List<FriendRequest>, page: List<FriendRequest>): List<FriendRequest> {
        val known = shown.mapTo(HashSet()) { it.id }
        return shown + pendingOnly(page).filter { known.add(it.id) }
    }

    /** Remet [removed] à [index] (borné) ; une ligne déjà revenue n'est pas doublée. */
    fun restoring(removed: FriendRequest, index: Int, into: List<FriendRequest>): List<FriendRequest> {
        if (into.any { it.id == removed.id }) return into
        return into.toMutableList().apply { add(index.coerceIn(0, size), removed) }
    }

    /** Repeint les lignes touchées par [event] ; `null` quand aucune ne change (liste non republiée). */
    fun repainted(requests: List<FriendRequest>, event: UserUpdatedEvent): List<FriendRequest>? {
        var changed = false
        val next = requests.map { request -> event.repainted(request)?.also { changed = true } ?: request }
        return next.takeIf { changed }
    }
}

/** La place d'une ligne retirée de façon optimiste, pour la remettre seule si la file la refuse. */
data class RequestRemoval(val request: FriendRequest, val index: Int) {
    companion object {
        fun of(requestId: String, requests: List<FriendRequest>): RequestRemoval? {
            val index = requests.indexOfFirst { it.id == requestId }
            return if (index < 0) null else RequestRemoval(requests[index], index)
        }
    }
}

/**
 * Ce qu'un changement du graphe d'amitié, vu d'ailleurs que cet écran, signifie pour les listes :
 * [arrived] = ids apparus (une demande reçue en direct : relire), [returned] = ids revenus après un
 * retour arrière de la file (remettre la ligne retirée), [gone] = ids partis (acceptée ou annulée ailleurs).
 */
data class PendingGraphDelta(
    val arrived: Set<String>,
    val returned: Set<String>,
    val gone: Set<String>,
) {
    val isEmpty: Boolean get() = arrived.isEmpty() && returned.isEmpty() && gone.isEmpty()

    companion object {
        fun between(previous: Set<String>, current: Set<String>, removedByUs: Set<String>): PendingGraphDelta {
            val gained = current - previous
            return PendingGraphDelta(
                arrived = gained - removedByUs,
                returned = gained intersect removedByUs,
                gone = previous - current,
            )
        }
    }
}
