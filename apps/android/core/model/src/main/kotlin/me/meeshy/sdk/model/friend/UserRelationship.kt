package me.meeshy.sdk.model.friend

/**
 * How a friend request between the current user and another user stands, from
 * the current user's point of view. Port of the iOS `FriendshipStatus`
 * (`FriendshipCache.swift`) — the raw friendship half, before block state is
 * folded in.
 */
sealed interface FriendshipStatus {
    /** An accepted, two-way friendship. */
    data object Friend : FriendshipStatus

    /** The current user sent a request that is still pending. */
    data class PendingSent(val requestId: String) : FriendshipStatus

    /** The current user received a request that is still pending. */
    data class PendingReceived(val requestId: String) : FriendshipStatus

    /** No friend relationship in either direction. */
    data object None : FriendshipStatus
}

/**
 * Single source of truth for "how does the current user relate to this other
 * user?" — combines friendship status with block state and self-identity so
 * every profile-rendering surface (Discover, Contacts cells, profile sheet,
 * mentions, …) shows the same state without reimplementing the rules. Port of
 * the iOS `UserRelationshipState` (`UserRelationshipState.swift`).
 */
sealed interface UserRelationshipState {
    /** The target id is the currently authenticated user. */
    data object Current : UserRelationshipState

    /** The current user has blocked this user. */
    data object Blocked : UserRelationshipState

    /** Accepted friend. */
    data object Connected : UserRelationshipState

    /** Current user sent a friend request that is still pending. */
    data class PendingSent(val requestId: String) : UserRelationshipState

    /** Current user received a friend request that is still pending. */
    data class PendingReceived(val requestId: String) : UserRelationshipState

    /** No relationship. */
    data object None : UserRelationshipState

    /** Does this state represent any kind of pending friend request? */
    val isPending: Boolean
        get() = this is PendingSent || this is PendingReceived
}

/**
 * The pure precedence SSOT that folds self-identity, block state and friendship
 * status into a single [UserRelationshipState]. Kept framework-agnostic and
 * total so it can be unit-tested without the stateful cache or a block service;
 * the `:sdk-core` `UserRelationshipResolver` is the thin stateful wiring over it.
 *
 * Precedence (faithful to iOS `UserRelationshipResolver.resolve`):
 * 1. a blank target id resolves to [UserRelationshipState.None] (an untargetable
 *    lookup, never "you");
 * 2. the current user wins over everything else — even a stale block/friendship;
 * 3. block state wins over friendship — a blocked user never renders as a
 *    contact, even if the friendship cache still lists them as a friend;
 * 4. otherwise the friendship status maps straight through.
 */
object UserRelationshipRules {

    fun resolve(
        targetUserId: String,
        currentUserId: String?,
        isBlocked: Boolean,
        friendship: FriendshipStatus,
    ): UserRelationshipState {
        if (targetUserId.isBlank()) return UserRelationshipState.None
        if (currentUserId != null && currentUserId == targetUserId) return UserRelationshipState.Current
        if (isBlocked) return UserRelationshipState.Blocked
        return when (friendship) {
            is FriendshipStatus.Friend -> UserRelationshipState.Connected
            is FriendshipStatus.PendingSent -> UserRelationshipState.PendingSent(friendship.requestId)
            is FriendshipStatus.PendingReceived -> UserRelationshipState.PendingReceived(friendship.requestId)
            is FriendshipStatus.None -> UserRelationshipState.None
        }
    }
}
