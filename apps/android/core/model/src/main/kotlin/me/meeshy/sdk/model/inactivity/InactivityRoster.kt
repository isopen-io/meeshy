package me.meeshy.sdk.model.inactivity

import java.time.Instant
import kotlinx.serialization.Serializable

/**
 * Les alertes d'inactivité qu'on me sert, par personne — la réduction PURE du magasin Android (#18738). Valeur
 * immuable : le magasin la remplace, il ne la mute pas. Même forme que `PhoneReachabilityRoster` (#18737).
 *
 * - `inactivity:alert` pose l'état ; un état d'un épisode plus ANCIEN que celui qu'on tient est ignoré (rejeu) ;
 * - `inactivity:cleared` l'efface ;
 * - le rattrapage (`GET /relations/inactivity`) fait foi, SAUF pour les personnes qu'un événement a touchées APRÈS le
 *   départ de la requête ([mark], [touched]) : un rattrapage parti avant un `inactivity:cleared` ne ressuscite rien.
 */
public data class InactivityRoster(
    val byUser: Map<String, InactivityAlertState> = emptyMap(),
    val mark: Long = 0L,
    val touched: Map<String, Long> = emptyMap(),
) {
    public fun stateOf(userId: String?): InactivityAlertState? = userId?.let(byUser::get)

    public fun apply(event: InactivityEvent): InactivityRoster = when (event) {
        is InactivityEvent.Alert -> receive(event.state)
        is InactivityEvent.Cleared -> clear(event.userId)
    }

    public fun receive(state: InactivityAlertState): InactivityRoster {
        val held = byUser[state.userId]
        if (held != null && held.inactiveSinceMillis > state.inactiveSinceMillis) return this
        return copy(byUser = byUser + (state.userId to state), mark = mark + 1, touched = touched + (state.userId to mark + 1))
    }

    public fun clear(userId: String): InactivityRoster =
        copy(byUser = byUser - userId, mark = mark + 1, touched = touched + (userId to mark + 1))

    /** Le rattrapage, parti quand le compteur valait [since] : il remplace tout, sauf qui a bougé depuis. */
    public fun reconcile(items: List<InactivityAlertState>, since: Long): InactivityRoster {
        val movedSince = touched.filterValues { it > since }.keys
        val served = items.filterNot { it.userId in movedSince }.associateBy { it.userId }
        val kept = byUser.filterKeys { it in movedSince }
        return copy(byUser = served + kept, touched = touched.filterValues { it > since })
    }
}

/** La forme rangée d'un état servi : ce que [served] relit à l'identique. */
@Serializable
public data class InactivityStoredState(
    val userId: String,
    val inactiveSince: String,
    val alertedAt: String,
    val lastPosition: InactivityLastPositionWire? = null,
    val lastBattery: InactivityLastBatteryWire? = null,
) {
    public fun served(): InactivityAlertState? {
        val since = inactiveSince.epochMillis() ?: return null
        val alerted = alertedAt.epochMillis() ?: return null
        if (userId.isBlank()) return null
        return InactivityAlertState(userId, since, alerted, lastPosition?.served(), lastBattery?.served())
    }
}

/**
 * Le dernier roster servi, rangé sur l'appareil PAR COMPTE : l'état se peint dès le démarrage à froid, hors ligne ou
 * sur un réseau lent. Un état plus vieux que le TTL du contrat (72 h) ne se repeint pas ; le rattrapage le remplace.
 */
@Serializable
public data class InactivityRosterSnapshot(
    val viewerId: String,
    val items: List<InactivityStoredState> = emptyList(),
) {
    public fun restore(
        viewerId: String?,
        nowMillis: Long,
        ttlMillis: Long = InactivityContract.STATE_TTL_MILLIS,
    ): InactivityRoster {
        if (viewerId == null || viewerId != this.viewerId) return InactivityRoster()
        val fresh = items.mapNotNull { it.served() }.filter { nowMillis - it.inactiveSinceMillis < ttlMillis }
        return InactivityRoster(byUser = fresh.associateBy { it.userId })
    }

    public companion object {
        public fun of(viewerId: String, roster: InactivityRoster): InactivityRosterSnapshot =
            InactivityRosterSnapshot(viewerId, roster.byUser.values.map { it.stored() })
    }
}

private fun Long.iso(): String = Instant.ofEpochMilli(this).toString()

/** La forme rangée d'un état servi. */
public fun InactivityAlertState.stored(): InactivityStoredState = InactivityStoredState(
    userId = userId,
    inactiveSince = inactiveSinceMillis.iso(),
    alertedAt = alertedAtMillis.iso(),
    lastPosition = lastPosition?.let { InactivityLastPositionWire(it.latitude, it.longitude, it.accuracy, it.recordedAtMillis.iso()) },
    lastBattery = lastBattery?.let { InactivityLastBatteryWire(it.level, it.measuredAtMillis.iso()) },
)
