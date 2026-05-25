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
)
