package me.meeshy.sdk.model.fall

import java.time.Instant
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.inactivity.InactivityLastBatteryWire

/**
 * Les chutes qu'on me sert, par personne — la réduction PURE du magasin Android (#18748). Valeur immuable. Même forme
 * que `InactivityRoster` (#18738), avec une différence : un état n'est lu que tant que son `expiresAt` n'est pas passé
 * (l'expiration est silencieuse côté serveur, c'est le client qui la respecte).
 *
 * - `fall:detected` pose l'état ; une chute plus ANCIENNE que celle tenue est ignorée (rejeu) ;
 * - `fall:cleared` l'efface ;
 * - le rattrapage (`GET /relations/falls`) fait foi, SAUF pour qui un événement a touché APRÈS le départ de la requête.
 */
public data class FallRoster(
    val byUser: Map<String, FallState> = emptyMap(),
    val mark: Long = 0L,
    val touched: Map<String, Long> = emptyMap(),
) {
    public fun stateOf(userId: String?, nowMillis: Long): FallState? =
        userId?.let(byUser::get)?.takeIf { it.isLive(nowMillis) }

    public fun apply(event: FallEvent): FallRoster = when (event) {
        is FallEvent.Detected -> receive(event.state)
        is FallEvent.Cleared -> clear(event.userId)
    }

    public fun receive(state: FallState): FallRoster {
        val held = byUser[state.userId]
        if (held != null && held.detectedAtMillis > state.detectedAtMillis) return this
        return copy(byUser = byUser + (state.userId to state), mark = mark + 1, touched = touched + (state.userId to mark + 1))
    }

    public fun clear(userId: String): FallRoster =
        copy(byUser = byUser - userId, mark = mark + 1, touched = touched + (userId to mark + 1))

    /** Le rattrapage, parti quand le compteur valait [since] : il remplace tout, sauf qui a bougé depuis. */
    public fun reconcile(items: List<FallState>, since: Long): FallRoster {
        val movedSince = touched.filterValues { it > since }.keys
        val served = items.filterNot { it.userId in movedSince }.associateBy { it.userId }
        val kept = byUser.filterKeys { it in movedSince }
        return copy(byUser = served + kept, touched = touched.filterValues { it > since })
    }
}

/** La forme rangée d'un état servi : SANS position, jamais (#16984, leçon de TEL-02). */
@Serializable
public data class FallStoredState(
    val userId: String,
    val detectedAt: String,
    val expiresAt: String,
    val lastBattery: InactivityLastBatteryWire? = null,
) {
    public fun served(): FallState? {
        val detected = detectedAt.fallMillis() ?: return null
        val expires = expiresAt.fallMillis() ?: return null
        if (userId.isBlank()) return null
        return FallState(userId, detected, expires, lastPosition = null, lastBattery = lastBattery?.served())
    }
}

/**
 * Le dernier roster servi, rangé sur l'appareil PAR COMPTE : l'état se peint dès le démarrage à froid. Un état dont
 * l'expiration est passée ne se repeint pas ; un autre compte ne relit rien ; la position n'y est jamais.
 */
@Serializable
public data class FallRosterSnapshot(
    val viewerId: String,
    val items: List<FallStoredState> = emptyList(),
) {
    public fun restore(viewerId: String?, nowMillis: Long): FallRoster {
        if (viewerId == null || viewerId != this.viewerId) return FallRoster()
        val live = items.mapNotNull { it.served() }.filter { it.isLive(nowMillis) }
        return FallRoster(byUser = live.associateBy { it.userId })
    }

    public companion object {
        public fun of(viewerId: String, roster: FallRoster): FallRosterSnapshot =
            FallRosterSnapshot(viewerId, roster.byUser.values.map { it.stored() })
    }
}

private fun Long.iso(): String = Instant.ofEpochMilli(this).toString()

/** La forme rangée : la dernière POSITION ne quitte jamais la mémoire, le rattrapage de la connexion la rend. */
public fun FallState.stored(): FallStoredState = FallStoredState(
    userId = userId,
    detectedAt = detectedAtMillis.iso(),
    expiresAt = expiresAtMillis.iso(),
    lastBattery = lastBattery?.let { InactivityLastBatteryWire(it.level, it.measuredAtMillis.iso()) },
)
