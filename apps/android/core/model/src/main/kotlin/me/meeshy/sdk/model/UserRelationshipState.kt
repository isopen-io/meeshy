package me.meeshy.sdk.model

/**
 * How the current user relates to another user — port of UserRelationshipState
 * (UserRelationshipState.swift). Combines friendship status with block state.
 */
sealed class UserRelationshipState {
    /** The userId is the currently authenticated user. */
    data object Current : UserRelationshipState()

    /** The currently authenticated user has blocked this user. */
    data object Blocked : UserRelationshipState()

    /** Accepted friend. */
    data object Connected : UserRelationshipState()

    /** Current user sent a friend request that is still pending. */
    data class PendingSent(val requestId: String) : UserRelationshipState()

    /** Current user received a friend request that is still pending. */
    data class PendingReceived(val requestId: String) : UserRelationshipState()

    /** No relationship. */
    data object None : UserRelationshipState()

    /** Whether this state represents any kind of pending request. */
    val isPending: Boolean
        get() = this is PendingSent || this is PendingReceived
}
