package me.meeshy.sdk.model.sync

/**
 * Le point de reprise de la synchronisation d'UN compte — miroir de `SyncCheckpoint` (iOS, #8674).
 * Un compte quitté sans être oublié emporte ses trois horloges (époque en millisecondes) : à son
 * retour, le delta repart d'où il s'était arrêté au lieu de tout recharger.
 */
data class SyncCheckpoint(
    val lastSync: Long? = null,
    val lastCleanup: Long? = null,
    val lastFullReconcile: Long? = null,
) {
    /** Une synchro réussie à [now] ; l'élagage et la réconciliation complète n'avancent que s'ils ont eu lieu. */
    fun advanced(now: Long, pruned: Boolean, fullReconcile: Boolean): SyncCheckpoint = copy(
        lastSync = now,
        lastCleanup = if (pruned) now else lastCleanup,
        lastFullReconcile = if (fullReconcile) now else lastFullReconcile,
    )

    companion object {
        val EMPTY = SyncCheckpoint()
    }
}
