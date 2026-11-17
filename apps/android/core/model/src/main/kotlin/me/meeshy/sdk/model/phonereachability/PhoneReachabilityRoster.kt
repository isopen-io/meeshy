package me.meeshy.sdk.model.phonereachability

import java.time.Instant
import kotlinx.serialization.Serializable

/**
 * Les téléphones injoignables qu'on me sert, par personne — la réduction PURE du magasin Android (#18737). Valeur
 * immuable : le magasin la remplace, il ne la mute pas. Même forme que `BatteryRoster` (#14147).
 *
 * - `phone:unreachable` pose l'état ; un état d'un épisode plus ANCIEN que celui qu'on tient est ignoré (rejeu) ;
 * - `phone:reachable` l'efface — le glyphe disparaît ;
 * - le rattrapage (`GET /relations/phone-reachability`) fait foi, SAUF pour les personnes qu'un événement a touchées
 *   APRÈS le départ de la requête ([mark], [touched]) : un rattrapage parti avant un `phone:reachable` ne ressuscite pas
 *   le glyphe.
 */
public data class PhoneReachabilityRoster(
    val byUser: Map<String, PhoneReachabilityState> = emptyMap(),
    val mark: Long = 0L,
    val touched: Map<String, Long> = emptyMap(),
) {
    public fun stateOf(userId: String?): PhoneReachabilityState? = userId?.let(byUser::get)

    public fun apply(event: PhoneReachabilityEvent): PhoneReachabilityRoster = when (event) {
        is PhoneReachabilityEvent.Unreachable -> receive(event.state)
        is PhoneReachabilityEvent.Reachable -> clear(event.userId)
    }

    public fun receive(state: PhoneReachabilityState): PhoneReachabilityRoster {
        val held = byUser[state.userId]
        if (held != null && held.unreachableSinceMillis > state.unreachableSinceMillis) return this
        return copy(byUser = byUser + (state.userId to state), mark = mark + 1, touched = touched + (state.userId to mark + 1))
    }

    public fun clear(userId: String): PhoneReachabilityRoster =
        copy(byUser = byUser - userId, mark = mark + 1, touched = touched + (userId to mark + 1))

    /** Le rattrapage, parti quand le compteur valait [since] : il remplace tout, sauf qui a bougé depuis. */
    public fun reconcile(items: List<PhoneReachabilityState>, since: Long): PhoneReachabilityRoster {
        val movedSince = touched.filterValues { it > since }.keys
        val served = items.filterNot { it.userId in movedSince }.associateBy { it.userId }
        val kept = byUser.filterKeys { it in movedSince }
        return copy(byUser = served + kept, touched = touched.filterValues { it > since })
    }
}

/**
 * Le dernier roster servi, rangé sur l'appareil PAR COMPTE : le glyphe se peint dès le démarrage à froid, hors ligne
 * ou sur un réseau lent. Un état plus vieux que le TTL du contrat (72 h) ne se repeint pas ; le rattrapage le remplace.
 */
@Serializable
public data class PhoneReachabilityRosterSnapshot(
    val viewerId: String,
    val items: List<PhoneReachabilityStateWire> = emptyList(),
) {
    public fun restore(
        viewerId: String?,
        nowMillis: Long,
        ttlMillis: Long = PhoneReachabilityContract.STATE_TTL_MILLIS,
    ): PhoneReachabilityRoster {
        if (viewerId == null || viewerId != this.viewerId) return PhoneReachabilityRoster()
        val fresh = items.mapNotNull { it.served() }.filter { nowMillis - it.unreachableSinceMillis < ttlMillis }
        return PhoneReachabilityRoster(byUser = fresh.associateBy { it.userId })
    }

    public companion object {
        public fun of(viewerId: String, roster: PhoneReachabilityRoster): PhoneReachabilityRosterSnapshot =
            PhoneReachabilityRosterSnapshot(viewerId, roster.byUser.values.map { it.wire() })
    }
}

/** La forme de fil d'un état servi : ce que [PhoneReachabilityStateWire.served] relit à l'identique. */
public fun PhoneReachabilityState.wire(): PhoneReachabilityStateWire = PhoneReachabilityStateWire(
    userId = userId,
    unreachableSince = Instant.ofEpochMilli(unreachableSinceMillis).toString(),
    cause = cause.wire,
)
