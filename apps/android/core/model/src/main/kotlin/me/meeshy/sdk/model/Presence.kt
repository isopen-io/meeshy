package me.meeshy.sdk.model

/** Presence dot state — port of PresenceState (PresenceModels.swift). */
enum class PresenceState {
    /** vert + pulse — connecté (isOnline backend, <= 5 min) ou actif dans les 60 dernières secondes */
    ONLINE,

    /** orange — actif entre 1 et 3 min */
    AWAY,

    /** gris AFFICHÉ — actif entre 3 et 5 min */
    IDLE,

    /** > 5 min, ou déconnecté sans lastActiveAt — AUCUN dot n'est rendu */
    OFFLINE,
}

/** A user's presence — port of UserPresence (PresenceModels.swift). */
data class UserPresence(
    val isOnline: Boolean = false,
    val lastActiveAt: String? = null,
) {
    /**
     * Resolve the presence state at a caller-supplied reference clock ([nowEpochMillis],
     * so the derivation stays pure and testable). Règle produit 1/3/5 identique web/iOS
     * (source de vérité partagée : packages/shared/utils/user-presence.ts) :
     *   isOnline == true -> ONLINE (vert, pulse) — le flag backend est autoritatif
     *                       (maintenu par le gateway pour toute session connectée),
     *                       garde anti-stale : ignoré si lastActiveAt > 5 min
     *   <= 60s  -> ONLINE  (vert, pulse)
     *   <= 3min -> AWAY    (orange)
     *   <= 5min -> IDLE    (gris AFFICHÉ)
     *   > 5min  -> OFFLINE (aucun dot)
     * [lastActiveAt] est gelé par le gateway à la déconnexion, donc la décroissance
     * vert -> orange -> gris démarre au dernier instant d'activité réelle. Un
     * timestamp futur (élapsé négatif) reste [PresenceState.ONLINE].
     */
    fun state(nowEpochMillis: Long): PresenceState {
        val last = isoToEpochMillisOrNull(lastActiveAt)
            ?: return if (isOnline) PresenceState.ONLINE else PresenceState.OFFLINE
        val elapsed = nowEpochMillis - last
        if (isOnline && elapsed <= IDLE_WINDOW_MS) return PresenceState.ONLINE
        return when {
            elapsed <= ONLINE_WINDOW_MS -> PresenceState.ONLINE
            elapsed <= AWAY_WINDOW_MS -> PresenceState.AWAY
            elapsed <= IDLE_WINDOW_MS -> PresenceState.IDLE
            else -> PresenceState.OFFLINE
        }
    }

    companion object {
        /** Actif à l'instant (dot pulsant) — 60 s. */
        const val ONLINE_WINDOW_MS: Long = 60_000L

        /** Fenêtre "absent" (orange) — 3 min, parité web/iOS. */
        const val AWAY_WINDOW_MS: Long = 180_000L

        /** Fenêtre "inactif" (gris affiché) avant l'offline sans dot — 5 min. */
        const val IDLE_WINDOW_MS: Long = 300_000L
    }
}
