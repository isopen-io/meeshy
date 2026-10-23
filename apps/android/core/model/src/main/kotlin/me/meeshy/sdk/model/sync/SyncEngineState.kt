package me.meeshy.sdk.model.sync

/** L'état de coordination du moteur de synchro — miroir de `SyncEngineState` (iOS). */
data class SyncEngineState(
    val lastDeltaSyncAt: Long = 0L,
    val reconnectCatchUpPending: Boolean = false,
) {
    /** Consomme le rattrapage de reconnexion : rend s'il était dû, et l'état où il ne l'est plus. */
    fun takingReconnectCatchUp(): Pair<Boolean, SyncEngineState> =
        reconnectCatchUpPending to copy(reconnectCatchUpPending = false)
}
