package me.meeshy.sdk.model

/** Presence dot state — port of PresenceState (PresenceModels.swift). */
enum class PresenceState {
    /** orange + pulse — actif dans les 60 dernières secondes */
    ONLINE,

    /** orange — actif <= 5 min */
    RECENT,

    /** gris — actif entre 5 et 30 min */
    AWAY,

    /** no dot — > 30 min, ou déconnecté sans lastActiveAt */
    OFFLINE,
}

/** A user's presence — port of UserPresence (PresenceModels.swift). */
data class UserPresence(
    val isOnline: Boolean = false,
    val lastActiveAt: String? = null,
) {
    /**
     * Resolve the presence dot at a caller-supplied reference clock ([nowEpochMillis],
     * so the derivation stays pure and testable). Règle produit identique web/iOS,
     * décroissance temporelle pure sur [lastActiveAt] (gelé par le gateway à la
     * déconnexion) :
     *   <= 60s   -> ONLINE  (orange, pulse)
     *   <= 5min  -> RECENT  (orange)
     *   <= 30min -> AWAY    (gris)
     *   > 30min  -> OFFLINE (aucun dot)
     * [isOnline] ne sert que de fallback quand [lastActiveAt] est absent, blank ou
     * illisible. Un timestamp futur (élapsé négatif) reste [PresenceState.ONLINE].
     */
    fun state(nowEpochMillis: Long): PresenceState {
        val last = isoToEpochMillisOrNull(lastActiveAt)
            ?: return if (isOnline) PresenceState.ONLINE else PresenceState.OFFLINE
        val elapsed = nowEpochMillis - last
        return when {
            elapsed <= ONLINE_WINDOW_MS -> PresenceState.ONLINE
            elapsed <= RECENT_WINDOW_MS -> PresenceState.RECENT
            elapsed <= AWAY_WINDOW_MS -> PresenceState.AWAY
            else -> PresenceState.OFFLINE
        }
    }

    companion object {
        /** Actif à l'instant (dot pulsant) — 60 s. */
        const val ONLINE_WINDOW_MS: Long = 60_000L

        /** Fenêtre "actif récemment" (orange) — 5 min, parité web/iOS. */
        const val RECENT_WINDOW_MS: Long = 300_000L

        /** Fenêtre "absent" (gris) avant de ne plus rien afficher — 30 min. */
        const val AWAY_WINDOW_MS: Long = 1_800_000L
    }
}
