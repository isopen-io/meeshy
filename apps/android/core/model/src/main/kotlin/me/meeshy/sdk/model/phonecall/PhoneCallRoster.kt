package me.meeshy.sdk.model.phonecall

import java.time.Instant
import kotlinx.serialization.Serializable

/**
 * Les états « en appel » qu'on me sert, par personne — la réduction PURE du magasin Android (#18753). Valeur immuable :
 * le magasin la remplace, il ne la mute pas. Leçons des audits de #18738, appliquées d'emblée :
 *
 * - `phone-call:started` REMPLACE l'état tenu, jamais ne le fusionne (une mise à jour silencieuse porte l'état entier) ;
 * - `phone-call:ended` l'efface ;
 * - le rattrapage (`GET /relations/phone-calls`) fait foi, SAUF pour les personnes qu'un événement a touchées APRÈS le
 *   départ de la requête ([mark], [touched]) : un rattrapage parti avant un `phone-call:ended` ne ressuscite rien ;
 * - un état expiré ([PhoneCallState.expiresAtMillis] passé) ne se lit plus ([stateOf]).
 */
public data class PhoneCallRoster(
    val byUser: Map<String, PhoneCallState> = emptyMap(),
    val mark: Long = 0L,
    val touched: Map<String, Long> = emptyMap(),
) {
    /** L'état servi de [userId], seulement s'il n'a pas expiré à [nowMillis]. */
    public fun stateOf(userId: String?, nowMillis: Long): PhoneCallState? =
        userId?.let(byUser::get)?.takeIf { it.isLiveAt(nowMillis) }

    public fun apply(event: PhoneCallEvent): PhoneCallRoster = when (event) {
        is PhoneCallEvent.Started -> receive(event.state)
        is PhoneCallEvent.Ended -> clear(event.userId)
    }

    public fun receive(state: PhoneCallState): PhoneCallRoster =
        copy(byUser = byUser + (state.userId to state), mark = mark + 1, touched = touched + (state.userId to mark + 1))

    public fun clear(userId: String): PhoneCallRoster =
        copy(byUser = byUser - userId, mark = mark + 1, touched = touched + (userId to mark + 1))

    /** Le rattrapage, parti quand le compteur valait [since] : il remplace tout, sauf qui a bougé depuis. */
    public fun reconcile(items: List<PhoneCallState>, since: Long): PhoneCallRoster {
        val movedSince = touched.filterValues { it > since }.keys
        val served = items.filterNot { it.userId in movedSince }.associateBy { it.userId }
        val kept = byUser.filterKeys { it in movedSince }
        return copy(byUser = served + kept, touched = touched.filterValues { it > since })
    }
}

/** La forme rangée d'un état servi : ce que [served] relit à l'identique. */
@Serializable
public data class PhoneCallStoredState(
    val userId: String,
    val since: String,
    val expiresAt: String,
) {
    public fun served(): PhoneCallState? = PhoneCallStateWire(userId, since, expiresAt).served()
}

/**
 * Le dernier roster servi, rangé sur l'appareil PAR COMPTE : l'état se peint dès le démarrage à froid. Un état expiré ne
 * se repeint pas ; le rattrapage de la connexion remplace le reste.
 */
@Serializable
public data class PhoneCallRosterSnapshot(
    val viewerId: String,
    val items: List<PhoneCallStoredState> = emptyList(),
) {
    public fun restore(viewerId: String?, nowMillis: Long): PhoneCallRoster {
        if (viewerId == null || viewerId != this.viewerId) return PhoneCallRoster()
        val live = items.mapNotNull { it.served() }.filter { it.isLiveAt(nowMillis) }
        return PhoneCallRoster(byUser = live.associateBy { it.userId })
    }

    public companion object {
        public fun of(viewerId: String, roster: PhoneCallRoster): PhoneCallRosterSnapshot =
            PhoneCallRosterSnapshot(viewerId, roster.byUser.values.map { it.stored() })
    }
}

private fun Long.iso(): String = Instant.ofEpochMilli(this).toString()

public fun PhoneCallState.stored(): PhoneCallStoredState = PhoneCallStoredState(userId, sinceMillis.iso(), expiresAtMillis.iso())
