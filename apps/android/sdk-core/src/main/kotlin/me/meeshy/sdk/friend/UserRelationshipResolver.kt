package me.meeshy.sdk.friend

import me.meeshy.sdk.model.friend.UserRelationshipRules
import me.meeshy.sdk.model.friend.UserRelationshipState

/**
 * Reports whether the current user has blocked a given user. A functional seam
 * (rather than a hard dependency on a block service that Android does not ship
 * yet) so the resolver stays testable and a future `BlockRepository` plugs in
 * without touching this class. Mirrors iOS `BlockServiceProviding.isBlocked`.
 */
fun interface BlockStatusProvider {
    fun isBlocked(userId: String): Boolean
}

/**
 * Combines the in-memory [FriendshipCache], block state and self-identity into
 * the single [UserRelationshipState] every profile-rendering surface reads.
 * Port of the iOS `UserRelationshipResolver` — synchronous and cheap (all three
 * inputs are local), so it can be called on every render. The precedence lives
 * in the pure [UserRelationshipRules]; this class only supplies the live inputs.
 */
class UserRelationshipResolver(
    private val friendshipCache: FriendshipCache,
    private val blockStatus: BlockStatusProvider,
    private val currentUserId: () -> String?,
) {
    fun resolve(userId: String): UserRelationshipState =
        UserRelationshipRules.resolve(
            targetUserId = userId,
            currentUserId = currentUserId(),
            isBlocked = if (userId.isBlank()) false else blockStatus.isBlocked(userId),
            friendship = friendshipCache.status(userId),
        )
}
