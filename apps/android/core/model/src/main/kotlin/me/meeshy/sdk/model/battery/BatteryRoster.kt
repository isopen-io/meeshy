package me.meeshy.sdk.model.battery

/**
 * Les états de batterie qu'on me sert, par personne — la réduction PURE du magasin Android (#14147). Valeur immuable :
 * le magasin la remplace, il ne la mute pas.
 *
 * - `battery:changed` pose l'état de la personne ; un état plus ANCIEN que celui qu'on tient est ignoré (rejeu, ordre
 *   d'arrivée) ;
 * - `battery:cleared` l'efface — l'icône disparaît ;
 * - le rattrapage (`GET /relations/battery`) fait foi, SAUF pour les personnes qu'un événement a touchées APRÈS le
 *   départ de la requête : [mark] date ce départ, [touched] retient qui a bougé depuis. Sans cela, un rattrapage parti
 *   avant un `battery:cleared` ressusciterait l'icône.
 */
public data class BatteryRoster(
    val byUser: Map<String, BatteryState> = emptyMap(),
    val mark: Long = 0L,
    val touched: Map<String, Long> = emptyMap(),
) {
    public fun stateOf(userId: String?): BatteryState? = userId?.let(byUser::get)

    public fun apply(event: BatteryEvent): BatteryRoster = when (event) {
        is BatteryEvent.Changed -> receive(event.state)
        is BatteryEvent.Cleared -> clear(event.userId)
    }

    public fun receive(state: BatteryState): BatteryRoster {
        val held = byUser[state.userId]
        if (held != null && held.measuredAtMillis > state.measuredAtMillis) return this
        return copy(byUser = byUser + (state.userId to state), mark = mark + 1, touched = touched + (state.userId to mark + 1))
    }

    public fun clear(userId: String): BatteryRoster =
        copy(byUser = byUser - userId, mark = mark + 1, touched = touched + (userId to mark + 1))

    /**
     * Le rattrapage, parti quand le compteur valait [since] : il remplace tout, sauf les personnes qu'un événement a
     * touchées depuis — leur état vivant (posé ou effacé) l'emporte.
     */
    public fun reconcile(items: List<BatteryState>, since: Long): BatteryRoster {
        val movedSince = touched.filterValues { it > since }.keys
        val served = items.filterNot { it.userId in movedSince }.associateBy { it.userId }
        val kept = byUser.filterKeys { it in movedSince }
        return copy(byUser = served + kept, touched = touched.filterValues { it > since })
    }
}
