package me.meeshy.sdk.model.relation

/** La position qu'une personne me partage, CHEZ MOI : telle que servie, et jusqu'à quand au plus (horloge de l'appareil). */
public data class SharedLocationEntry(
    val latitude: Double,
    val longitude: Double,
    val precision: SharedLocationPrecision,
    val radiusMeters: Double,
    val circle: SharedLocationCircle?,
    val updatedAtMillis: Long,
    val deadlineMillis: Long,
)

/**
 * LES POSITIONS QU'ON ME PARTAGE, SUR ANDROID (#16985) — la réduction PURE, iso `SharedLocationsLive.swift` (#16983) et
 * `shared-locations-live.ts` (#16984). Le branchement (socket, rattrapage, minuteur) vit dans le SDK ; ici, rien ne
 * dépend d'Android, et chaque transition rend un nouvel état.
 *
 * - [receive] REMPLACE la position gardée d'une personne, telle que servie : une montée de précision la rend plus fine
 *   sans recharger, une baisse la rend plus grossière. Une position plus ancienne que celle gardée n'écrase rien.
 * - [clear] l'efface (`location:share-ended` : arrêt, baisse sous Ami, blocage, retrait).
 * - Sans nouvel envoi, la position s'éteint au PLUS TÔT de deux bornes : `expiresAt`, le terme choisi par l'émetteur (une
 *   position ancienne rejouée par un rattrapage ne lui survit pas), et sa durée de vie servie comptée à l'horloge de
 *   l'APPAREIL depuis la réception (une horloge en retard ne la prolonge pas), jamais au-delà des 8 h.
 * - [reconcile] : le rattrapage FAIT FOI dans son emprise à l'instant où il est parti ([mark]) — une fin survenue pendant
 *   la coupure efface la position ; ce qui est arrivé pendant la demande reste ; hors de l'emprise, rien ne bouge.
 * - Ma propre position (un autre de mes appareils) ne s'affiche pas.
 *
 * Le serveur a déjà jugé (niveau, consentement, blocage, précision) : cet état ne rejuge rien, ne rend rien plus précis
 * que servi, et ne s'écrit nulle part sur le disque.
 */
public data class SharedLocationsState(
    val byUser: Map<String, SharedLocationEntry> = emptyMap(),
    val arrivals: Int = 0,
    val arrivedAt: Map<String, Int> = emptyMap(),
) {
    /** Le repère d'une demande de rattrapage : ce qui arrive APRÈS lui n'est pas effacé par sa réponse. */
    val mark: Int get() = arrivals

    /** La prochaine échéance à laquelle le minuteur doit éteindre une position, ou `null` s'il n'y a rien. */
    val nextDeadlineMillis: Long? get() = byUser.values.minOfOrNull { it.deadlineMillis }

    public fun receive(location: SharedLocation, viewerId: String?, nowMillis: Long): SharedLocationsState {
        if (viewerId != null && location.userId.equals(viewerId, ignoreCase = true)) return this
        val kept = byUser[location.userId]
        if (kept != null && location.updatedAtMillis < kept.updatedAtMillis) return this
        val deadline = minOf(nowMillis + location.lifetimeMillis, location.expiresAtMillis)
        if (deadline <= nowMillis) return clear(location.userId)
        val arrival = arrivals + 1
        val entry = SharedLocationEntry(
            latitude = location.latitude,
            longitude = location.longitude,
            precision = location.precision,
            radiusMeters = location.radiusMeters,
            circle = location.circle,
            updatedAtMillis = location.updatedAtMillis,
            deadlineMillis = deadline,
        )
        return copy(byUser = byUser + (location.userId to entry), arrivals = arrival, arrivedAt = arrivedAt + (location.userId to arrival))
    }

    public fun clear(userId: String): SharedLocationsState =
        if (userId !in byUser && userId !in arrivedAt) this else copy(byUser = byUser - userId, arrivedAt = arrivedAt - userId)

    public fun reconcile(
        items: List<SharedLocation>,
        mark: Int,
        bounds: SharedLocationBounds?,
        viewerId: String?,
        nowMillis: Long,
    ): SharedLocationsState {
        val served = items.map { it.userId }.toSet()
        val gone = byUser.filter { (userId, entry) ->
            userId !in served &&
                (arrivedAt[userId] ?: 0) <= mark &&
                (bounds?.contains(entry.latitude, entry.longitude) ?: true)
        }.keys
        val cleared = gone.fold(this) { state, userId -> state.clear(userId) }
        return items.fold(cleared) { state, item -> state.receive(item, viewerId, nowMillis) }
    }

    /** Ce qui a passé son échéance s'éteint — le minuteur l'appelle, sans événement du serveur. */
    public fun expireDue(nowMillis: Long): SharedLocationsState =
        byUser.filterValues { it.deadlineMillis <= nowMillis }.keys.fold(this) { state, userId -> state.clear(userId) }
}
