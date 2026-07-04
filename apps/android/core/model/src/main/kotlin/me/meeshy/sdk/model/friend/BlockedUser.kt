package me.meeshy.sdk.model.friend

import kotlinx.serialization.Serializable

/**
 * A user the current account has blocked, as returned by
 * `GET /users/me/blocked-users`. Port of the iOS `BlockedUser`
 * (`BlockService.swift`). [blockedAt] is kept as the raw ISO-8601 string so this
 * module stays date-dependency-free (mirrors [me.meeshy.sdk.model.CallRecord]).
 */
@Serializable
data class BlockedUser(
    val id: String,
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
    val blockedAt: String? = null,
)

/**
 * The best human-readable name for a blocked user: an explicit display name when
 * present, else the username. Pure SSOT so every surface (list cell, avatar seed,
 * confirm dialog) resolves the same label. Port of the iOS `BlockedUser.name`.
 */
val BlockedUser.resolvedName: String
    get() = displayName?.takeIf { it.isNotBlank() } ?: username
