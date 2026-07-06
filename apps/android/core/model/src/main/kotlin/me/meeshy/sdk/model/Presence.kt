package me.meeshy.sdk.model

/** Presence dot state — port of PresenceState (PresenceModels.swift). */
enum class PresenceState {
    /** green — lastActive < 5min */
    ONLINE,

    /** orange — lastActive > 5min but isOnline */
    AWAY,

    /** no dot */
    OFFLINE,
}

/** A user's presence — port of UserPresence (PresenceModels.swift). */
data class UserPresence(
    val isOnline: Boolean = false,
    val lastActiveAt: String? = null,
) {
    /**
     * Resolve the presence dot at a caller-supplied reference clock ([nowEpochMillis],
     * so the derivation stays pure and testable). Port of the iOS `UserPresence.state`:
     * an offline user shows no dot; an online user with no reliable [lastActiveAt]
     * (absent, blank or unparseable) is [PresenceState.ONLINE]; otherwise the dot turns
     * [PresenceState.AWAY] once the last activity is more than [AWAY_THRESHOLD_MS] old.
     * A future or exactly-at-threshold timestamp stays [PresenceState.ONLINE].
     */
    fun state(nowEpochMillis: Long): PresenceState {
        if (!isOnline) return PresenceState.OFFLINE
        val last = isoToEpochMillisOrNull(lastActiveAt) ?: return PresenceState.ONLINE
        return if (nowEpochMillis - last > AWAY_THRESHOLD_MS) PresenceState.AWAY else PresenceState.ONLINE
    }

    companion object {
        /** Idle window before an online user is shown as away — 5 minutes, iOS parity (300s). */
        const val AWAY_THRESHOLD_MS: Long = 300_000L
    }
}
