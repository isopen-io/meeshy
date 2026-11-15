package me.meeshy.sdk.model.sync

/** L'état de coordination du moteur de synchro — miroir de `SyncEngineState` (iOS). */
data class SyncEngineState(
    val lastDeltaSyncAt: Long = 0L,
    val reconnectCatchUpPending: Boolean = false,
) {
    /** Consomme le rattrapage de reconnexion : rend s'il était dû, et l'état où il ne l'est plus. */
    fun takingReconnectCatchUp(): Pair<Boolean, SyncEngineState> =
        reconnectCatchUpPending to copy(reconnectCatchUpPending = false)

    fun requestingReconnectCatchUp(): SyncEngineState = copy(reconnectCatchUpPending = true)

    /** Anti-rafale : un déclenchement à moins de [COOLDOWN_MILLIS] du dernier est absorbé, sauf un rattrapage dû. */
    fun absorbs(now: Long, catchUp: Boolean): Boolean = !catchUp && now - lastDeltaSyncAt < COOLDOWN_MILLIS

    fun startedAt(now: Long): SyncEngineState = copy(lastDeltaSyncAt = now)

    /** Un échec ne compte pas dans l'anti-rafale : le signal suivant doit pouvoir retenter. */
    fun failed(): SyncEngineState = copy(lastDeltaSyncAt = 0L)

    companion object {
        const val COOLDOWN_MILLIS: Long = 3_000L
        const val MAX_PASSES: Int = 3
    }
}
