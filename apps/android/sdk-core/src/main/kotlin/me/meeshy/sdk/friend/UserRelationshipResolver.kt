package me.meeshy.sdk.friend

import me.meeshy.sdk.model.friend.UserRelationshipRules
import me.meeshy.sdk.model.friend.UserRelationshipState

/**
 * Reports whether the current user has blocked a given user. A functional seam
 * so the resolver stays testable without the live [BlockCache]; production
 * binds it to [BlockCache.isBlocked] through [UserRelationshipResolver.wiredTo].
 * Mirrors iOS `BlockServiceProviding.isBlocked`.
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

    companion object {
        /**
         * The production wiring — the live [FriendshipCache] and [BlockCache] — in ONE
         * place, so Discover, the Contacts list, the profile sheet and mention
         * suggestions resolve a person to the SAME one of the six states instead of each
         * assembling its own resolver (and one of them forgetting the block source).
         */
        fun wiredTo(
            friendshipCache: FriendshipCache,
            blockCache: BlockCache,
            currentUserId: () -> String?,
        ): UserRelationshipResolver = UserRelationshipResolver(
            friendshipCache = friendshipCache,
            blockStatus = BlockStatusProvider { blockCache.isBlocked(it) },
            currentUserId = currentUserId,
        )
    }
}
