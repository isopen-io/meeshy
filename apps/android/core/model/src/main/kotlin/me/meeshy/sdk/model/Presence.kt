package me.meeshy.sdk.model

/** Presence dot state — port of PresenceState (PresenceModels.swift). */
enum class PresenceState {
    /** vert + pulse — connecté (isOnline backend) ou actif dans les 60 dernières secondes */
    ONLINE,

    /** vert — actif <= 5 min */
    RECENT,

    /** orange — actif entre 5 et 30 min */
    AWAY,

    /** gris — > 30 min, ou déconnecté sans lastActiveAt */
    OFFLINE,
}

/** A user's presence — port of UserPresence (PresenceModels.swift). */
data class UserPresence(
    val isOnline: Boolean = false,
    val lastActiveAt: String? = null,
) {
    /**
     * Resolve the presence state at a caller-supplied reference clock ([nowEpochMillis],
     * so the derivation stays pure and testable). Règle produit identique web/iOS
     * (source de vérité partagée : packages/shared/utils/user-presence.ts) :
     *   isOnline == true -> ONLINE (vert, pulse) — le flag backend est autoritatif
     *                       (maintenu par le gateway pour toute session active),
     *                       garde anti-stale : ignoré si lastActiveAt > 30 min
     *   <= 60s   -> ONLINE  (vert, pulse)
     *   <= 5min  -> RECENT  (vert)
     *   <= 30min -> AWAY    (orange)
     *   > 30min  -> OFFLINE (gris)
     * [lastActiveAt] est gelé par le gateway à la déconnexion, donc la décroissance
     * vert -> orange -> gris démarre au dernier instant d'activité réelle. Un
     * timestamp futur (élapsé négatif) reste [PresenceState.ONLINE].
     */
    fun state(nowEpochMillis: Long): PresenceState {
        val last = isoToEpochMillisOrNull(lastActiveAt)
            ?: return if (isOnline) PresenceState.ONLINE else PresenceState.OFFLINE
        val elapsed = nowEpochMillis - last
        if (isOnline && elapsed <= AWAY_WINDOW_MS) return PresenceState.ONLINE
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

        /** Fenêtre "actif récemment" (vert) — 5 min, parité web/iOS. */
        const val RECENT_WINDOW_MS: Long = 300_000L

        /** Fenêtre "absent" (orange) avant le gris hors ligne — 30 min. */
        const val AWAY_WINDOW_MS: Long = 1_800_000L
    }
}
